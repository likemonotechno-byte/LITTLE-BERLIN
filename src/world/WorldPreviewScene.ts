import Phaser from 'phaser';
import type {
  AssetDefinition,
  AssetInstance,
  GeometryFeature,
  LoadedWorldProject,
  ModuleDocument,
  Point2,
  WorldModuleReference,
  WorldPoint3,
} from './WorldModel.ts';
import { worldToModuleLocal } from './WorldModel.ts';
import { IsoProjector, type ProjectedBounds, type ScreenPoint } from './IsoProjector.ts';
import {
  createAssetInstance,
  createRectangleFeature,
  createRoadFeature,
  findAssetInstanceAtPoint,
  findFeatureAtPoint,
  findSnapTarget,
  findVertexHandleAtPoint,
  nextEditorGeometryId,
  type RectangleFeatureKind,
  type VertexHandle,
  type WorldEditorTool,
} from './WorldEditorModel.ts';
import { createWorldDraftBundle, type WorldDraftBundle } from './WorldDraft.ts';
import {
  BERLIN_ROAD_PROFILES,
  deriveRoadNetwork,
  type RoadProfileId,
} from '../geometry/RoadNetwork.ts';

type PreviewStatus = (message: string) => void;
type RenderPoint = Phaser.Math.Vector2;

export interface SelectionInfo {
  feature?: GeometryFeature | null;
  entity?: AssetInstance | null;
  moduleId?: string;
}

const FEATURE_COLORS: Record<GeometryFeature['kind'], number> = {
  'road-centerline': 0x3a4656,
  walkway: 0x8a949b,
  waterway: 0x307f9b,
  parcel: 0x9d8a53,
  'building-footprint': 0xc17d57,
  plaza: 0x87919a,
  park: 0x3f7956,
  'walkable-area': 0x368f9b,
  'collision-area': 0xc04f5b,
};

const MODULE_COLORS = [0x1c2d32, 0x202a39, 0x243126, 0x28253a];

/** Renderer and vector editor for modular world-model cities with Berlin road profiles and snapping. */
export class WorldPreviewScene extends Phaser.Scene {
  private readonly projector: IsoProjector;
  private readonly moduleReferences = new Map<string, WorldModuleReference>();
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private moduleGraphics!: Phaser.GameObjects.Graphics;
  private featureGraphics!: Phaser.GameObjects.Graphics;
  private connectorGraphics!: Phaser.GameObjects.Graphics;
  private editorGraphics!: Phaser.GameObjects.Graphics;
  private labelContainer!: Phaser.GameObjects.Container;
  private dynamicObjects: Phaser.GameObjects.GameObject[] = [];
  private showGrid = true;
  private showGeometry = true;
  private showConnectors = true;
  private isDragging = false;
  private dragMoved = false;
  private dragLastX = 0;
  private dragLastY = 0;
  private editPointerDown = false;
  private pressX = 0;
  private pressY = 0;
  private fitZoom = 0.25;
  private projectedBounds?: ProjectedBounds;
  private resizeDebounce?: number;
  private editMode = false;
  private editorTool: WorldEditorTool = 'select';
  private rectangleKind: RectangleFeatureKind = 'park';
  private activeRoadProfile: RoadProfileId = 'secondary';
  private activeAssetId = 'bench-wood';
  private selectedFeature?: { moduleId: string; feature: GeometryFeature };
  private selectedEntity?: { moduleId: string; entity: AssetInstance };
  private activeVertexDrag?: { moduleId: string; feature: GeometryFeature; handle: VertexHandle };
  private showReferenceImage = true;
  private onFeatureSelected?: (info: SelectionInfo) => void;
  private pendingDrawStart?: { moduleId: string; local: Point2 };
  private undoStack: Array<{ moduleId: string; previousGeometries: GeometryFeature[]; previousEntities: AssetInstance[] }> = [];

  constructor(
    private readonly loaded: LoadedWorldProject,
    private readonly onStatus: PreviewStatus,
    private readonly onDraftChanged: (draft: WorldDraftBundle) => void = () => undefined,
  ) {
    super({ key: 'KleinBerlinWorldPreview' });
    this.projector = new IsoProjector(loaded.project.projection);
    for (const district of loaded.world.districts) {
      for (const moduleReference of district.modules) this.moduleReferences.set(moduleReference.id, moduleReference);
    }
  }

  preload(): void {
    for (const asset of this.loaded.assetCatalog.assets) {
      const imagePath = `/${asset.visual.image.replace(/^\/+/, '')}`;
      this.load.image(asset.id, imagePath);
    }
    for (const district of this.loaded.world.districts) {
      for (const reference of district.modules) {
        const module = this.loaded.modules.get(reference.id);
        if (!module) continue;
        for (const ref of module.referenceImages) {
          const imagePath = `/${ref.source.replace(/^\/+/, '')}`;
          this.load.image(`ref-${ref.id}`, imagePath);
        }
      }
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#101720');
    this.moduleGraphics = this.add.graphics().setDepth(2);
    this.gridGraphics = this.add.graphics().setDepth(3);
    this.featureGraphics = this.add.graphics().setDepth(10);
    this.connectorGraphics = this.add.graphics().setDepth(25);
    this.editorGraphics = this.add.graphics().setDepth(70);
    this.labelContainer = this.add.container(0, 0).setDepth(80);
    this.input.mouse?.disableContextMenu();
    this.renderWorld();
    this.frameWorld();
    this.bindNavigation();

    this.scale.on(Phaser.Scale.Events.RESIZE, () => {
      if (this.resizeDebounce !== undefined) window.clearTimeout(this.resizeDebounce);
      this.resizeDebounce = window.setTimeout(() => this.frameWorld(), 80);
    });

    const geometryCount = [...this.loaded.modules.values()].reduce((sum, module) => sum + module.geometries.length, 0);
    const connectorCount = [...this.loaded.modules.values()].reduce((sum, module) => sum + module.connectors.length, 0);
    this.onStatus(`${this.loaded.modules.size} Module · ${geometryCount} Geometrien · ${connectorCount} Anschluss-Endpunkte geladen.`);
  }

  setGridVisible(visible: boolean): void {
    this.showGrid = visible;
    this.drawGrid();
  }

  setGeometryVisible(visible: boolean): void {
    this.showGeometry = visible;
    this.drawFeatures();
  }

  setConnectorsVisible(visible: boolean): void {
    this.showConnectors = visible;
    this.drawConnectors();
  }

  setEditMode(enabled: boolean): void {
    this.editMode = enabled;
    this.pendingDrawStart = undefined;
    this.editorGraphics.clear();
    if (!enabled) {
      this.clearSelection();
    }
    this.onStatus(enabled
      ? 'Bearbeitungsmodus aktiv. Wähle Straße, Fläche oder Gebäudegrundriss.'
      : 'Ansichtsmodus aktiv. Ziehen verschiebt die Karte; Klick zeigt Weltkoordinaten.');
  }

  setEditorTool(tool: WorldEditorTool): void {
    this.editorTool = tool;
    this.pendingDrawStart = undefined;
    this.editorGraphics.clear();
    if (tool !== 'select') {
      this.clearSelection();
    }
    const labels: Record<WorldEditorTool, string> = {
      select: 'Auswahl: Klicke ein Objekt zum Auswählen/Löschen oder ziehe Eckpunkte. Freifläche zeigt Koordinaten.',
      road: `Straße (${BERLIN_ROAD_PROFILES[this.activeRoadProfile]?.displayName}): Klicke Start- und Endpunkt. Magnet-Snap an Anschlüsse/Straßen ist aktiv.`,
      area: 'Fläche: Klicke zwei gegenüberliegende Ecken innerhalb desselben Moduls.',
      building: 'Gebäude: Klicke die Mitte eines neuen Gebäudegrundrisses (18 × 14 m).',
      asset: `Requisite: Klicke auf die Karte, um ${this.activeAssetId} zu platzieren. Taste R dreht nach Platzierung.`,
    };
    this.onStatus(labels[tool]);
  }

  setRectangleKind(kind: RectangleFeatureKind): void {
    this.rectangleKind = kind;
    this.onStatus(`Flächenwerkzeug: ${kind}. Klicke zwei gegenüberliegende Ecken.`);
  }

  setRoadProfile(profileId: RoadProfileId): void {
    this.activeRoadProfile = profileId;
    const name = BERLIN_ROAD_PROFILES[profileId]?.displayName ?? profileId;
    this.onStatus(`Aktives Straßenprofil: ${name}.`);
  }

  setActiveAssetId(assetId: string): void {
    this.activeAssetId = assetId;
    this.onStatus(`Aktives Requisiten-Asset: ${assetId}. Klicke im Requisiten-Modus zum Stempeln.`);
  }

  getActiveAssetId(): string {
    return this.activeAssetId;
  }

  setReferenceImageVisible(visible: boolean): void {
    this.showReferenceImage = visible;
    this.renderWorld();
    this.onStatus(`Referenzbild-Vorlage: ${visible ? 'sichtbar' : 'ausgeblendet'}.`);
  }

  setFeatureSelectedHandler(handler: (info: SelectionInfo) => void): void {
    this.onFeatureSelected = handler;
  }

  getSelectedFeature(): { moduleId: string; feature: GeometryFeature } | undefined {
    return this.selectedFeature;
  }

  getSelectedEntity(): { moduleId: string; entity: AssetInstance } | undefined {
    return this.selectedEntity;
  }

  deleteSelectedFeature(): boolean {
    if (!this.selectedFeature) return false;
    const { moduleId, feature } = this.selectedFeature;
    const module = this.loaded.modules.get(moduleId);
    if (!module) return false;

    this.undoStack.push({
      moduleId,
      previousGeometries: JSON.parse(JSON.stringify(module.geometries)) as GeometryFeature[],
      previousEntities: JSON.parse(JSON.stringify(module.entities)) as AssetInstance[],
    });
    module.geometries = module.geometries.filter((g) => g.id !== feature.id);
    this.clearSelection();
    this.drawFeatures();
    this.onDraftChanged(createWorldDraftBundle(this.loaded));
    this.onStatus(`Gelöscht: ${feature.kind} (${feature.id}) aus ${module.name}. Entwurf lokal gespeichert.`);
    return true;
  }

  deleteSelectedEntity(): boolean {
    if (!this.selectedEntity) return false;
    const { moduleId, entity } = this.selectedEntity;
    const module = this.loaded.modules.get(moduleId);
    if (!module) return false;

    this.undoStack.push({
      moduleId,
      previousGeometries: JSON.parse(JSON.stringify(module.geometries)) as GeometryFeature[],
      previousEntities: JSON.parse(JSON.stringify(module.entities)) as AssetInstance[],
    });
    module.entities = module.entities.filter((e) => e.id !== entity.id);
    this.clearSelection();
    this.renderWorld();
    this.onDraftChanged(createWorldDraftBundle(this.loaded));
    this.onStatus(`Gelöscht: Requisite ${entity.id} (${entity.assetId}) aus ${module.name}. Entwurf lokal gespeichert.`);
    return true;
  }

  deleteSelection(): boolean {
    if (this.selectedEntity) return this.deleteSelectedEntity();
    if (this.selectedFeature) return this.deleteSelectedFeature();
    return false;
  }

  rotateSelectedEntity(deltaDegrees = 90): boolean {
    if (!this.selectedEntity) return false;
    const { moduleId, entity } = this.selectedEntity;
    const module = this.loaded.modules.get(moduleId);
    if (!module) return false;

    this.undoStack.push({
      moduleId,
      previousGeometries: JSON.parse(JSON.stringify(module.geometries)) as GeometryFeature[],
      previousEntities: JSON.parse(JSON.stringify(module.entities)) as AssetInstance[],
    });
    entity.rotationDegrees = ((entity.rotationDegrees + deltaDegrees) % 360 + 360) % 360;
    this.renderWorld();
    this.onDraftChanged(createWorldDraftBundle(this.loaded));
    this.onStatus(`Requisite gedreht: ${entity.id} -> ${entity.rotationDegrees}°. Entwurf lokal gespeichert.`);
    this.onFeatureSelected?.({ entity, moduleId });
    return true;
  }

  updateSelectedFeatureProfile(profileId: RoadProfileId): boolean {
    if (!this.selectedFeature || this.selectedFeature.feature.kind !== 'road-centerline') return false;
    const { moduleId, feature } = this.selectedFeature;
    const module = this.loaded.modules.get(moduleId);
    if (!module) return false;

    const profile = BERLIN_ROAD_PROFILES[profileId];
    if (!profile) return false;

    this.undoStack.push({
      moduleId,
      previousGeometries: JSON.parse(JSON.stringify(module.geometries)) as GeometryFeature[],
      previousEntities: JSON.parse(JSON.stringify(module.entities)) as AssetInstance[],
    });
    feature.widthMeters = profile.totalWidthMeters;
    feature.properties = {
      ...(feature.properties ?? {}),
      roadProfile: profile.id,
      roadClass: profile.id,
      surface: profile.surface,
      displayName: profile.displayName,
    };

    this.drawFeatures();
    this.onDraftChanged(createWorldDraftBundle(this.loaded));
    this.onStatus(`Straßenprofil geändert: ${feature.id} -> ${profile.displayName}.`);
    this.onFeatureSelected?.({ feature, moduleId });
    return true;
  }

  updateSelectedAreaKind(kind: RectangleFeatureKind): boolean {
    if (!this.selectedFeature || this.selectedFeature.feature.geometry.type !== 'Polygon') return false;
    const { moduleId, feature } = this.selectedFeature;
    const module = this.loaded.modules.get(moduleId);
    if (!module) return false;

    this.undoStack.push({
      moduleId,
      previousGeometries: JSON.parse(JSON.stringify(module.geometries)) as GeometryFeature[],
      previousEntities: JSON.parse(JSON.stringify(module.entities)) as AssetInstance[],
    });
    feature.kind = kind;

    this.drawFeatures();
    this.onDraftChanged(createWorldDraftBundle(this.loaded));
    this.onStatus(`Flächentyp geändert: ${feature.id} -> ${kind}.`);
    this.onFeatureSelected?.({ feature, moduleId });
    return true;
  }

  private clearSelection(): void {
    const hadSelection = Boolean(this.selectedFeature || this.selectedEntity);
    this.selectedFeature = undefined;
    this.selectedEntity = undefined;
    this.editorGraphics.clear();
    if (hadSelection) {
      this.drawFeatures();
      this.drawEntities();
      this.onFeatureSelected?.({ feature: null, entity: null });
    }
  }

  undoLastEdit(): void {
    const command = this.undoStack.pop();
    if (!command) {
      this.onStatus('Nichts zum Rückgängigmachen vorhanden.');
      return;
    }
    const module = this.loaded.modules.get(command.moduleId);
    if (!module) return;
    module.geometries = command.previousGeometries;
    module.entities = command.previousEntities;
    this.pendingDrawStart = undefined;
    this.clearSelection();
    this.editorGraphics.clear();
    this.renderWorld();
    this.onDraftChanged(createWorldDraftBundle(this.loaded));
    this.onStatus(`Letzte Änderung rückgängig gemacht · ${module.name}. Entwurf lokal gespeichert.`);
  }

  getDraftBundle(): WorldDraftBundle {
    return createWorldDraftBundle(this.loaded);
  }

  frameWorld(): void {
    if (!this.projectedBounds) this.projectedBounds = this.computeWorldBounds();
    const bounds = this.projectedBounds;
    const width = Math.max(1, this.scale.width);
    const height = Math.max(1, this.scale.height);
    const paddingX = Math.min(84, width * 0.08);
    const paddingY = Math.min(120, height * 0.16);
    const availableWidth = Math.max(1, width - paddingX * 2);
    const availableHeight = Math.max(1, height - paddingY * 2);
    this.fitZoom = Phaser.Math.Clamp(Math.min(availableWidth / Math.max(bounds.width, 1), availableHeight / Math.max(bounds.height, 1)), 0.04, 2.5);
    this.cameras.main.setZoom(this.fitZoom);
    this.cameras.main.centerOn(bounds.centerX, bounds.centerY);
    this.updateLabelScales();
  }

  private bindNavigation(): void {
    const camera = this.cameras.main;
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) return;
      this.dragMoved = false;
      this.pressX = pointer.x;
      this.pressY = pointer.y;

      // Check if clicking a vertex handle of the selected feature for dragging
      if (this.editMode && this.editorTool === 'select' && this.selectedFeature) {
        const projected = camera.getWorldPoint(pointer.x, pointer.y);
        const moduleHit = this.findModuleAtScreen(projected.x, projected.y);
        if (moduleHit && moduleHit.id === this.selectedFeature.moduleId) {
          const handle = findVertexHandleAtPoint(moduleHit.local, this.selectedFeature.feature, 2.5);
          if (handle) {
            const module = this.loaded.modules.get(this.selectedFeature.moduleId);
            if (module) {
              this.undoStack.push({
                moduleId: module.id,
                previousGeometries: JSON.parse(JSON.stringify(module.geometries)) as GeometryFeature[],
                previousEntities: JSON.parse(JSON.stringify(module.entities)) as AssetInstance[],
              });
            }
            this.activeVertexDrag = {
              moduleId: this.selectedFeature.moduleId,
              feature: this.selectedFeature.feature,
              handle,
            };
            this.isDragging = false;
            this.editPointerDown = false;
            return;
          }
        }
      }

      if (this.editMode && this.editorTool !== 'select') {
        this.editPointerDown = true;
        this.isDragging = false;
        return;
      }
      this.editPointerDown = false;
      this.isDragging = true;
      this.dragLastX = pointer.x;
      this.dragLastY = pointer.y;
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.activeVertexDrag) {
        const projected = camera.getWorldPoint(pointer.x, pointer.y);
        const moduleHit = this.findModuleAtScreen(projected.x, projected.y);
        if (moduleHit && moduleHit.id === this.activeVertexDrag.moduleId) {
          const { feature, handle } = this.activeVertexDrag;
          if (feature.geometry.type === 'LineString') {
            feature.geometry.pointsMeters[handle.pointIndex] = { ...moduleHit.local };
          } else if (feature.geometry.type === 'Polygon') {
            const ring = feature.geometry.ringsMeters[0];
            if (ring && ring[handle.pointIndex]) {
              ring[handle.pointIndex] = { ...moduleHit.local };
            }
          }
          this.drawFeatures();
          this.drawVertexHandles();
          this.onStatus(`Vertex ${handle.pointIndex} verschoben: X ${moduleHit.local.x.toFixed(1)} m · Y ${moduleHit.local.y.toFixed(1)} m`);
        }
        return;
      }

      if (!this.isDragging || !pointer.isDown) return;
      const dx = pointer.x - this.dragLastX;
      const dy = pointer.y - this.dragLastY;
      if (Math.hypot(pointer.x - this.pressX, pointer.y - this.pressY) > 3) this.dragMoved = true;
      camera.scrollX -= dx / camera.zoom;
      camera.scrollY -= dy / camera.zoom;
      this.dragLastX = pointer.x;
      this.dragLastY = pointer.y;
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.activeVertexDrag) {
        const drag = this.activeVertexDrag;
        this.activeVertexDrag = undefined;
        this.onDraftChanged(createWorldDraftBundle(this.loaded));
        this.onStatus(`Vertex ${drag.handle.pointIndex} von ${drag.feature.id} aktualisiert. Entwurf lokal gespeichert.`);
        return;
      }

      if (this.editPointerDown) {
        this.editPointerDown = false;
        if (Math.hypot(pointer.x - this.pressX, pointer.y - this.pressY) < 4) {
          const projected = camera.getWorldPoint(pointer.x, pointer.y);
          this.handleEditorClick(projected.x, projected.y);
        }
        return;
      }
      if (!this.isDragging) return;
      this.isDragging = false;
      if (this.dragMoved) return;

      const projected = camera.getWorldPoint(pointer.x, pointer.y);
      const moduleHit = this.findModuleAtScreen(projected.x, projected.y);

      if (this.editMode && this.editorTool === 'select' && moduleHit) {
        const module = this.loaded.modules.get(moduleHit.id);
        if (module) {
          // 1. Check if an asset entity was clicked
          const entityHit = findAssetInstanceAtPoint(moduleHit.local, module.entities, 3.0);
          if (entityHit) {
            this.selectedEntity = { moduleId: module.id, entity: entityHit };
            this.selectedFeature = undefined;
            this.editorGraphics.clear();
            this.drawFeatures();
            this.drawEntities();
            this.onFeatureSelected?.({ entity: entityHit, moduleId: module.id });
            this.onStatus(`Ausgewählt: Requisite ${entityHit.assetId} (${entityHit.id}, ${entityHit.rotationDegrees}°) in ${module.name}. Taste R dreht 90°, Entf löscht.`);
            return;
          }

          // 2. Check if a feature was clicked
          const featureHit = findFeatureAtPoint(moduleHit.local, module.geometries);
          if (featureHit) {
            this.selectedFeature = { moduleId: module.id, feature: featureHit };
            this.selectedEntity = undefined;
            this.drawFeatures();
            this.drawVertexHandles();
            this.drawEntities();
            this.onFeatureSelected?.({ feature: featureHit, moduleId: module.id });
            const profileInfo = featureHit.properties?.roadProfile ? ` · Profil: ${featureHit.properties.roadProfile}` : '';
            this.onStatus(`Ausgewählt: ${featureHit.kind} (${featureHit.id})${profileInfo} in ${module.name}. Ziehe Eckpunkte zum Verformen.`);
            return;
          }

          // 3. Clicked empty space in module
          this.clearSelection();
          this.onStatus(`Auswahl · ${moduleHit.id} · lokal X ${moduleHit.local.x.toFixed(1)} m / Y ${moduleHit.local.y.toFixed(1)} m (kein Objekt getroffen)`);
          return;
        }
      }

      const world = moduleHit?.world ?? this.projector.screenToWorld(projected.x, projected.y);
      const message = `Weltposition: X ${world.x.toFixed(1)} m · Y ${world.y.toFixed(1)} m${moduleHit ? ` · Modul ${moduleHit.id}` : ''}`;
      this.onStatus(message);
    });

    this.input.on('pointerout', () => { this.isDragging = false; });
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objects: unknown[], _deltaX: number, deltaY: number) => {
      this.zoomAt(pointer.x, pointer.y, deltaY);
    });
  }

  private zoomAt(pointerX: number, pointerY: number, deltaY: number): void {
    const camera = this.cameras.main;
    const before = camera.getWorldPoint(pointerX, pointerY);
    const zoom = Phaser.Math.Clamp(camera.zoom * Math.exp(-deltaY * 0.001), Math.max(0.04, this.fitZoom * 0.18), 3.0);
    camera.setZoom(zoom);
    const after = camera.getWorldPoint(pointerX, pointerY);
    camera.scrollX += before.x - after.x;
    camera.scrollY += before.y - after.y;
    this.updateLabelScales();
  }

  zoomBy(factor: number): void {
    const camera = this.cameras.main;
    camera.setZoom(Phaser.Math.Clamp(camera.zoom * factor, Math.max(0.04, this.fitZoom * 0.18), 3.0));
    this.updateLabelScales();
  }

  private handleEditorClick(screenX: number, screenY: number): void {
    if (!this.editMode || this.editorTool === 'select') return;
    const hit = this.findModuleAtScreen(screenX, screenY);
    if (!hit) {
      this.pendingDrawStart = undefined;
      this.editorGraphics.clear();
      this.onStatus('Bitte innerhalb eines Stadtmoduls klicken.');
      return;
    }
    const module = this.loaded.modules.get(hit.id);
    if (!module) return;
    const ground = module.levels.find((level) => level.id === 'ground') ?? module.levels[0];
    if (!ground) {
      this.onStatus(`Modul ${module.name} hat keine bearbeitbare Ebene.`);
      return;
    }

    if (this.editorTool === 'asset') {
      const asset = this.loaded.assetCatalog.assets.find((a) => a.id === this.activeAssetId);
      const assetIdToUse = asset ? asset.id : (this.loaded.assetCatalog.assets[0]?.id ?? 'bench-wood');
      const entity = createAssetInstance(module.id, assetIdToUse, ground.id, hit.local, module.entities);
      this.undoStack.push({
        moduleId: module.id,
        previousGeometries: JSON.parse(JSON.stringify(module.geometries)) as GeometryFeature[],
        previousEntities: JSON.parse(JSON.stringify(module.entities)) as AssetInstance[],
      });
      module.entities.push(entity);
      this.selectedEntity = { moduleId: module.id, entity };
      this.selectedFeature = undefined;
      this.renderWorld();
      this.onFeatureSelected?.({ entity, moduleId: module.id });
      this.onDraftChanged(createWorldDraftBundle(this.loaded));
      this.onStatus(`Platziert: ${entity.assetId} (${entity.id}) in ${module.name}. Taste R dreht 90°, Entf löscht.`);
      return;
    }

    if (this.editorTool === 'building') {
      const width = Math.min(18, module.boundsMeters.width - 0.5);
      const depth = Math.min(14, module.boundsMeters.depth - 0.5);
      const start = {
        x: Phaser.Math.Clamp(hit.local.x - width / 2, 0.25, module.boundsMeters.width - width - 0.25),
        y: Phaser.Math.Clamp(hit.local.y - depth / 2, 0.25, module.boundsMeters.depth - depth - 0.25),
      };
      const feature = createRectangleFeature(
        nextEditorGeometryId(module.id, module.geometries.map((item) => item.id)),
        'building-footprint', ground.id, start,
        { x: start.x + width, y: start.y + depth },
      );
      this.commitGeometry(module.id, feature);
      return;
    }

    // Check for magnetic snapping when placing roads
    let targetPoint = hit.local;
    let snapNote = '';
    if (this.editorTool === 'road') {
      const snap = findSnapTarget(hit.local, module, 2.5);
      if (snap) {
        targetPoint = snap.point;
        snapNote = ` (Magnet-Snap: ${snap.label})`;
      }
    }

    if (!this.pendingDrawStart) {
      this.pendingDrawStart = { moduleId: module.id, local: targetPoint };
      this.editorGraphics.clear();
      const screen = this.projector.moduleLocalToScreen({ ...targetPoint, z: ground.zMeters }, this.moduleReferences.get(module.id)!);
      this.editorGraphics.fillStyle(0xfbbf24, 0.96).fillCircle(screen.x, screen.y, 12);
      this.editorGraphics.lineStyle(3, 0x101720, 0.9).strokeCircle(screen.x, screen.y, 12);
      this.onStatus(`Startpunkt gesetzt${snapNote} · ${module.name} · X ${targetPoint.x.toFixed(1)} m / Y ${targetPoint.y.toFixed(1)} m. Jetzt Endpunkt klicken.`);
      return;
    }

    const start = this.pendingDrawStart;
    this.pendingDrawStart = undefined;
    this.editorGraphics.clear();
    if (start.moduleId !== module.id) {
      this.onStatus('Start- und Endpunkt müssen im selben Modul liegen. Bitte neu starten.');
      return;
    }

    const id = nextEditorGeometryId(module.id, module.geometries.map((item) => item.id));
    try {
      const feature = this.editorTool === 'road'
        ? createRoadFeature(id, ground.id, start.local, targetPoint, this.activeRoadProfile)
        : createRectangleFeature(id, this.rectangleKind, ground.id, start.local, targetPoint);
      this.commitGeometry(module.id, feature);
    } catch (error) {
      this.onStatus(error instanceof Error ? error.message : String(error));
    }
  }

  private commitGeometry(moduleId: string, feature: GeometryFeature): void {
    const module = this.loaded.modules.get(moduleId);
    if (!module) return;
    this.undoStack.push({
      moduleId,
      previousGeometries: JSON.parse(JSON.stringify(module.geometries)) as GeometryFeature[],
      previousEntities: JSON.parse(JSON.stringify(module.entities)) as AssetInstance[],
    });
    module.geometries.push(feature);
    this.selectedFeature = { moduleId, feature };
    this.selectedEntity = undefined;
    this.drawFeatures();
    this.drawVertexHandles();
    this.onFeatureSelected?.({ feature, moduleId });
    this.onDraftChanged(createWorldDraftBundle(this.loaded));
    this.onStatus(`Erstellt: ${feature.kind} · ${feature.id}. Entwurf lokal gespeichert.`);
  }

  renderWorld(): void {
    this.moduleGraphics.clear();
    this.labelContainer.removeAll(true);
    for (const object of this.dynamicObjects) object.destroy();
    this.dynamicObjects = [];

    let moduleColorIndex = 0;
    for (const district of this.loaded.world.districts) {
      for (const reference of district.modules) {
        const module = this.loaded.modules.get(reference.id);
        if (!module) continue;
        this.drawModuleBase(reference, module, MODULE_COLORS[moduleColorIndex % MODULE_COLORS.length]);
        this.addModuleLabel(reference, module);
        moduleColorIndex += 1;
      }
    }
    this.drawReferenceImages();
    this.drawGrid();
    this.drawFeatures();
    this.drawConnectors();
    this.drawEntities();
    this.drawVertexHandles();
  }

  private drawReferenceImages(): void {
    if (!this.showReferenceImage) return;
    for (const district of this.loaded.world.districts) {
      for (const reference of district.modules) {
        const module = this.loaded.modules.get(reference.id);
        if (!module) continue;
        for (const ref of module.referenceImages) {
          if (!ref.visibleInEditor || !this.textures.exists(`ref-${ref.id}`)) continue;
          const screen = this.projector.moduleLocalToScreen({ x: ref.positionMeters.x, y: ref.positionMeters.y, z: 0 }, reference);
          const img = this.add.image(screen.x, screen.y, `ref-${ref.id}`).setDepth(2.2);
          img.setOrigin(0, 0);
          img.setAlpha(ref.opacity ?? 0.4);
          this.dynamicObjects.push(img);
        }
      }
    }
  }

  private drawVertexHandles(): void {
    this.editorGraphics.clear();
    if (!this.selectedFeature) return;
    const { moduleId, feature } = this.selectedFeature;
    const reference = this.moduleReferences.get(moduleId);
    const module = this.loaded.modules.get(moduleId);
    if (!reference || !module) return;

    const levelZ = module.levels.find((l) => l.id === feature.levelId)?.zMeters ?? 0;
    const points: Point2[] = feature.geometry.type === 'LineString'
      ? feature.geometry.pointsMeters
      : (feature.geometry.ringsMeters[0] ?? []);

    for (let i = 0; i < points.length; i++) {
      const screen = this.projector.moduleLocalToScreen({ ...points[i], z: levelZ }, reference);
      this.editorGraphics.fillStyle(0x38bdf8, 0.95);
      this.editorGraphics.fillCircle(screen.x, screen.y, 8);
      this.editorGraphics.lineStyle(2, 0xffffff, 0.95);
      this.editorGraphics.strokeCircle(screen.x, screen.y, 8);
    }
  }

  private drawModuleBase(reference: WorldModuleReference, module: ModuleDocument, color: number): void {
    const corners = this.projector.moduleScreenCorners(reference).map(this.toVector);
    this.moduleGraphics.fillStyle(color, 0.84);
    this.moduleGraphics.fillPoints(corners, true);
    this.moduleGraphics.lineStyle(5, 0x6d8391, 0.9);
    this.moduleGraphics.strokePoints(corners, true);

    const center = this.projector.moduleLocalToScreen({ x: module.boundsMeters.width / 2, y: module.boundsMeters.depth * 0.10, z: 0 }, reference);
    this.addWorldLabel(module.name, center, '#e2e8f0', '#101720cc');
  }

  private drawGrid(): void {
    this.gridGraphics.clear();
    if (!this.showGrid) return;
    this.gridGraphics.lineStyle(1.4, 0x8fa1ae, 0.24);
    for (const district of this.loaded.world.districts) {
      for (const reference of district.modules) {
        const module = this.loaded.modules.get(reference.id);
        if (!module) continue;
        const width = module.boundsMeters.width;
        const depth = module.boundsMeters.depth;
        const cell = this.loaded.project.projection.referenceCellMeters;
        for (let x = 0; x <= width + 0.0001; x += cell) {
          this.strokeLocalLine(this.gridGraphics, reference, { x, y: 0 }, { x, y: depth });
        }
        for (let y = 0; y <= depth + 0.0001; y += cell) {
          this.strokeLocalLine(this.gridGraphics, reference, { x: 0, y }, { x: width, y });
        }
      }
    }
  }

  private drawFeatures(): void {
    this.featureGraphics.clear();
    if (!this.showGeometry) return;

    for (const district of this.loaded.world.districts) {
      for (const reference of district.modules) {
        const module = this.loaded.modules.get(reference.id);
        if (!module) continue;

        const groundLevel = module.levels.find((level) => level.id === 'ground')?.zMeters ?? 0;

        // 1. Derive and render physical road network (carriageways, sidewalks, intersection hubs)
        const roadNet = deriveRoadNetwork(module.geometries);

        // Render carriageways (dark asphalt)
        for (const seg of roadNet.segments) {
          if (seg.carriagewayPolygon) {
            const screenPoints = seg.carriagewayPolygon
              .map((pt) => this.projectLocalPoint(pt, groundLevel, reference))
              .map(this.toVector);
            if (screenPoints.length >= 3) {
              this.featureGraphics.fillStyle(0x1e293b, 0.95);
              this.featureGraphics.fillPoints(screenPoints, true);
              this.featureGraphics.lineStyle(2, 0x334155, 0.85);
              this.featureGraphics.strokePoints(screenPoints, true);
            }
          }
        }

        // Render sidewalks (lighter paved/concrete tone)
        for (const seg of roadNet.segments) {
          for (const sidewalk of [seg.sidewalkLeftPolygon, seg.sidewalkRightPolygon]) {
            if (sidewalk) {
              const screenPoints = sidewalk
                .map((pt) => this.projectLocalPoint(pt, groundLevel, reference))
                .map(this.toVector);
              if (screenPoints.length >= 3) {
                this.featureGraphics.fillStyle(0x64748b, 0.45);
                this.featureGraphics.fillPoints(screenPoints, true);
                this.featureGraphics.lineStyle(1.5, 0x94a3b8, 0.65);
                this.featureGraphics.strokePoints(screenPoints, true);
              }
            }
          }
        }

        // Render intersection hubs (octagons)
        for (const hub of roadNet.intersections) {
          const screenPoints = hub
            .map((pt) => this.projectLocalPoint(pt, groundLevel, reference))
            .map(this.toVector);
          if (screenPoints.length >= 3) {
            this.featureGraphics.fillStyle(0x334155, 0.88);
            this.featureGraphics.fillPoints(screenPoints, true);
            this.featureGraphics.lineStyle(2, 0x64748b, 0.9);
            this.featureGraphics.strokePoints(screenPoints, true);
          }
        }

        // 2. Render other vector features (polygons and centerlines)
        for (const feature of module.geometries) {
          const levelZ = module.levels.find((level) => level.id === feature.levelId)?.zMeters ?? 0;
          const isSelected = this.selectedFeature?.moduleId === module.id && this.selectedFeature.feature.id === feature.id;

          if (feature.geometry.type === 'LineString') {
            const points = feature.geometry.pointsMeters.map((point) => this.projectLocalPoint(point, levelZ, reference));
            this.drawLineFeature(feature, points);
            if (isSelected) {
              this.strokeProjectedLine(points, 0x38bdf8, 6, 0.98);
            }
          } else {
            const outerRing = feature.geometry.ringsMeters[0] ?? [];
            const points = outerRing.map((point) => this.projectLocalPoint(point, levelZ, reference)).map(this.toVector);
            if (points.length < 3) continue;
            const color = FEATURE_COLORS[feature.kind];
            const fillAlpha = feature.kind === 'parcel' ? 0.10 : feature.kind === 'building-footprint' ? 0.72 : 0.62;
            this.featureGraphics.fillStyle(color, fillAlpha);
            this.featureGraphics.fillPoints(points, true);
            this.featureGraphics.lineStyle(feature.kind === 'building-footprint' ? 4 : 2, color, 0.95);
            this.featureGraphics.strokePoints(points, true);

            if (isSelected) {
              this.featureGraphics.lineStyle(4, 0x38bdf8, 1);
              this.featureGraphics.strokePoints(points, true);
            }
          }
        }
      }
    }
    this.drawVertexHandles();
  }

  private drawLineFeature(feature: GeometryFeature, points: ScreenPoint[]): void {
    if (points.length < 2) return;
    const widthMeters = feature.widthMeters ?? 1;
    const color = FEATURE_COLORS[feature.kind];
    const screenWidth = Math.max(2, this.projector.metersToScreenStrokeWidth(widthMeters));
    if (feature.kind === 'road-centerline') {
      this.strokeProjectedLine(points, 0x94a3b8, Math.max(1.5, screenWidth * 0.08), 0.75);
    } else {
      this.strokeProjectedLine(points, color, screenWidth, feature.kind === 'waterway' ? 0.86 : 0.78);
    }
  }

  private drawConnectors(): void {
    this.connectorGraphics.clear();
    if (!this.showConnectors) return;
    const seen = new Set<string>();
    for (const district of this.loaded.world.districts) {
      for (const reference of district.modules) {
        const module = this.loaded.modules.get(reference.id);
        if (!module) continue;
        for (const connector of module.connectors) {
          const key = `${reference.id}/${connector.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const screen = this.projector.moduleLocalToScreen(connector.positionMeters, reference);
          const linked = Boolean(connector.target);
          const color = linked ? 0x39d98a : 0xfbbf24;
          this.connectorGraphics.fillStyle(color, 0.18);
          this.connectorGraphics.fillCircle(screen.x, screen.y, 38);
          this.connectorGraphics.lineStyle(5, color, 0.95);
          this.connectorGraphics.strokeCircle(screen.x, screen.y, 20);

          const worldStart = this.projector.moduleLocalToWorld(connector.positionMeters, reference);
          const worldDirection = this.rotateLocalHeading(connector.headingDegrees, reference.rotationDegrees);
          const worldEnd = this.projector.worldToScreen({
            x: worldStart.x + Math.cos(worldDirection * Math.PI / 180) * 6,
            y: worldStart.y + Math.sin(worldDirection * Math.PI / 180) * 6,
            z: worldStart.z,
          });
          this.connectorGraphics.lineStyle(4, color, 0.98);
          this.connectorGraphics.beginPath();
          this.connectorGraphics.moveTo(screen.x, screen.y);
          this.connectorGraphics.lineTo(worldEnd.x, worldEnd.y);
          this.connectorGraphics.strokePath();
        }
      }
    }
  }

  private drawEntities(): void {
    const assetsById = new Map(this.loaded.assetCatalog.assets.map((asset) => [asset.id, asset]));
    for (const district of this.loaded.world.districts) {
      for (const reference of district.modules) {
        const module = this.loaded.modules.get(reference.id);
        if (!module) continue;
        for (const entity of module.entities) {
          const isSelected = this.selectedEntity?.moduleId === module.id && this.selectedEntity.entity.id === entity.id;
          const asset = assetsById.get(entity.assetId);
          const worldPoint = this.projector.moduleLocalToWorld(entity.positionMeters, reference);
          const screen = this.projector.worldToScreen(worldPoint);
          if (asset && this.textures.exists(asset.id)) {
            const sprite = this.add.image(screen.x, screen.y, asset.id).setDepth(35);
            this.applyAssetAppearance(sprite, asset, entity, reference);
            this.dynamicObjects.push(sprite);
          } else {
            const marker = this.add.graphics().setDepth(35);
            marker.fillStyle(0xe879f9, 0.82);
            marker.fillPoints([
              new Phaser.Math.Vector2(screen.x, screen.y - 16),
              new Phaser.Math.Vector2(screen.x + 16, screen.y),
              new Phaser.Math.Vector2(screen.x, screen.y + 16),
              new Phaser.Math.Vector2(screen.x - 16, screen.y),
            ], true);
            marker.lineStyle(2, 0xffffff, 0.85).strokePoints([
              new Phaser.Math.Vector2(screen.x, screen.y - 16),
              new Phaser.Math.Vector2(screen.x + 16, screen.y),
              new Phaser.Math.Vector2(screen.x, screen.y + 16),
              new Phaser.Math.Vector2(screen.x - 16, screen.y),
            ], true);
            this.dynamicObjects.push(marker);
          }

          if (isSelected) {
            const ring = this.add.graphics().setDepth(36);
            ring.lineStyle(3, 0x38bdf8, 0.95);
            ring.strokeCircle(screen.x, screen.y, 24);
            ring.fillStyle(0x38bdf8, 0.22);
            ring.fillCircle(screen.x, screen.y, 24);
            this.dynamicObjects.push(ring);
          }
        }
      }
    }
  }

  private applyAssetAppearance(
    sprite: Phaser.GameObjects.Image,
    asset: AssetDefinition,
    entity: ModuleDocument['entities'][number],
    reference: WorldModuleReference,
  ): void {
    const origin = asset.visual.anchor === 'center' ? 0.5 : 1;
    sprite.setOrigin(0.5, origin);
    sprite.setDisplaySize(
      asset.visual.nominalWidthPx * Math.abs(entity.scale.x),
      asset.visual.nominalHeightPx * Math.abs(entity.scale.y),
    );
    sprite.setFlip(entity.scale.x < 0, entity.scale.y < 0);
    const worldHeading = entity.rotationDegrees + reference.rotationDegrees;
    sprite.setRotation(this.projector.worldHeadingToScreenRadians(worldHeading));
  }

  private addModuleLabel(reference: WorldModuleReference, module: ModuleDocument): void {
    const center = this.projector.moduleLocalToScreen({ x: module.boundsMeters.width / 2, y: module.boundsMeters.depth * 0.10, z: 0 }, reference);
    this.addWorldLabel(module.id, { x: center.x, y: center.y + 48 }, '#8edcf8', '#101720dd');
  }

  private addWorldLabel(text: string, point: ScreenPoint, color: string, backgroundColor: string): void {
    const label = this.add.text(point.x, point.y, text, {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: '44px',
      fontStyle: '700',
      color,
      backgroundColor,
      padding: { x: 12, y: 7 },
      align: 'center',
    }).setOrigin(0.5, 0.5);
    this.labelContainer.add(label);
  }

  private updateLabelScales(): void {
    if (!this.labelContainer) return;
    const scale = this.fitZoom / Math.max(0.04, this.cameras.main.zoom);
    for (const child of this.labelContainer.list) {
      if (child instanceof Phaser.GameObjects.Text) child.setScale(scale);
    }
  }

  private computeWorldBounds(): ProjectedBounds {
    const points: ScreenPoint[] = [];
    const assetsById = new Map(this.loaded.assetCatalog.assets.map((asset) => [asset.id, asset]));
    for (const district of this.loaded.world.districts) {
      for (const reference of district.modules) {
        points.push(...this.projector.moduleScreenCorners(reference));
        const module = this.loaded.modules.get(reference.id);
        if (!module) continue;
        for (const entity of module.entities) {
          const asset = assetsById.get(entity.assetId);
          if (!asset) continue;
          const worldPoint = this.projector.moduleLocalToWorld(entity.positionMeters, reference);
          const foot = this.projector.worldToScreen(worldPoint);
          const width = asset.visual.nominalWidthPx * Math.abs(entity.scale.x);
          const height = asset.visual.nominalHeightPx * Math.abs(entity.scale.y);
          const anchorY = asset.visual.anchor === 'center' ? height / 2 : height;
          points.push(
            { x: foot.x - width / 2, y: foot.y - anchorY },
            { x: foot.x + width / 2, y: foot.y - anchorY },
            { x: foot.x - width / 2, y: foot.y + height - anchorY },
            { x: foot.x + width / 2, y: foot.y + height - anchorY },
          );
        }
      }
    }
    if (!points.length) return this.projector.boundsOf([{ x: -500, y: -250 }, { x: 500, y: 250 }]);
    return this.projector.boundsOf(points);
  }

  private projectLocalPoint(point: Point2, z: number, reference: WorldModuleReference): ScreenPoint {
    const local: WorldPoint3 = { x: point.x, y: point.y, z };
    return this.projector.moduleLocalToScreen(local, reference);
  }

  private strokeLocalLine(graphics: Phaser.GameObjects.Graphics, reference: WorldModuleReference, start: Point2, end: Point2): void {
    const a = this.projector.moduleLocalToScreen({ ...start, z: 0 }, reference);
    const b = this.projector.moduleLocalToScreen({ ...end, z: 0 }, reference);
    graphics.beginPath();
    graphics.moveTo(a.x, a.y);
    graphics.lineTo(b.x, b.y);
    graphics.strokePath();
  }

  private strokeProjectedLine(points: ScreenPoint[], color: number, width: number, alpha: number): void {
    this.featureGraphics.lineStyle(width, color, alpha);
    this.featureGraphics.beginPath();
    this.featureGraphics.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) this.featureGraphics.lineTo(points[index].x, points[index].y);
    this.featureGraphics.strokePath();
  }

  private findModuleAtScreen(screenX: number, screenY: number): { id: string; world: WorldPoint3; local: Point2 } | undefined {
    for (const district of this.loaded.world.districts) {
      for (const reference of district.modules) {
        const module = this.loaded.modules.get(reference.id);
        if (!module) continue;
        const groundLevel = module.levels.find((level) => level.id === 'ground')
          ?? module.levels.reduce((best, level) => Math.abs(level.zMeters) < Math.abs(best.zMeters) ? level : best);
        const worldZ = reference.originMeters.z + groundLevel.zMeters;
        const world = this.projector.screenToWorld(screenX, screenY, worldZ);
        const local = worldToModuleLocal(world, reference.originMeters, reference.rotationDegrees);
        if (local.x >= 0 && local.y >= 0 && local.x <= module.boundsMeters.width && local.y <= module.boundsMeters.depth) {
          return { id: reference.id, world, local };
        }
      }
    }
    return undefined;
  }

  private rotateLocalHeading(heading: number, rotation: number): number {
    return ((heading + rotation) % 360 + 360) % 360;
  }

  private toVector(point: ScreenPoint): RenderPoint {
    return new Phaser.Math.Vector2(point.x, point.y);
  }
}
