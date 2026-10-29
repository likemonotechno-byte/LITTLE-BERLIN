export type SceneRenderMode = 'pre-rendered-stage' | 'projected-world';
export type SceneProjection = 'legacy-stage-calibrated' | 'dimetric-2-to-1';

export type StageToWorldMapping =
  | { type: 'linear-rect'; xOriginPx: number; xSpanPx: number; xMeters: number; yOriginPx: number; ySpanPx: number; yMeters: number }
  | { type: 'legacy-dimetric'; originXPx: number; originYPx: number; pixelPerMacroU: number; pixelPerMacroV: number; macroTileMeters: number; maxXMeters: number; maxYMeters: number };

export interface GridMetrics {
  macroCols: number;
  macroRows: number;
  macroTileMeters: number;
  subGridDivisions: number;
  projection: SceneProjection;
  tilePixelWidth: number;
  tilePixelHeight: number;
  elevationPxPerTier: number;
  originX: number;
  originY: number;
  note?: string;
}

export interface SceneTier {
  id: number;
  name: string;
  zMeters: number;
  ambientColor: string;
  audioFilterCutoffHz: number;
  walkablePolygonLayer: string;
}

export interface ForegroundSlice {
  /** Optional proximity fade, applied only while the player is behind this slice. */
  cutaway?: import('../rendering/CutawayController').CutawayProfile;
  id: string;
  name: string;
  image: string;
  xPx: number;
  yPx: number;
  widthPx: number;
  heightPx: number;
  footSy: number;
  uMin?: number;
  uMax?: number;
  vMin?: number;
  vMax?: number;
  zMin?: number;
  zMax?: number;
}

export interface ISceneManifest {
  version: '2.0';
  id: string;
  displayName: string;
  baseBackdropImage: string | null;
  tiledMapJson: string | null;
  renderSpace: {
    mode: SceneRenderMode;
    widthPx: number;
    heightPx: number;
    sourceImageWidthPx?: number;
    sourceImageHeightPx?: number;
    imageScaleX?: number;
    imageScaleY?: number;
    coordinateSpace: 'stage-pixel' | 'world-meter';
  };
  worldBoundsMeters: { width: number; height: number };
  worldMapping: StageToWorldMapping | null;
  grid: GridMetrics;
  display: { levelLabel: string; zMeters: number; scale: number };
  spawn: { xPx: number; yPx: number };
  tiers: SceneTier[];
  /** Required for navmesh-json; may be null when Tiled object layers are authoritative. */
  navmeshData: string | null;
  /** When set to tiled-object-layers, navmesh data is derived from the imported Tiled object groups. */
  navigationSource?: 'navmesh-json' | 'tiled-object-layers';
  navigation?: { floorZ?: number; agentRadiusPx?: number; agentRadiusMeters?: number };
  foregroundSlices: ForegroundSlice[];
  source?: Record<string, unknown>;
}

export type SceneManifest = ISceneManifest;

export interface SceneIndex {
  version: string;
  project: string;
  scenes: Array<{ id: string; manifest: string }>;
  defaultScene: string;
  sharedAssets: {
    playerSheet: string;
    connectorRegister: string;
    assetRegister: string;
    traceRegister: string;
  };
}

export interface NavPolygon {
  polygon_id?: string;
  obstacle_id?: string;
  name: string;
  points_px: [number, number][];
  points_world_m?: [number, number][];
  allowed?: boolean;
  floor_z?: number;
  speed_modifier?: number;
  height_m?: number;
}

export interface ConnectorZone {
  zone_id: string;
  connector_id: string;
  type: string;
  target_map?: string;
  target_level?: string;
  trigger_polygon_px: [number, number][];
  label?: string;
  z_from?: number;
  z_to?: number;
  [key: string]: unknown;
}

export interface InteractionZone {
  interaction_id: string;
  name: string;
  object_id?: string;
  position_px: [number, number];
  radius_px: number;
  type: string;
  title: string;
  description: string;
}

export interface NavMeshData {
  map_id: string;
  level_id: string;
  floor_z: number;
  agent_radius_px: number;
  agent_radius_m: number;
  walkable_polygons: NavPolygon[];
  collision_polygons: NavPolygon[];
  connector_zones: ConnectorZone[];
  interaction_zones: InteractionZone[];
}

export interface LoadedScene extends SceneManifest {
  navmesh: NavMeshData;
  tiledMap?: import('../tiled/TiledJsonImporter').ImportedTiledMap;
  tiledDepthObjects?: import('../tiled/TiledNavigationExtractor').TiledDepthObject[];
  navigationDiagnostics?: string[];
}

export interface LoadedProject {
  index: SceneIndex;
  scenes: LoadedScene[];
  connectorRegister: Record<string, unknown>[];
  assetRegister: Record<string, unknown>[];
  traceRegister: Record<string, unknown>;
  baseUrl: string;
  defaultScene: string;
}

export function assertSceneManifest(value: unknown, expectedId?: string): asserts value is SceneManifest {
  if (!value || typeof value !== 'object') throw new Error('Szenen-Manifest ist kein JSON-Objekt.');
  const manifest = value as Partial<SceneManifest>;
  if (manifest.version !== '2.0') throw new Error(`Nicht unterstützte Manifest-Version: ${String(manifest.version)}`);
  if (typeof manifest.id !== 'string' || !manifest.id.trim()) throw new Error('Manifest benötigt eine nichtleere id.');
  if (expectedId && manifest.id !== expectedId) throw new Error(`Szenen-ID stimmt nicht: Index=${expectedId}, Manifest=${manifest.id}`);
  if (!manifest.renderSpace || !Number.isFinite(manifest.renderSpace.widthPx) || !Number.isFinite(manifest.renderSpace.heightPx)) {
    throw new Error(`${manifest.id}: renderSpace ist unvollständig.`);
  }
  if (manifest.renderSpace.widthPx <= 0 || manifest.renderSpace.heightPx <= 0) throw new Error(`${manifest.id}: Stage-Größe muss positiv sein.`);
  if (!manifest.grid || !Number.isFinite(manifest.grid.macroTileMeters) || manifest.grid.macroTileMeters <= 0) {
    throw new Error(`${manifest.id}: Grid-Metriken sind unvollständig.`);
  }
  if (!manifest.spawn || !Number.isFinite(manifest.spawn.xPx) || !Number.isFinite(manifest.spawn.yPx)) throw new Error(`${manifest.id}: Spawnpunkt fehlt.`);
  if (!Array.isArray(manifest.tiers) || manifest.tiers.length === 0) throw new Error(`${manifest.id}: mindestens ein Tier ist erforderlich.`);
  if (!Array.isArray(manifest.foregroundSlices)) throw new Error(`${manifest.id}: Slice-Liste fehlt.`);
  for (const slice of manifest.foregroundSlices) {
    if (!slice.cutaway) continue;
    const profile = slice.cutaway;
    if (![profile.fadeStartPx, profile.fadeEndPx, profile.minAlpha].every(Number.isFinite)
      || profile.fadeStartPx < 0 || profile.fadeEndPx <= profile.fadeStartPx
      || profile.minAlpha < 0 || profile.minAlpha > 1) {
      throw new Error(`${manifest.id} Slice ${slice.id}: ungültiges Cutaway-Profil.`);
    }
  }
  const navigationSource = manifest.navigationSource ?? 'navmesh-json';
  if (navigationSource !== 'navmesh-json' && navigationSource !== 'tiled-object-layers') throw new Error(`${manifest.id}: unbekannte navigationSource.`);
  if (navigationSource === 'navmesh-json' && (typeof manifest.navmeshData !== 'string' || !manifest.navmeshData)) {
    throw new Error(`${manifest.id}: navmesh-json benötigt navmeshData.`);
  }
  if (navigationSource === 'tiled-object-layers' && (typeof manifest.tiledMapJson !== 'string' || !manifest.tiledMapJson)) {
    throw new Error(`${manifest.id}: tiled-object-layers benötigt tiledMapJson.`);
  }
  if (navigationSource === 'tiled-object-layers' && manifest.renderSpace.mode === 'pre-rendered-stage'
    && (manifest.renderSpace.coordinateSpace !== 'stage-pixel' || manifest.grid.projection !== 'legacy-stage-calibrated' || !manifest.worldMapping)) {
    throw new Error(`${manifest.id}: Tiled-Overlay auf einer Legacy-Stage muss stage-pixel/legacy-stage-calibrated mit worldMapping verwenden.`);
  }
  if (navigationSource === 'tiled-object-layers' && manifest.renderSpace.mode === 'projected-world'
    && (manifest.renderSpace.coordinateSpace !== 'world-meter' || manifest.grid.projection !== 'dimetric-2-to-1')) {
    throw new Error(`${manifest.id}: Tiled-Navigation in projected-world benötigt world-meter/dimetric-2-to-1.`);
  }
  if (manifest.renderSpace.mode === 'pre-rendered-stage') {
    if (typeof manifest.baseBackdropImage !== 'string' || !manifest.baseBackdropImage) throw new Error(`${manifest.id}: Pre-rendered-Stage benötigt baseBackdropImage.`);
    if (!manifest.worldMapping) throw new Error(`${manifest.id}: Legacy-Stage benötigt worldMapping.`);
    if (manifest.renderSpace.coordinateSpace !== 'stage-pixel') throw new Error(`${manifest.id}: Pre-rendered-Stage muss stage-pixel verwenden.`);
    if (manifest.grid.projection !== 'legacy-stage-calibrated') throw new Error(`${manifest.id}: Pre-rendered-Stage muss Legacy-Projektion klar deklarieren.`);
  } else if (manifest.renderSpace.mode === 'projected-world') {
    if (manifest.renderSpace.coordinateSpace !== 'world-meter') throw new Error(`${manifest.id}: Projected-World muss world-meter verwenden.`);
    if (manifest.grid.projection !== 'dimetric-2-to-1') throw new Error(`${manifest.id}: Projected-World benötigt dimetric-2-to-1.`);
    if (typeof manifest.tiledMapJson !== 'string' || !manifest.tiledMapJson) throw new Error(`${manifest.id}: Projected-World benötigt tiledMapJson.`);
  } else {
    throw new Error(`${manifest.id}: unbekannter renderSpace.mode.`);
  }
}
