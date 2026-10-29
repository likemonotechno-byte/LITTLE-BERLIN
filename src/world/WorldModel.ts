/**
 * Shared data contracts for the KLEIN BERLIN hybrid world model.
 *
 * Coordinates in this file are meters. Modules own local coordinates; the world
 * index places modules in world space. Legacy stage pixels remain in SceneManifest.
 */

export type ProjectionType = 'dimetric-2-to-1';
export type ModuleRotation = 0 | 90 | 180 | 270;
export type LayerKind = 'reference-image' | 'tilemap' | 'vector-geometry' | 'asset-instances' | 'derived-navigation';
export type GeometryKind =
  | 'road-centerline'
  | 'walkway'
  | 'waterway'
  | 'parcel'
  | 'building-footprint'
  | 'plaza'
  | 'park'
  | 'walkable-area'
  | 'collision-area';
export type ConnectorKind = 'road' | 'footpath' | 'rail' | 'waterway' | 'stairs' | 'escalator' | 'elevator' | 'portal';
export type AssetCategory = 'building' | 'road' | 'ground' | 'vegetation' | 'street-furniture' | 'railway' | 'interior' | 'character' | 'other';

export interface Point2 { x: number; y: number }
export interface WorldPoint3 extends Point2 { z: number }
export interface Bounds3 { width: number; depth: number; height: number }

export interface ProjectManifest {
  schemaVersion: 1;
  projectId: string;
  name: string;
  engineCompatibility: string;
  units: 'meters';
  projection: {
    type: ProjectionType;
    tileWidthPx: number;
    tileHeightPx: number;
    referenceCellMeters: number;
    elevationPxPerMeter: number;
  };
  worldIndex: string;
  assetCatalog: string;
}

export interface WorldModuleReference {
  id: string;
  document: string;
  originMeters: WorldPoint3;
  rotationDegrees: ModuleRotation;
  boundsMeters: Bounds3;
}

export interface DistrictDefinition {
  id: string;
  name: string;
  modules: WorldModuleReference[];
}

export interface WorldDocument {
  schemaVersion: 1;
  worldId: string;
  name: string;
  districts: DistrictDefinition[];
}

export interface ModuleLevel {
  id: string;
  label: string;
  zMeters: number;
}

export interface LayerDefinition {
  id: string;
  name: string;
  kind: LayerKind;
  visibleInRuntime: boolean;
  locked?: boolean;
  opacity?: number;
}

export interface TilemapSource {
  id: string;
  format: 'tiled-json';
  source: string;
  layerId?: string;
}

export interface ReferenceImageSource {
  id: string;
  source: string;
  positionMeters: Point2;
  widthMeters: number;
  opacity: number;
  visibleInEditor: boolean;
}

export type GeometryShape =
  | { type: 'LineString'; pointsMeters: Point2[] }
  | { type: 'Polygon'; ringsMeters: Point2[][] };

export interface GeometryFeature {
  id: string;
  kind: GeometryKind;
  levelId: string;
  geometry: GeometryShape;
  widthMeters?: number;
  tags?: string[];
  properties?: Record<string, string | number | boolean | null>;
}

export interface AssetInstance {
  id: string;
  assetId: string;
  positionMeters: WorldPoint3;
  rotationDegrees: number;
  scale: { x: number; y: number; z: number };
  levelId: string;
  variant?: string;
  overrides?: Record<string, unknown>;
}

export interface ConnectorTarget {
  moduleId: string;
  connectorId: string;
}

export interface ConnectorEndpoint {
  id: string;
  type: ConnectorKind;
  levelId: string;
  positionMeters: WorldPoint3;
  /** Compass-like heading in the world plane: 0=east, 90=south, 180=west, 270=north. */
  headingDegrees: number;
  widthMeters: number;
  target?: ConnectorTarget | null;
  profile?: string;
}

export interface ModuleDocument {
  schemaVersion: 1;
  id: string;
  name: string;
  coordinateSpace: 'module-local-meters';
  boundsMeters: Bounds3;
  levels: ModuleLevel[];
  layers: LayerDefinition[];
  referenceImages: ReferenceImageSource[];
  tilemaps: TilemapSource[];
  geometries: GeometryFeature[];
  entities: AssetInstance[];
  connectors: ConnectorEndpoint[];
}

export interface AssetDefinition {
  schemaVersion: 1;
  id: string;
  category: AssetCategory;
  displayName: string;
  visual: {
    image: string;
    projection: ProjectionType;
    anchor: 'south-footpoint' | 'center' | 'custom';
    nominalWidthPx: number;
    nominalHeightPx: number;
  };
  footprint: { shape: 'polygon'; pointsMeters: Point2[] };
  heightMeters: number;
  collisionProfile: string;
  walkableTop: boolean;
  tags: string[];
  variants: string[];
  source: { type: 'project-asset' | 'external-asset' | 'generated'; license: string };
}

export interface AssetCatalog {
  schemaVersion: 1;
  assets: AssetDefinition[];
}

export interface LoadedWorldProject {
  project: ProjectManifest;
  world: WorldDocument;
  modules: Map<string, ModuleDocument>;
  assetCatalog: AssetCatalog;
}

export interface WorldValidationIssue {
  code: string;
  path: string;
  message: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isPositiveNumber = (value: unknown): value is number => isFiniteNumber(value) && value > 0;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertProjectPath(value: unknown, label: string): asserts value is string {
  assert(isNonEmptyString(value), `${label}: Pfad muss eine nichtleere Zeichenkette sein.`);
  assert(!value.startsWith('/') && !value.startsWith('\\') && !/^[a-zA-Z]:/.test(value), `${label}: absolute Pfade sind nicht erlaubt.`);
  const segments = value.replaceAll('\\', '/').split('/');
  assert(!segments.includes('..') && !segments.includes('.'), `${label}: relative Traversal-Segmente sind nicht erlaubt.`);
}

function assertPoint2(value: unknown, label: string): asserts value is Point2 {
  assert(isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y), `${label}: x/y müssen endliche Zahlen sein.`);
}

function assertPoint3(value: unknown, label: string): asserts value is WorldPoint3 {
  assert(isRecord(value), `${label}: Punkt muss ein Objekt sein.`);
  assertPoint2(value, label);
  assert(isFiniteNumber(value.z), `${label}: z muss eine endliche Zahl sein.`);
}

function assertBounds(value: unknown, label: string): asserts value is Bounds3 {
  assert(isRecord(value), `${label}: boundsMeters fehlt.`);
  assert(isPositiveNumber(value.width) && isPositiveNumber(value.depth) && isPositiveNumber(value.height), `${label}: width/depth/height müssen positiv sein.`);
}

function assertUniqueIds(items: Array<{ id: string }>, label: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    assert(isNonEmptyString(item.id), `${label}: ID darf nicht leer sein.`);
    assert(!seen.has(item.id), `${label}: doppelte ID '${item.id}'.`);
    seen.add(item.id);
  }
}

export function assertProjectManifest(value: unknown): asserts value is ProjectManifest {
  assert(isRecord(value), 'Projektmanifest muss ein JSON-Objekt sein.');
  assert(value.schemaVersion === 1, `Nicht unterstützte Projekt-Schema-Version: ${String(value.schemaVersion)}.`);
  assert(isNonEmptyString(value.projectId), 'Projektmanifest benötigt projectId.');
  assert(isNonEmptyString(value.name), 'Projektmanifest benötigt name.');
  assert(isNonEmptyString(value.engineCompatibility), 'Projektmanifest benötigt engineCompatibility.');
  assert(value.units === 'meters', 'Projektmanifest muss units="meters" verwenden.');
  assert(isRecord(value.projection), 'Projektmanifest benötigt projection.');
  assert(value.projection.type === 'dimetric-2-to-1', 'Nur dimetric-2-to-1 wird von World Model V1 unterstützt.');
  assert(isPositiveNumber(value.projection.tileWidthPx) && isPositiveNumber(value.projection.tileHeightPx), 'Projektions-Kachelmaße müssen positiv sein.');
  assert(isPositiveNumber(value.projection.referenceCellMeters) && isPositiveNumber(value.projection.elevationPxPerMeter), 'Projektionsmaßstab und Höhenmaßstab müssen positiv sein.');
  assertProjectPath(value.worldIndex, 'project.worldIndex');
  assertProjectPath(value.assetCatalog, 'project.assetCatalog');
}

export function assertWorldDocument(value: unknown): asserts value is WorldDocument {
  assert(isRecord(value), 'Weltindex muss ein JSON-Objekt sein.');
  assert(value.schemaVersion === 1, `Nicht unterstützte Weltindex-Schema-Version: ${String(value.schemaVersion)}.`);
  assert(isNonEmptyString(value.worldId) && isNonEmptyString(value.name), 'Weltindex benötigt worldId und name.');
  assert(Array.isArray(value.districts), 'Weltindex benötigt districts[].');
  assertUniqueIds(value.districts as Array<{ id: string }>, 'districts');
  for (const district of value.districts) {
    assert(isRecord(district) && isNonEmptyString(district.name) && Array.isArray(district.modules), 'Jeder Stadtteil benötigt name und modules[].');
    assertUniqueIds(district.modules as Array<{ id: string }>, `district '${String(district.id)}' modules`);
    for (const module of district.modules) {
      assert(isRecord(module), 'Modulreferenz muss ein Objekt sein.');
      assert(isNonEmptyString(module.id), 'Modulreferenz benötigt id.');
      assertProjectPath(module.document, `module '${module.id}'.document`);
      assertPoint3(module.originMeters, `module '${module.id}'.originMeters`);
      assert([0, 90, 180, 270].includes(module.rotationDegrees as number), `module '${module.id}': rotationDegrees muss 0, 90, 180 oder 270 sein.`);
      assertBounds(module.boundsMeters, `module '${module.id}'`);
    }
  }
}

export function assertModuleDocument(value: unknown): asserts value is ModuleDocument {
  assert(isRecord(value), 'Moduldokument muss ein JSON-Objekt sein.');
  assert(value.schemaVersion === 1, `Nicht unterstützte Modul-Schema-Version: ${String(value.schemaVersion)}.`);
  assert(isNonEmptyString(value.id) && isNonEmptyString(value.name), 'Modul benötigt id und name.');
  assert(value.coordinateSpace === 'module-local-meters', `Modul '${String(value.id)}' muss module-local-meters verwenden.`);
  assertBounds(value.boundsMeters, `Modul '${String(value.id)}'`);
  for (const key of ['levels', 'layers', 'referenceImages', 'tilemaps', 'geometries', 'entities', 'connectors'] as const) {
    assert(Array.isArray(value[key]), `Modul '${String(value.id)}' benötigt ${key}[].`);
  }
  const levelsList = value.levels as unknown[];
  const layersList = value.layers as unknown[];
  const referenceImagesList = value.referenceImages as unknown[];
  const tilemapsList = value.tilemaps as unknown[];
  const geometriesList = value.geometries as unknown[];
  const entitiesList = value.entities as unknown[];
  const connectorsList = value.connectors as unknown[];
  for (const [key, list] of Object.entries({ levels: levelsList, layers: layersList, referenceImages: referenceImagesList, tilemaps: tilemapsList, geometries: geometriesList, entities: entitiesList, connectors: connectorsList })) {
    assertUniqueIds(list as Array<{ id: string }>, `Modul '${String(value.id)}' ${key}`);
  }
  assert(levelsList.length > 0, `Modul '${String(value.id)}' braucht mindestens eine Höhenebene.`);
  const levels = new Set<string>();
  for (const level of levelsList) {
    assert(isRecord(level) && isNonEmptyString(level.id) && isNonEmptyString(level.label) && isFiniteNumber(level.zMeters), `Modul '${String(value.id)}': ungültige Höhenebene.`);
    levels.add(level.id);
  }
  const layers = new Set<string>();
  for (const layer of layersList) {
    assert(isRecord(layer) && isNonEmptyString(layer.name), `Modul '${String(value.id)}': ungültiger Layer.`);
    assert(['reference-image', 'tilemap', 'vector-geometry', 'asset-instances', 'derived-navigation'].includes(String(layer.kind)), `Modul '${String(value.id)}': unbekannter Layer-Typ '${String(layer.kind)}'.`);
    assert(typeof layer.visibleInRuntime === 'boolean', `Modul '${String(value.id)}': Layer visibleInRuntime muss boolesch sein.`);
    if (layer.opacity !== undefined) assert(isFiniteNumber(layer.opacity) && layer.opacity >= 0 && layer.opacity <= 1, `Modul '${String(value.id)}': Layer-Opacity muss zwischen 0 und 1 liegen.`);
    layers.add(String(layer.id));
  }
  for (const image of referenceImagesList) {
    assert(isRecord(image), 'Reference image muss ein Objekt sein.');
    assertProjectPath(image.source, `referenceImage '${String(image.id)}'.source`);
    assertPoint2(image.positionMeters, `referenceImage '${String(image.id)}'.positionMeters`);
    assert(isPositiveNumber(image.widthMeters), `referenceImage '${String(image.id)}'.widthMeters muss positiv sein.`);
    assert(isFiniteNumber(image.opacity) && image.opacity >= 0 && image.opacity <= 1, `referenceImage '${String(image.id)}'.opacity muss zwischen 0 und 1 liegen.`);
    assert(typeof image.visibleInEditor === 'boolean', `referenceImage '${String(image.id)}'.visibleInEditor muss boolesch sein.`);
  }
  for (const tilemap of tilemapsList) {
    assert(isRecord(tilemap) && tilemap.format === 'tiled-json', `Modul '${String(value.id)}': nur tiled-json tilemaps werden in V1 unterstützt.`);
    assertProjectPath(tilemap.source, `tilemap '${String(tilemap.id)}'.source`);
    if (tilemap.layerId !== undefined) assert(layers.has(String(tilemap.layerId)), `Tilemap '${String(tilemap.id)}' verweist auf fehlenden Layer '${String(tilemap.layerId)}'.`);
  }
  for (const feature of geometriesList) {
    assert(isRecord(feature) && isNonEmptyString(feature.id), `Modul '${String(value.id)}': ungültige Geometrie.`);
    assert(['road-centerline', 'walkway', 'waterway', 'parcel', 'building-footprint', 'plaza', 'park', 'walkable-area', 'collision-area'].includes(String(feature.kind)), `Geometrie '${String(feature.id)}': unbekannter Typ.`);
    assert(levels.has(String(feature.levelId)), `Geometrie '${String(feature.id)}' verwendet unbekannte levelId '${String(feature.levelId)}'.`);
    assert(isRecord(feature.geometry), `Geometrie '${String(feature.id)}' benötigt geometry.`);
    if (feature.geometry.type === 'LineString') {
      assert(Array.isArray(feature.geometry.pointsMeters) && feature.geometry.pointsMeters.length >= 2, `Linie '${String(feature.id)}' braucht mindestens zwei Punkte.`);
      for (const [index, point] of feature.geometry.pointsMeters.entries()) assertPoint2(point, `Geometrie '${String(feature.id)}'.pointsMeters[${index}]`);
      if (['road-centerline', 'walkway', 'waterway'].includes(String(feature.kind))) assert(isPositiveNumber(feature.widthMeters), `Linie '${String(feature.id)}' braucht eine positive Breite.`);
    } else if (feature.geometry.type === 'Polygon') {
      assert(Array.isArray(feature.geometry.ringsMeters) && feature.geometry.ringsMeters.length > 0, `Polygon '${String(feature.id)}' braucht mindestens einen Ring.`);
      for (const [ringIndex, ring] of feature.geometry.ringsMeters.entries()) {
        assert(Array.isArray(ring) && ring.length >= 3, `Polygon '${String(feature.id)}', Ring ${ringIndex}, braucht mindestens drei Punkte.`);
        for (const [pointIndex, point] of ring.entries()) assertPoint2(point, `Geometrie '${String(feature.id)}'.ringsMeters[${ringIndex}][${pointIndex}]`);
      }
    } else {
      throw new Error(`Geometrie '${String(feature.id)}': type muss LineString oder Polygon sein.`);
    }
  }
  for (const entity of entitiesList) {
    const entityLabel = isRecord(entity) ? String(entity.id) : '<invalid>';
    assert(isRecord(entity) && isNonEmptyString(entity.assetId), `Entität '${entityLabel}' benötigt assetId.`);
    assertPoint3(entity.positionMeters, `Entität '${String(entity.id)}'.positionMeters`);
    assert(isFiniteNumber(entity.rotationDegrees), `Entität '${String(entity.id)}'.rotationDegrees muss endlich sein.`);
    assert(isRecord(entity.scale) && isPositiveNumber(entity.scale.x) && isPositiveNumber(entity.scale.y) && isPositiveNumber(entity.scale.z), `Entität '${String(entity.id)}' braucht positive x/y/z-Skalierung.`);
    assert(levels.has(String(entity.levelId)), `Entität '${String(entity.id)}' verwendet unbekannte levelId '${String(entity.levelId)}'.`);
  }
  for (const connector of connectorsList) {
    const connectorLabel = isRecord(connector) ? String(connector.id) : '<invalid>';
    assert(isRecord(connector) && ['road', 'footpath', 'rail', 'waterway', 'stairs', 'escalator', 'elevator', 'portal'].includes(String(connector.type)), `Connector '${connectorLabel}': unbekannter Typ.`);
    assert(levels.has(String(connector.levelId)), `Connector '${String(connector.id)}' verwendet unbekannte levelId '${String(connector.levelId)}'.`);
    assertPoint3(connector.positionMeters, `Connector '${String(connector.id)}'.positionMeters`);
    assert(isFiniteNumber(connector.headingDegrees) && connector.headingDegrees >= 0 && connector.headingDegrees < 360, `Connector '${String(connector.id)}': headingDegrees muss in [0,360) liegen.`);
    assert(isPositiveNumber(connector.widthMeters), `Connector '${String(connector.id)}': widthMeters muss positiv sein.`);
    if (connector.target !== undefined && connector.target !== null) {
      assert(isRecord(connector.target) && isNonEmptyString(connector.target.moduleId) && isNonEmptyString(connector.target.connectorId), `Connector '${String(connector.id)}': target benötigt moduleId und connectorId.`);
    }
  }
}

export function assertAssetCatalog(value: unknown): asserts value is AssetCatalog {
  assert(isRecord(value), 'Asset-Katalog muss ein JSON-Objekt sein.');
  assert(value.schemaVersion === 1, `Nicht unterstützte Asset-Katalog-Schema-Version: ${String(value.schemaVersion)}.`);
  assert(Array.isArray(value.assets), 'Asset-Katalog benötigt assets[].');
  assertUniqueIds(value.assets as Array<{ id: string }>, 'assets');
  for (const asset of value.assets) {
    assert(isRecord(asset) && isNonEmptyString(asset.displayName), 'Asset benötigt displayName.');
    assert(['building', 'road', 'ground', 'vegetation', 'street-furniture', 'railway', 'interior', 'character', 'other'].includes(String(asset.category)), `Asset '${String(asset.id)}': unbekannte Kategorie.`);
    assert(isRecord(asset.visual), `Asset '${String(asset.id)}' benötigt visual.`);
    assertProjectPath(asset.visual.image, `Asset '${String(asset.id)}'.visual.image`);
    assert(asset.visual.projection === 'dimetric-2-to-1', `Asset '${String(asset.id)}': unbekannte Projektion.`);
    assert(['south-footpoint', 'center', 'custom'].includes(String(asset.visual.anchor)), `Asset '${String(asset.id)}': unbekannter Anchor.`);
    assert(isPositiveNumber(asset.visual.nominalWidthPx) && isPositiveNumber(asset.visual.nominalHeightPx), `Asset '${String(asset.id)}': nominale Pixelmaße müssen positiv sein.`);
    assert(isRecord(asset.footprint) && asset.footprint.shape === 'polygon' && Array.isArray(asset.footprint.pointsMeters) && asset.footprint.pointsMeters.length >= 3, `Asset '${String(asset.id)}' benötigt ein Polygon-Footprint.`);
    for (const [index, point] of asset.footprint.pointsMeters.entries()) assertPoint2(point, `Asset '${String(asset.id)}'.footprint[${index}]`);
    assert(isFiniteNumber(asset.heightMeters) && asset.heightMeters >= 0, `Asset '${String(asset.id)}': heightMeters darf nicht negativ sein.`);
    assert(isNonEmptyString(asset.collisionProfile), `Asset '${String(asset.id)}' benötigt collisionProfile.`);
    assert(typeof asset.walkableTop === 'boolean', `Asset '${String(asset.id)}'.walkableTop muss boolesch sein.`);
    assert(Array.isArray(asset.tags) && asset.tags.every(isNonEmptyString), `Asset '${String(asset.id)}'.tags muss eine Liste nichtleerer Strings sein.`);
    assert(Array.isArray(asset.variants) && asset.variants.every(isNonEmptyString), `Asset '${String(asset.id)}'.variants muss eine Liste nichtleerer Strings sein.`);
    assert(isRecord(asset.source) && ['project-asset', 'external-asset', 'generated'].includes(String(asset.source.type)) && isNonEmptyString(asset.source.license), `Asset '${String(asset.id)}' benötigt Herkunft und Lizenzstatus.`);
  }
}

export function moduleLocalToWorld(local: WorldPoint3, origin: WorldPoint3, rotationDegrees: ModuleRotation): WorldPoint3 {
  assertPoint3(local, 'local');
  assertPoint3(origin, 'origin');
  assert([0, 90, 180, 270].includes(rotationDegrees), 'rotationDegrees muss 0, 90, 180 oder 270 sein.');
  let x: number;
  let y: number;
  switch (rotationDegrees) {
    case 0: x = local.x; y = local.y; break;
    case 90: x = -local.y; y = local.x; break;
    case 180: x = -local.x; y = -local.y; break;
    case 270: x = local.y; y = -local.x; break;
  }
  return { x: origin.x + x, y: origin.y + y, z: origin.z + local.z };
}

export function worldToModuleLocal(world: WorldPoint3, origin: WorldPoint3, rotationDegrees: ModuleRotation): WorldPoint3 {
  assertPoint3(world, 'world');
  assertPoint3(origin, 'origin');
  assert([0, 90, 180, 270].includes(rotationDegrees), 'rotationDegrees muss 0, 90, 180 oder 270 sein.');
  const x = world.x - origin.x;
  const y = world.y - origin.y;
  let localX: number;
  let localY: number;
  switch (rotationDegrees) {
    case 0: localX = x; localY = y; break;
    case 90: localX = y; localY = -x; break;
    case 180: localX = -x; localY = -y; break;
    case 270: localX = -y; localY = x; break;
  }
  return { x: localX, y: localY, z: world.z - origin.z };
}

function normalizeHeading(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function angleDifference(a: number, b: number): number {
  const diff = Math.abs(normalizeHeading(a) - normalizeHeading(b));
  return Math.min(diff, 360 - diff);
}

export function validateWorldProject(project: ProjectManifest, world: WorldDocument, modules: Map<string, ModuleDocument>, assetCatalog: AssetCatalog): WorldValidationIssue[] {
  const issues: WorldValidationIssue[] = [];
  const moduleRefs = new Map<string, WorldModuleReference>();
  const districts = new Set<string>();
  for (const district of world.districts) {
    if (districts.has(district.id)) issues.push({ code: 'WORLD_DUPLICATE_DISTRICT', path: `world.districts.${district.id}`, message: `Stadtteil-ID '${district.id}' ist doppelt.` });
    districts.add(district.id);
    for (const ref of district.modules) {
      if (moduleRefs.has(ref.id)) issues.push({ code: 'WORLD_DUPLICATE_MODULE', path: `world.modules.${ref.id}`, message: `Modul-ID '${ref.id}' wird mehrfach referenziert.` });
      moduleRefs.set(ref.id, ref);
      const module = modules.get(ref.id);
      if (!module) {
        issues.push({ code: 'WORLD_MODULE_MISSING', path: `world.modules.${ref.id}`, message: `Moduldokument '${ref.document}' wurde nicht geladen.` });
        continue;
      }
      if (module.id !== ref.id) issues.push({ code: 'WORLD_MODULE_ID_MISMATCH', path: `world.modules.${ref.id}`, message: `Referenz-ID '${ref.id}' stimmt nicht mit Moduldokument-ID '${module.id}' überein.` });
      for (const axis of ['width', 'depth', 'height'] as const) {
        if (Math.abs(module.boundsMeters[axis] - ref.boundsMeters[axis]) > 0.001) issues.push({ code: 'WORLD_BOUNDS_MISMATCH', path: `world.modules.${ref.id}.boundsMeters.${axis}`, message: `World-Index und Modul haben unterschiedliche ${axis}-Bounds.` });
      }
    }
  }
  const assetIds = new Set(assetCatalog.assets.map((asset) => asset.id));
  for (const [moduleId, module] of modules) {
    if (!moduleRefs.has(moduleId)) issues.push({ code: 'WORLD_ORPHAN_MODULE', path: `modules.${moduleId}`, message: `Modul '${moduleId}' ist nicht im Weltindex eingetragen.` });
    for (const entity of module.entities) if (!assetIds.has(entity.assetId)) issues.push({ code: 'WORLD_ASSET_MISSING', path: `modules.${moduleId}.entities.${entity.id}`, message: `Asset '${entity.assetId}' existiert nicht im Asset-Katalog.` });
    for (const connector of module.connectors) {
      if (!connector.target) continue;
      const targetRef = moduleRefs.get(connector.target.moduleId);
      const targetModule = modules.get(connector.target.moduleId);
      if (!targetRef || !targetModule) {
        issues.push({ code: 'WORLD_CONNECTOR_TARGET_MISSING', path: `modules.${moduleId}.connectors.${connector.id}`, message: `Zielmodul '${connector.target.moduleId}' existiert nicht.` });
        continue;
      }
      const target = targetModule.connectors.find((item) => item.id === connector.target?.connectorId);
      if (!target) {
        issues.push({ code: 'WORLD_CONNECTOR_TARGET_MISSING', path: `modules.${moduleId}.connectors.${connector.id}`, message: `Zielanschluss '${connector.target.connectorId}' existiert nicht in '${connector.target.moduleId}'.` });
        continue;
      }
      if (target.type !== connector.type) issues.push({ code: 'WORLD_CONNECTOR_TYPE_MISMATCH', path: `modules.${moduleId}.connectors.${connector.id}`, message: `Anschlusstyp '${connector.type}' passt nicht zu '${target.type}'.` });
      if (target.target?.moduleId !== moduleId || target.target.connectorId !== connector.id) issues.push({ code: 'WORLD_CONNECTOR_NOT_RECIPROCAL', path: `modules.${moduleId}.connectors.${connector.id}`, message: `Anschlussziel muss zurück auf '${moduleId}/${connector.id}' zeigen.` });
      const worldA = moduleLocalToWorld(connector.positionMeters, moduleRefs.get(moduleId)?.originMeters ?? { x: 0, y: 0, z: 0 }, moduleRefs.get(moduleId)?.rotationDegrees ?? 0);
      const worldB = moduleLocalToWorld(target.positionMeters, targetRef.originMeters, targetRef.rotationDegrees);
      if (Math.hypot(worldA.x - worldB.x, worldA.y - worldB.y, worldA.z - worldB.z) > 0.01) issues.push({ code: 'WORLD_CONNECTOR_POSITION_MISMATCH', path: `modules.${moduleId}.connectors.${connector.id}`, message: 'Verbundene Anschlüsse liegen nicht am selben Weltpunkt (Toleranz 0,01 m).' });
      const headingA = normalizeHeading(connector.headingDegrees + (moduleRefs.get(moduleId)?.rotationDegrees ?? 0));
      const headingB = normalizeHeading(target.headingDegrees + targetRef.rotationDegrees);
      if (angleDifference(headingA, headingB) < 179 || angleDifference(headingA, headingB) > 181) issues.push({ code: 'WORLD_CONNECTOR_HEADING_MISMATCH', path: `modules.${moduleId}.connectors.${connector.id}`, message: 'Verbundene Anschlüsse müssen in entgegengesetzte Richtungen zeigen.' });
      if (Math.abs(connector.widthMeters - target.widthMeters) > 0.01) issues.push({ code: 'WORLD_CONNECTOR_WIDTH_MISMATCH', path: `modules.${moduleId}.connectors.${connector.id}`, message: 'Verbundene Anschlüsse müssen dieselbe Breite haben (Toleranz 0,01 m).' });
    }
  }
  if (!project.worldIndex || !project.assetCatalog) issues.push({ code: 'WORLD_PROJECT_PATHS_MISSING', path: 'project', message: 'Projekt benötigt Weltindex und Asset-Katalog.' });
  return issues;
}
