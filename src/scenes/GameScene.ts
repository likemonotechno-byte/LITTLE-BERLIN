import Phaser from 'phaser';
import type { ConnectorZone, InteractionZone, LoadedProject, LoadedScene, NavPolygon } from '../core/SceneManifest';
import { publicAssetPath } from '../core/SceneManifestLoader';
import { UniversalIsoMath } from '../core/UniversalIsoMath';
import { PolygonNavMesh } from '../navigation/PolygonNavMesh';
import { MultiTierDepthSorter, type DepthSortItem } from '../rendering/MultiTierDepthSorter';
import { approachCutawayAlpha, targetCutawayAlpha } from '../rendering/CutawayController';
import type { TiledDepthObject } from '../tiled/TiledNavigationExtractor';
import { cutawayProfileFromTiledProperties, isActorDepthTileLayer, resolveTilesetFrame, buildRadialCutawayBinding } from '../tiled/TiledDepthLayer';
import { RADIAL_CUTAWAY_PIPELINE_KEY, RadialCutawayPostFXPipeline } from '../rendering/RadialCutawayPostFXPipeline';
import type { CutawayProfile } from '../rendering/CutawayController';
import type { ImportedTiledLayer } from '../tiled/TiledJsonImporter';

export type InteractionAction = { id: string; label: string; kind: 'close' | 'travel' | 'buy-ticket'; targetSceneId?: string };
export type InteractionPayload = { kind: string; title: string; description: string; actions: InteractionAction[] };

interface TouchVector { dx: number; dy: number }
interface WorldMeters { x: number; y: number }
type DepthTarget = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Depth;

/**
 * First Phaser runtime scene. Scene-specific data is read from manifests; this class
 * does not contain map-ID-specific coordinate constants or hotspots.
 */
export class GameScene extends Phaser.Scene {
  private readonly project: LoadedProject;
  private readonly bus: Phaser.Events.EventEmitter;
  private readonly depthSorter = new MultiTierDepthSorter();
  private readonly sceneById: Map<string, LoadedScene>;
  private activeScene!: LoadedScene;
  private navmesh!: PolygonNavMesh;
  private backdrop?: Phaser.GameObjects.Image;
  private player!: Phaser.GameObjects.Sprite;
  private debugGraphics!: Phaser.GameObjects.Graphics;
  private overlayGraphics!: Phaser.GameObjects.Graphics;
  private slices: Phaser.GameObjects.Image[] = [];
  private tilemapLayers: Phaser.Tilemaps.TilemapLayer[] = [];
  private tiledObjectSprites: Array<{ sprite: Phaser.GameObjects.Sprite; meta: TiledDepthObject; baseAlpha: number; shaderCutaway: boolean }> = [];
  private radialCutawayAvailable = false;
  private touchVector: TouchVector = { dx: 0, dy: 0 };
  private path: Array<[number, number]> = [];
  private directionIndex = 4;
  private showDebug = true;
  private showHotspots = true;
  private showCutaway = true;
  private userZoom = 1;
  private lastHudUpdate = 0;
  private moneyEur = 14.5;
  private hasTicketAB = false;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyTab!: Phaser.Input.Keyboard.Key;

  constructor(project: LoadedProject, bus: Phaser.Events.EventEmitter) {
    super({ key: 'GameScene' });
    this.project = project;
    this.bus = bus;
    this.sceneById = new Map(project.scenes.map((scene) => [scene.id, scene]));
  }

  preload(): void {
    for (const scene of this.project.scenes) {
      if (scene.renderSpace.mode === 'pre-rendered-stage') {
        if (!scene.baseBackdropImage) throw new Error(`${scene.id}: Pre-rendered-Stage benötigt baseBackdropImage.`);
        this.load.image(`stage:${scene.id}`, publicAssetPath(this.project.baseUrl, scene.baseBackdropImage));
        for (const slice of scene.foregroundSlices) {
          this.load.image(`slice:${slice.id}`, publicAssetPath(this.project.baseUrl, slice.image));
        }
      }
      scene.tiledMap?.tilesets.forEach((tileset, index) => {
        // A spritesheet preserves atlas frame indices for both tile layers and Tiled tile-objects.
        this.load.spritesheet(this.tiledTextureKey(scene.id, index), publicAssetPath(this.project.baseUrl, tileset.imagePath), {
          frameWidth: tileset.tilewidth, frameHeight: tileset.tileheight,
          margin: tileset.margin ?? 0, spacing: tileset.spacing ?? 0,
        });
      });
    }
    this.load.spritesheet(
      'player-sheet',
      publicAssetPath(this.project.baseUrl, this.project.index.sharedAssets.playerSheet),
      { frameWidth: 64, frameHeight: 96 },
    );
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      this.bus.emit('hud:status', `Asset konnte nicht geladen werden: ${file.key}`);
    });
  }

  create(): void {
    this.registerRadialCutawayPipeline();
    this.input.mouse?.disableContextMenu();
    this.createPlayerAnimations();
    this.debugGraphics = this.add.graphics().setDepth(9000);
    this.overlayGraphics = this.add.graphics().setDepth(10000);
    this.player = this.add.sprite(0, 0, 'player-sheet', this.directionIndex * 4)
      .setOrigin(0.5, 88 / 96)
      .setDepth(800);

    this.keys = this.input.keyboard?.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<string, Phaser.Input.Keyboard.Key>;
    this.keyE = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyTab = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
    this.input.keyboard?.addCapture([Phaser.Input.Keyboard.KeyCodes.UP, Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.LEFT, Phaser.Input.Keyboard.KeyCodes.RIGHT, Phaser.Input.Keyboard.KeyCodes.TAB]);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const target = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const path = this.navmesh.findPath(this.player.x, this.player.y, target.x, target.y);
      if (path.length > 0) {
        this.path = path;
        this.bus.emit('hud:status', 'Wegziel gesetzt · Navigation prüft begehbare Flächen und Hindernisse.');
      } else {
        this.bus.emit('hud:status', 'Kein erreichbarer Weg an dieser Position.');
      }
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.fitCamera(false));
    this.bus.on('scene:request', (sceneId: string) => this.activateScene(sceneId));
    this.bus.on('touch:move', (vector: TouchVector) => { this.touchVector = vector; });
    this.bus.on('ui:toggle-debug', () => {
      this.showDebug = !this.showDebug;
      this.bus.emit('hud:debug-state', this.showDebug);
      this.bus.emit('hud:status', `Geometrie-Overlay ${this.showDebug ? 'aktiviert' : 'deaktiviert'}.`);
    });
    this.bus.on('ui:toggle-hotspots', () => {
      this.showHotspots = !this.showHotspots;
      this.bus.emit('hud:hotspots-state', this.showHotspots);
      this.bus.emit('hud:status', `Interaktions-Hotspots ${this.showHotspots ? 'aktiviert' : 'deaktiviert'}.`);
    });
    this.bus.on('ui:toggle-cutaway', () => {
      this.showCutaway = !this.showCutaway;
      this.bus.emit('hud:cutaway-state', this.showCutaway);
      this.bus.emit('hud:status', `Occluder-Cutaway ${this.showCutaway ? 'aktiviert' : 'deaktiviert'}.`);
    });
    this.bus.on('ui:center-camera', () => this.fitCamera(true));
    this.bus.on('ui:zoom', (direction: number) => {
      this.userZoom = Phaser.Math.Clamp(this.userZoom * (direction > 0 ? 1.16 : 1 / 1.16), 0.65, 2.7);
      this.fitCamera(true);
    });
    this.bus.on('interaction:action', (action: InteractionAction) => this.handleInteractionAction(action));
    this.bus.on('interaction:keyboard', () => this.interact());

    this.activateScene(this.project.defaultScene, false);
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    if (Phaser.Input.Keyboard.JustDown(this.keyE)) this.interact();
    if (Phaser.Input.Keyboard.JustDown(this.keyTab)) {
      this.showDebug = !this.showDebug;
      this.bus.emit('hud:debug-state', this.showDebug);
    }

    const direct = this.getDirectMovement();
    if (direct.dx !== 0 || direct.dy !== 0) {
      this.path = [];
      const magnitude = Math.hypot(direct.dx, direct.dy) || 1;
      const dx = (direct.dx / magnitude) * 210 * dt;
      const dy = (direct.dy / magnitude) * 210 * dt;
      const next = this.navmesh.resolveStep(this.player.x, this.player.y, this.player.x + dx, this.player.y + dy);
      this.player.setPosition(next.x, next.y);
      this.updateFacing(dx, dy);
    } else if (this.path.length > 0) {
      const [targetX, targetY] = this.path[0];
      const dx = targetX - this.player.x;
      const dy = targetY - this.player.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 8) {
        this.path.shift();
      } else {
        const step = Math.min(distance, 210 * dt);
        const mx = (dx / distance) * step;
        const my = (dy / distance) * step;
        const next = this.navmesh.resolveStep(this.player.x, this.player.y, this.player.x + mx, this.player.y + my);
        if (next.hit && next.x === this.player.x && next.y === this.player.y) this.path = [];
        else this.player.setPosition(next.x, next.y);
        this.updateFacing(mx, my);
      }
    } else {
      this.player.anims.stop();
      this.player.setFrame(this.directionIndex * 4);
    }

    this.updateCutaways(dt);
    this.applyDepthSort();
    this.drawOverlays();
    if (_time - this.lastHudUpdate > 100) {
      this.lastHudUpdate = _time;
      const world = this.stagePixelToWorldMeters(this.player.x, this.player.y, this.activeScene);
      this.bus.emit('hud:telemetry', {
        sceneId: this.activeScene.id,
        displayName: this.activeScene.displayName,
        levelLabel: this.activeScene.display.levelLabel,
        xPx: Math.round(this.player.x), yPx: Math.round(this.player.y),
        xMeters: world.x, yMeters: world.y, zMeters: this.activeScene.display.zMeters,
        moneyEur: this.moneyEur, hasTicketAB: this.hasTicketAB,
      });
    }
  }

  private tiledTextureKey(sceneId: string, tilesetIndex: number): string {
    return `tiled-texture:${sceneId}:${tilesetIndex}`;
  }

  /**
   * Registers the radial roof shader when WebGL is available. Phaser's Canvas
   * renderer remains supported and uses the alpha-fade fallback.
   */
  private registerRadialCutawayPipeline(): void {
    const renderer = this.game.renderer;
    if (renderer.type !== Phaser.WEBGL) return;
    const pipelines = (renderer as Phaser.Renderer.WebGL.WebGLRenderer).pipelines;
    try {
      // Phaser 3.90's PipelineManager stores registered Post FX classes in this map;
      // hasPostPipeline is a Game Object property, not a PipelineManager method.
      if (!pipelines.postPipelineClasses.has(RADIAL_CUTAWAY_PIPELINE_KEY)) {
        pipelines.addPostPipeline(RADIAL_CUTAWAY_PIPELINE_KEY, RadialCutawayPostFXPipeline);
      }
      this.radialCutawayAvailable = pipelines.postPipelineClasses.has(RADIAL_CUTAWAY_PIPELINE_KEY);
    } catch (error) {
      this.radialCutawayAvailable = false;
      this.bus.emit('hud:status', `Radialer Cutaway-Shader nicht verfügbar; nutze Alpha-Fallback. ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private configureRadialCutaway(
    sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite,
    profile: CutawayProfile | undefined,
    baseAlpha: number,
  ): boolean {
    sprite.setData('kbBaseAlpha', baseAlpha);
    sprite.setData('kbRadialCutaway', null);
    sprite.setData('kbUsesRadialCutaway', false);
    if (!profile || !this.radialCutawayAvailable) return false;
    try {
      sprite.setData('kbCutawayProfile', profile);
      sprite.setData('kbRadialCutaway', buildRadialCutawayBinding(false, 0, 0, profile));
      sprite.setPostPipeline(RADIAL_CUTAWAY_PIPELINE_KEY);
      sprite.setData('kbUsesRadialCutaway', true);
      return true;
    } catch (error) {
      sprite.resetPostPipeline();
      this.bus.emit('hud:status', `Cutaway-Shader konnte nicht gebunden werden; Alpha-Fallback aktiv. ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private layerNumber(properties: ImportedTiledLayer['properties'], key: string, fallback: number): number {
    const value = properties?.find((property) => property.name === key)?.value;
    const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private layerIds(properties: ImportedTiledLayer['properties'], key: string, sceneId: string): string[] {
    const value = properties?.find((property) => property.name === key)?.value;
    const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[;,]/) : [];
    return values.map((entry) => String(entry).trim()).filter(Boolean)
      .map((id) => /^\d+$/.test(id) ? `tiled-${sceneId}-obj-${id}` : id);
  }

  /**
   * A TilemapLayer cannot be interleaved with an actor. For actor-depth layers we
   * retain Phaser's tilemap as the coordinate/layout authority, then split its
   * occupied cells into sprites so each cell can enter the same DAG as the player.
   */
  private createDepthSortedTileSprites(
    scene: LoadedScene,
    layerSpec: ImportedTiledLayer,
    layer: Phaser.Tilemaps.TilemapLayer,
    layerIndex: number,
  ): void {
    const imported = scene.tiledMap;
    if (!imported) return;
    const properties = layerSpec.properties;
    const cutaway = cutawayProfileFromTiledProperties(properties);
    const declaredRole = String(properties?.find((property) => property.name === 'renderRole')?.value ?? '').toLowerCase();
    const renderRole = declaredRole || (/roof/i.test(layerSpec.name) ? 'roof' : 'foreground');
    const tier = this.layerNumber(properties, 'tier', this.layerNumber(properties, 'tierId', scene.tiers[0]?.id ?? 0));
    const layerOpacity = Phaser.Math.Clamp(layerSpec.opacity, 0, 1);
    let createdCount = 0;
    layer.setVisible(false);

    layer.forEachTile((tile) => {
      if (!tile || tile.index <= 0) return;
      const resolved = resolveTilesetFrame(tile.index, imported.tilesets);
      if (!resolved) {
        this.bus.emit('hud:status', `${scene.id}/${layerSpec.name}: GID ${tile.index} hat kein Tileset; Tile wurde ausgelassen.`);
        return;
      }
      const tilesetOffset = resolved.tileset.tileoffset ?? { x: 0, y: 0 };
      const tileWidth = resolved.tileset.tilewidth;
      const tileHeight = resolved.tileset.tileheight;
      const layerX = Number.isFinite(layer.x) ? layer.x : (layerSpec.offsetx ?? 0);
      const layerY = Number.isFinite(layer.y) ? layer.y : (layerSpec.offsety ?? 0);
      const x = layerX + tile.pixelX + tileWidth / 2 + tilesetOffset.x;
      const y = layerY + tile.pixelY + tileHeight / 2 + tilesetOffset.y;
      const sprite = this.add.sprite(x, y, this.tiledTextureKey(scene.id, resolved.tilesetIndex), resolved.frame)
        .setOrigin(0.5, 0.5)
        .setAlpha(layerOpacity);
      if ('flipX' in tile || 'flipY' in tile) {
        sprite.setFlip(Boolean((tile as Phaser.Tilemaps.Tile).flipX), Boolean((tile as Phaser.Tilemaps.Tile).flipY));
      }
      const rotation = (tile as Phaser.Tilemaps.Tile & { rotation?: number }).rotation;
      if (typeof rotation === 'number' && Number.isFinite(rotation)) sprite.setRotation(rotation);
      const bounds = sprite.getBounds();
      const cellId = `tiled-layer-${scene.id}-${layerSpec.id ?? layerIndex}-${tile.x}-${tile.y}`;
      const meta: TiledDepthObject = {
        id: cellId,
        objectId: -((layerSpec.id ?? layerIndex + 1) * 100000 + tile.y * Math.max(1, imported.data.width) + tile.x + 1),
        layerId: layerSpec.id,
        name: `${layerSpec.name} tile ${tile.x},${tile.y}`,
        tier,
        footSy: bounds.bottom,
        bounds: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom },
        before: this.layerIds(properties, 'depthBefore', scene.id),
        after: this.layerIds(properties, 'depthAfter', scene.id),
        renderRole,
        sourceLayer: layerSpec.name,
        ...(cutaway ? { cutaway } : {}),
      };
      const shaderCutaway = this.configureRadialCutaway(sprite, cutaway, layerOpacity);
      this.tiledObjectSprites.push({ sprite, meta, baseAlpha: layerOpacity, shaderCutaway });
      createdCount++;
    });

    if (createdCount === 0) {
      this.bus.emit('hud:status', `${scene.id}: Tiefen-Layer '${layerSpec.name}' enthält keine renderbaren Tiles.`);
    }
  }

  /** Builds Phaser's native isometric tilemap and promotes foreground/roof cells to sprites. */
  private createTiledLayers(scene: LoadedScene): void {
    const imported = scene.tiledMap;
    if (!imported) throw new Error(`${scene.id}: Szene ohne importierte Tiled-Map.`);
    const hasRenderableTiles = imported.layers.some((layer) => layer.type === 'tilelayer' && layer.visible)
      || imported.layers.some((layer) => layer.type === 'objectgroup' && layer.visible && (layer.objects ?? []).some((object) => typeof object.gid === 'number' && object.gid > 0));
    // A legacy-stage Tiled overlay can be authoritative for navigation only; its image is already drawn by the stage renderer.
    if (!hasRenderableTiles) return;
    const cacheKey = `tiled-map:${scene.id}`;
    if (!this.cache.tilemap.exists(cacheKey)) {
      this.cache.tilemap.add(cacheKey, {
        format: Phaser.Tilemaps.Formats.TILED_JSON,
        data: imported.data,
      });
    }
    const tilemap = this.add.tilemap(cacheKey);
    const tilesets = imported.tilesets.map((tileset, index) => tilemap.addTilesetImage(
      tileset.name,
      this.tiledTextureKey(scene.id, index),
      tileset.tilewidth,
      tileset.tileheight,
      tileset.margin ?? 0,
      tileset.spacing ?? 0,
      tileset.firstgid,
      tileset.tileoffset ?? { x: 0, y: 0 },
    )).filter((tileset): tileset is Phaser.Tilemaps.Tileset => tileset !== null);
    if (tilesets.length === 0) throw new Error(`${scene.id}: kein Tiled-Tileset konnte an Texturen gebunden werden.`);
    const visibleTileLayers = imported.layers.filter((layer) => layer.type === 'tilelayer' && layer.visible);
    for (let index = 0; index < visibleTileLayers.length; index++) {
      const layerSpec = visibleTileLayers[index];
      let layer: Phaser.Tilemaps.TilemapLayer | null = null;
      const names = [...new Set([layerSpec.name, layerSpec.raw.name])];
      for (const layerName of names) {
        layer = tilemap.createLayer(layerName, tilesets, layerSpec.offsetx ?? 0, layerSpec.offsety ?? 0);
        if (layer) break;
      }
      if (!layer) throw new Error(`${scene.id}: Tiled-Layer '${layerSpec.name}' konnte nicht erstellt werden.`);
      this.tilemapLayers.push(layer);
      if (isActorDepthTileLayer(layerSpec.name, layerSpec.properties)) {
        this.createDepthSortedTileSprites(scene, layerSpec, layer, index);
        continue;
      }
      layer.setDepth(-1000 + index);
      layer.setAlpha(Phaser.Math.Clamp(layerSpec.opacity, 0, 1));
      layer.setVisible(layerSpec.visible);
    }

    // Render tile-objects as independent Phaser sprites so the depth DAG can order them
    // against the player. Geometry-only object groups remain navigation/trigger data.
    for (const objectLayer of imported.layers.filter((layer) => layer.type === 'objectgroup' && layer.visible)) {
      for (const object of objectLayer.objects ?? []) {
        if (object.visible === false || typeof object.gid !== 'number' || object.gid <= 0) continue;
        const layerNames = [...new Set([objectLayer.name, objectLayer.raw.name])];
        let created: Phaser.GameObjects.GameObject[] = [];
        for (const layerName of layerNames) {
          created = tilemap.createFromObjects(layerName, { id: object.id });
          if (created.length > 0) break;
        }
        const sprite = created.find((item): item is Phaser.GameObjects.Sprite => item instanceof Phaser.GameObjects.Sprite);
        if (!sprite) continue;
        const meta = scene.tiledDepthObjects?.find((candidate) => candidate.objectId === object.id && candidate.sourceLayer === objectLayer.name)
          ?? scene.tiledDepthObjects?.find((candidate) => candidate.objectId === object.id);
        if (!meta) {
          sprite.destroy();
          continue;
        }
        sprite.setName(meta.id).setDepth(50);
        const shaderCutaway = this.configureRadialCutaway(sprite, meta.cutaway, 1);
        this.tiledObjectSprites.push({ sprite, meta, baseAlpha: 1, shaderCutaway });
      }
    }
  }

  private createPlayerAnimations(): void {
    for (let direction = 0; direction < 8; direction++) {
      const key = `player-walk-${direction}`;
      if (this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers('player-sheet', { start: direction * 4, end: direction * 4 + 3 }),
        frameRate: 8,
        repeat: -1,
      });
    }
  }

  private activateScene(sceneId: string, animate = true): void {
    const nextScene = this.sceneById.get(sceneId);
    if (!nextScene) {
      this.bus.emit('hud:status', `Szene unbekannt: ${sceneId}`);
      return;
    }
    const doActivate = () => {
      this.backdrop?.destroy();
      this.backdrop = undefined;
      this.slices.forEach((slice) => slice.destroy());
      this.slices = [];
      this.tiledObjectSprites.forEach(({ sprite }) => sprite.destroy());
      this.tiledObjectSprites = [];
      this.tilemapLayers.forEach((layer) => layer.destroy());
      this.tilemapLayers = [];
      this.activeScene = nextScene;
      this.navmesh = new PolygonNavMesh(nextScene.navmesh);
      if (nextScene.renderSpace.mode === 'pre-rendered-stage') {
        this.backdrop = this.add.image(0, 0, `stage:${nextScene.id}`).setOrigin(0, 0)
          .setDisplaySize(nextScene.renderSpace.widthPx, nextScene.renderSpace.heightPx)
          .setDepth(0);
        for (const sliceSpec of nextScene.foregroundSlices) {
          const slice = this.add.image(sliceSpec.xPx, sliceSpec.yPx, `slice:${sliceSpec.id}`)
            .setOrigin(0, 0)
            .setDisplaySize(sliceSpec.widthPx, sliceSpec.heightPx)
            .setDepth(sliceSpec.footSy);
          this.configureRadialCutaway(slice, sliceSpec.cutaway, 1);
          this.slices.push(slice);
        }
      }
      if (nextScene.tiledMap) this.createTiledLayers(nextScene);
      this.player.setPosition(nextScene.spawn.xPx, nextScene.spawn.yPx);
      this.player.setScale((nextScene.display.scale || 1) * 1.45);
      this.player.setFrame(this.directionIndex * 4);
      this.path = [];
      this.cameras.main.stopFollow();
      this.fitCamera(true);
      this.bus.emit('hud:scene-changed', { id: nextScene.id, name: nextScene.displayName, level: nextScene.display.levelLabel });
      const navigationSummary = `Szene ${nextScene.id} aus Manifest geladen · ${nextScene.navmesh.walkable_polygons.length} begehbare Polygone.`;
      const diagnosticSummary = nextScene.navigationDiagnostics?.length ? ` Hinweise: ${nextScene.navigationDiagnostics.join(' ')}` : '';
      this.bus.emit('hud:status', `${navigationSummary}${diagnosticSummary}`);
      const world = this.stagePixelToWorldMeters(this.player.x, this.player.y, nextScene);
      this.bus.emit('hud:telemetry', {
        sceneId: nextScene.id, displayName: nextScene.displayName, levelLabel: nextScene.display.levelLabel,
        xPx: Math.round(this.player.x), yPx: Math.round(this.player.y),
        xMeters: world.x, yMeters: world.y,
        zMeters: nextScene.display.zMeters, moneyEur: this.moneyEur, hasTicketAB: this.hasTicketAB,
      });
      if (animate) this.cameras.main.fadeIn(140, 2, 6, 14);
    };
    if (animate && this.activeScene) {
      this.cameras.main.fadeOut(140, 2, 6, 14);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, doActivate);
    } else {
      doActivate();
    }
  }

  private fitCamera(centerOnPlayer: boolean): void {
    if (!this.activeScene || !this.player) return;
    const camera = this.cameras.main;
    const width = this.activeScene.renderSpace.widthPx;
    const height = this.activeScene.renderSpace.heightPx;
    const fitScale = Math.min(this.scale.width / width, this.scale.height / height);
    // Deliberately leave camera bounds open: a portrait viewport can be taller than the stage.
    // Open bounds let the stage stay centered on the player, matching the V0.3 camera math.
    camera.setZoom(Math.max(0.05, fitScale * this.userZoom));
    if (centerOnPlayer) camera.centerOn(this.player.x, this.player.y);
    camera.startFollow(this.player, true, 0.08, 0.08);
  }

  private getDirectMovement(): TouchVector {
    let dx = this.touchVector.dx;
    let dy = this.touchVector.dy;
    if (this.keys?.up?.isDown) dy -= 1;
    if (this.keys?.down?.isDown) dy += 1;
    if (this.keys?.left?.isDown) dx -= 1;
    if (this.keys?.right?.isDown) dx += 1;
    if (this.keys?.w?.isDown) dy -= 1;
    if (this.keys?.s?.isDown) dy += 1;
    if (this.keys?.a?.isDown) dx -= 1;
    if (this.keys?.d?.isDown) dx += 1;
    return { dx, dy };
  }

  private updateFacing(dx: number, dy: number): void {
    if (Math.abs(dx) + Math.abs(dy) < 0.01) return;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const shifted = (angle + 90 + 360 + 22.5) % 360;
    this.directionIndex = Math.floor(shifted / 45) % 8;
    const animationKey = `player-walk-${this.directionIndex}`;
    if (this.player.anims.currentAnim?.key !== animationKey) this.player.play(animationKey, true);
  }

  /** Soft cutaway uses a radial WebGL mask when available and alpha interpolation otherwise. */
  private updateCutaways(deltaSeconds: number): void {
    const actor = { x: this.player.x, footSy: this.player.y };
    for (let index = 0; index < this.slices.length; index++) {
      const sprite = this.slices[index];
      const spec = this.activeScene.foregroundSlices[index];
      const bounds = { left: spec.xPx, top: spec.yPx, right: spec.xPx + spec.widthPx, bottom: spec.yPx + spec.heightPx };
      this.updateCutawaySprite(sprite, spec.cutaway, bounds, spec.footSy, 1, deltaSeconds, actor.x, actor.footSy);
    }

    for (const { sprite, meta, baseAlpha, shaderCutaway } of this.tiledObjectSprites) {
      const bounds = sprite.getBounds();
      this.updateCutawaySprite(sprite, meta.cutaway,
        { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom },
        meta.footSy || bounds.bottom, baseAlpha, deltaSeconds, actor.x, actor.footSy, shaderCutaway);
    }
  }

  private updateCutawaySprite(
    sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite,
    profile: CutawayProfile | undefined,
    bounds: { left: number; top: number; right: number; bottom: number },
    footSy: number,
    baseAlpha: number,
    deltaSeconds: number,
    actorX: number,
    actorFootSy: number,
    shaderCutaway = sprite.getData('kbUsesRadialCutaway') === true,
  ): void {
    const target = profile && this.showCutaway
      ? targetCutawayAlpha(profile, { bounds, footSy }, { x: actorX, footSy: actorFootSy })
      : 1;
    if (profile && shaderCutaway && this.radialCutawayAvailable) {
      sprite.setData('kbRadialCutaway', buildRadialCutawayBinding(target < 0.999, actorX, actorFootSy, profile));
      sprite.setAlpha(baseAlpha);
      return;
    }
    const currentNormalized = baseAlpha > 0 ? sprite.alpha / baseAlpha : 1;
    sprite.setAlpha(baseAlpha * approachCutawayAlpha(currentNormalized, target, deltaSeconds));
  }

  private applyDepthSort(): void {
    const tier = this.activeScene.tiers[0]?.id ?? 0;
    const items: DepthSortItem<DepthTarget>[] = [];
    for (let index = 0; index < this.slices.length; index++) {
      const object = this.slices[index];
      const spec = this.activeScene.foregroundSlices[index];
      items.push({
        id: spec.id, tier, footSy: spec.footSy,
        bounds: { left: spec.xPx, top: spec.yPx, right: spec.xPx + spec.widthPx, bottom: spec.yPx + spec.heightPx },
        payload: object,
      });
    }
    let forcedFrontIndex = 0;
    for (const { sprite, meta } of this.tiledObjectSprites) {
      const role = meta.renderRole.toLowerCase();
      if (role === 'always-front') {
        sprite.setDepth(5000 + forcedFrontIndex++);
        continue;
      }
      const bounds = sprite.getBounds();
      items.push({
        id: meta.id,
        tier: meta.tier,
        footSy: bounds.bottom || meta.footSy,
        bounds: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom },
        before: meta.before,
        after: meta.after,
        payload: sprite,
      });
    }
    const scale = (this.activeScene.display.scale || 1) * 1.45;
    const playerWidth = 64 * scale;
    const playerHeight = 96 * scale;
    items.push({
      id: 'dynamic-player', tier, footSy: this.player.y,
      bounds: {
        left: this.player.x - playerWidth / 2,
        top: this.player.y - 88 * scale,
        right: this.player.x + playerWidth / 2,
        bottom: this.player.y - 88 * scale + playerHeight,
      },
      payload: this.player,
    });
    const result = this.depthSorter.sort(items);
    result.items.forEach((item, index) => item.payload.setDepth(index + 1));
    if (result.hadCycle) this.bus.emit('hud:status', `Depth-Sort-Zyklus abgefangen: ${result.cyclicIds.join(', ')}`);
  }

  private drawOverlays(): void {
    this.debugGraphics.clear();
    this.overlayGraphics.clear();
    if (this.showDebug) {
      for (const polygon of this.navmesh.walkablePolygons) {
        this.drawPolygon(this.debugGraphics, polygon, 0x10b981, 0.15, 0x34d399, 0.7);
      }
      for (const obstacle of this.navmesh.obstacles) {
        this.drawPolygon(this.debugGraphics, obstacle, 0xef4444, 0.28, 0xf87171, 0.9);
      }
      for (const connector of this.navmesh.connectors) {
        const isLift = connector.type.toLowerCase().includes('elevator') || connector.type.toLowerCase().includes('lift');
        this.drawPolygon(this.debugGraphics, { points_px: connector.trigger_polygon_px },
          isLift ? 0xf59e0b : 0x38bdf8, 0.28, isLift ? 0xfbbf24 : 0x38bdf8, 0.95);
      }
    }
    if (this.path.length > 0) {
      this.overlayGraphics.lineStyle(3.5, 0x34d399, 1);
      this.overlayGraphics.beginPath();
      this.overlayGraphics.moveTo(this.player.x, this.player.y);
      for (const point of this.path) this.overlayGraphics.lineTo(point[0], point[1]);
      this.overlayGraphics.strokePath();
      const finalPoint = this.path[this.path.length - 1];
      this.overlayGraphics.lineStyle(3, 0x10b981, 1).strokeCircle(finalPoint[0], finalPoint[1], 12);
    }
    if (this.showHotspots) {
      for (const interaction of this.navmesh.interactions) {
        const [x, y] = interaction.position_px;
        const near = Math.hypot(this.player.x - x, this.player.y - y) <= interaction.radius_px + 55;
        this.overlayGraphics.fillStyle(near ? 0x10b981 : 0xf59e0b, near ? 0.22 : 0.12);
        this.overlayGraphics.fillCircle(x, y, interaction.radius_px * 0.65);
        this.overlayGraphics.lineStyle(near ? 4 : 2, near ? 0x34d399 : 0xfbbf24, 0.95);
        this.overlayGraphics.strokeCircle(x, y, interaction.radius_px * 0.65);
      }
    }
  }

  private drawPolygon(
    graphics: Phaser.GameObjects.Graphics,
    polygon: Pick<NavPolygon, 'points_px'>,
    fillColor: number,
    fillAlpha: number,
    lineColor: number,
    lineAlpha: number,
  ): void {
    const points = polygon.points_px.map(([x, y]) => new Phaser.Geom.Point(x, y));
    graphics.fillStyle(fillColor, fillAlpha).fillPoints(points, true);
    graphics.lineStyle(1.8, lineColor, lineAlpha).strokePoints(points, true);
  }

  private interact(): void {
    const interaction = this.navmesh.getNearestInteraction(this.player.x, this.player.y);
    if (interaction) {
      this.openInteraction(interaction.zone);
      return;
    }
    const connector = this.navmesh.getNearestConnector(this.player.x, this.player.y);
    if (connector) {
      this.openConnector(connector.zone);
      return;
    }
    this.bus.emit('hud:status', 'Kein Interaktionspunkt in Reichweite. Bewege dich näher an einen markierten Hotspot oder Übergang.');
  }

  private openInteraction(zone: InteractionZone): void {
    const isTicket = zone.interaction_id === 'INT-CON-TICKETS';
    const actions: InteractionAction[] = isTicket && !this.hasTicketAB && this.moneyEur >= 3.5
      ? [{ id: 'buy-ticket', label: 'Einzelfahrschein Berlin AB kaufen (3,50 €)', kind: 'buy-ticket' }, { id: 'close', label: 'Schließen', kind: 'close' }]
      : [{ id: 'close', label: 'Schließen', kind: 'close' }];
    const description = isTicket && this.hasTicketAB
      ? `${zone.description}\n\nEinzelfahrschein Berlin AB: bereits gelöst.`
      : zone.description;
    this.bus.emit('hud:interaction-open', { kind: zone.type, title: zone.title || zone.name, description, actions } satisfies InteractionPayload);
  }

  private openConnector(zone: ConnectorZone): void {
    const isElevator = zone.type.toLowerCase().includes('elevator') || zone.type.toLowerCase().includes('lift');
    const actions: InteractionAction[] = [];
    if (isElevator) {
      for (const scene of this.project.scenes) {
        if (scene.id !== this.activeScene.id) actions.push({ id: `travel-${scene.id}`, label: `${scene.display.levelLabel} · ${scene.displayName}`, kind: 'travel', targetSceneId: scene.id });
      }
    } else if (zone.target_map && this.sceneById.has(zone.target_map)) {
      const target = this.sceneById.get(zone.target_map)!;
      actions.push({ id: `travel-${target.id}`, label: `Wechsel zu ${target.displayName}`, kind: 'travel', targetSceneId: target.id });
    }
    actions.push({ id: 'close', label: 'Schließen', kind: 'close' });
    this.bus.emit('hud:interaction-open', {
      kind: zone.type,
      title: zone.label || `Ebenenübergang ${zone.connector_id}`,
      description: `Verbindung ${zone.connector_id}. Die tatsächliche Geometrie ist im Connector-Register dokumentiert; Messstatus und Zugänglichkeit können je Verbindung abweichen.`,
      actions,
    } satisfies InteractionPayload);
  }

  private handleInteractionAction(action: InteractionAction): void {
    if (action.kind === 'close') {
      this.bus.emit('hud:interaction-close');
      return;
    }
    if (action.kind === 'travel' && action.targetSceneId) {
      this.bus.emit('hud:interaction-close');
      this.activateScene(action.targetSceneId);
      return;
    }
    if (action.kind === 'buy-ticket') {
      if (this.hasTicketAB) {
        this.bus.emit('hud:status', 'Einzelfahrschein Berlin AB wurde bereits gekauft.');
        return;
      }
      if (this.moneyEur < 3.5) {
        this.bus.emit('hud:status', 'Nicht genügend Guthaben für den Fahrschein.');
        return;
      }
      this.moneyEur = Math.round((this.moneyEur - 3.5) * 100) / 100;
      this.hasTicketAB = true;
      this.bus.emit('hud:interaction-open', {
        kind: 'ticket', title: 'Fahrschein Berlin AB gelöst',
        description: 'Der Einzelfahrschein wurde im Prototyp-Spielzustand verbucht. Persistenz und reale Tariflogik sind noch nicht Teil dieser Engine-Migration.',
        actions: [{ id: 'close', label: 'Schließen', kind: 'close' }],
      } satisfies InteractionPayload);
      this.bus.emit('hud:status', 'Einzelfahrschein Berlin AB gekauft · Guthaben aktualisiert.');
    }
  }

  private stagePixelToWorldMeters(px: number, py: number, scene: LoadedScene): WorldMeters {
    if (scene.renderSpace.mode === 'projected-world') {
      const tierId = scene.tiers[0]?.id ?? 0;
      const world = new UniversalIsoMath(scene.grid).screenToWorld(px, py, tierId);
      return { x: world.xMeters, y: world.yMeters };
    }
    const mapping = scene.worldMapping;
    if (!mapping) throw new Error(`${scene.id}: Legacy-Stage benötigt worldMapping.`);
    if (mapping.type === 'linear-rect') {
      return {
        x: Phaser.Math.Clamp(((px - mapping.xOriginPx) / mapping.xSpanPx) * mapping.xMeters, 0, mapping.xMeters),
        y: Phaser.Math.Clamp(((py - mapping.yOriginPx) / mapping.ySpanPx) * mapping.yMeters, 0, mapping.yMeters),
      };
    }
    const dx = px - mapping.originXPx;
    const dy = py - mapping.originYPx;
    const u = (dx / mapping.pixelPerMacroU + dy / mapping.pixelPerMacroV) * 0.5;
    const v = (dy / mapping.pixelPerMacroV - dx / mapping.pixelPerMacroU) * 0.5;
    return {
      x: Phaser.Math.Clamp(u * mapping.macroTileMeters, 0, mapping.maxXMeters),
      y: Phaser.Math.Clamp(v * mapping.macroTileMeters, 0, mapping.maxYMeters),
    };
  }
}
