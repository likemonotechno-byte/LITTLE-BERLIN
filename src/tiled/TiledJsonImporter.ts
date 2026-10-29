import type { SceneManifest } from '../core/SceneManifest';

export type TiledLayerType = 'tilelayer' | 'objectgroup' | 'imagelayer' | 'group';
export interface TiledProperty { name: string; type?: string; value: unknown }
export interface TiledPoint { x: number; y: number }
export interface TiledObject {
  id: number;
  gid?: number;
  name?: string;
  type?: string;
  class?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  visible?: boolean;
  point?: boolean;
  ellipse?: boolean;
  polygon?: TiledPoint[];
  polyline?: TiledPoint[];
  properties?: TiledProperty[];
  [key: string]: unknown;
}
export interface TiledLayer {
  id?: number;
  name: string;
  type: TiledLayerType;
  visible?: boolean;
  opacity?: number;
  x?: number;
  y?: number;
  offsetx?: number;
  offsety?: number;
  width?: number;
  height?: number;
  data?: number[];
  encoding?: string;
  compression?: string;
  chunks?: Array<{ x: number; y: number; width: number; height: number; data: number[] }>;
  objects?: TiledObject[];
  layers?: TiledLayer[];
  properties?: TiledProperty[];
  [key: string]: unknown;
}
export interface TiledTileset {
  firstgid: number;
  source?: string;
  name: string;
  tilewidth: number;
  tileheight: number;
  tilecount?: number;
  columns?: number;
  image?: string;
  imagewidth?: number;
  imageheight?: number;
  margin?: number;
  spacing?: number;
  tileoffset?: { x: number; y: number };
  tiles?: Array<Record<string, unknown> & { id: number; image?: string }>;
  [key: string]: unknown;
}
export interface TiledMapJson {
  type?: string;
  version?: string | number;
  tiledversion?: string;
  orientation: string;
  renderorder?: string;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  infinite?: boolean;
  layers: TiledLayer[];
  tilesets: TiledTileset[];
  properties?: TiledProperty[];
  [key: string]: unknown;
}
export interface ImportedTileset extends TiledTileset {
  /** Path relative to the Vite public root, resolved from the map or external TSJ file. */
  imagePath: string;
}
export interface ImportedTiledLayer {
  id?: number;
  name: string;
  type: Exclude<TiledLayerType, 'group'>;
  visible: boolean;
  opacity: number;
  offsetx: number;
  offsety: number;
  data?: number[];
  objects?: TiledObject[];
  width?: number;
  height?: number;
  properties?: TiledProperty[];
  raw: TiledLayer;
}
export interface ImportedTiledMap {
  sourcePath: string;
  data: TiledMapJson;
  tilesets: ImportedTileset[];
  layers: ImportedTiledLayer[];
  stats: { tileLayers: number; objectLayers: number; tileCount: number; objectCount: number };
}

export type TiledJsonResolver = (publicRelativePath: string) => Promise<unknown>;

/** Normalizes path fragments relative to a file under Vite's public root. */
export function resolvePublicRelativePath(fromFile: string, relativePath: string): string {
  if (!relativePath.trim()) throw new Error('Tiled-Assetpfad darf nicht leer sein.');
  if (/^(?:[a-z]+:)?\/\//i.test(relativePath) || relativePath.startsWith('data:')) {
    throw new Error(`Externe oder eingebettete Tiled-Asset-URLs werden nicht unterstützt: ${relativePath}`);
  }
  const input = relativePath.startsWith('/') ? relativePath.slice(1) : `${fromFile.split('/').slice(0, -1).join('/')}/${relativePath}`;
  const stack: string[] = [];
  for (const part of input.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (stack.length === 0) throw new Error(`Tiled-Pfad verlässt den public-Assetbereich: ${relativePath}`);
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.join('/');
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} muss ein JSON-Objekt sein.`);
  return value as Record<string, unknown>;
}
function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
function properties(value: unknown): TiledProperty[] | undefined {
  return Array.isArray(value) ? value as TiledProperty[] : undefined;
}
function flattenLayers(
  value: unknown,
  parent = '',
  parentVisible = true,
  parentOpacity = 1,
  parentOffsetX = 0,
  parentOffsetY = 0,
): ImportedTiledLayer[] {
  if (!Array.isArray(value)) throw new Error('Tiled-Map benötigt layers[].');
  const result: ImportedTiledLayer[] = [];
  for (const entry of value) {
    const layer = object(entry, 'Tiled-Layer') as unknown as TiledLayer;
    if (typeof layer.name !== 'string' || !layer.name.trim()) throw new Error('Jeder Tiled-Layer benötigt einen Namen.');
    const visible = parentVisible && layer.visible !== false;
    const opacity = parentOpacity * (typeof layer.opacity === 'number' ? layer.opacity : 1);
    const offsetx = parentOffsetX + (layer.offsetx ?? 0);
    const offsety = parentOffsetY + (layer.offsety ?? 0);
    if (layer.type === 'group') {
      const prefix = parent ? `${parent}/${layer.name}` : layer.name;
      result.push(...flattenLayers(layer.layers ?? [], prefix, visible, opacity, offsetx, offsety));
      continue;
    }
    if (!['tilelayer', 'objectgroup', 'imagelayer'].includes(layer.type)) throw new Error(`${layer.name}: unbekannter Tiled-Layertyp ${String(layer.type)}.`);
    result.push({
      id: layer.id,
      name: parent ? `${parent}/${layer.name}` : layer.name,
      type: layer.type as Exclude<TiledLayerType, 'group'>,
      visible,
      opacity,
      offsetx,
      offsety,
      data: layer.data,
      objects: layer.objects,
      width: layer.width,
      height: layer.height,
      properties: properties(layer.properties),
      raw: layer,
    });
  }
  return result;
}

function validateTileLayer(layer: TiledLayer, map: TiledMapJson): number {
  if (layer.encoding || layer.compression) {
    throw new Error(`${layer.name}: komprimierte/base64-Tile-Layer werden noch nicht unterstützt; bitte als unkomprimiertes Tiled-JSON exportieren.`);
  }
  if (!Array.isArray(layer.data)) throw new Error(`${layer.name}: endlicher Tile-Layer benötigt data[].`);
  const layerWidth = layer.width ?? map.width;
  const layerHeight = layer.height ?? map.height;
  if (layer.data.length !== layerWidth * layerHeight) {
    throw new Error(`${layer.name}: ${layer.data.length} GIDs vorhanden; erwartet ${layerWidth * layerHeight} (${layerWidth}×${layerHeight}).`);
  }
  if (layer.data.some((gid) => !Number.isInteger(gid) || gid < 0)) throw new Error(`${layer.name}: GIDs müssen nichtnegative Ganzzahlen sein.`);
  return layer.data.filter((gid) => gid > 0).length;
}

function validateObjectLayer(layer: TiledLayer): number {
  if (!Array.isArray(layer.objects)) throw new Error(`${layer.name}: Object-Layer benötigt objects[].`);
  for (const item of layer.objects) {
    if (!Number.isFinite(item.x) || !Number.isFinite(item.y)) throw new Error(`${layer.name}: Objekt ${item.id} hat keine endliche Position.`);
    if (item.polygon && item.polygon.length < 3) throw new Error(`${layer.name}: Polygonobjekt ${item.id} hat weniger als drei Punkte.`);
    if (item.polygon?.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
      throw new Error(`${layer.name}: Polygonobjekt ${item.id} enthält ungültige Punkte.`);
    }
  }
  return layer.objects.length;
}

/** Imports a Tiled JSON map, inlining external TSJ references for Phaser 3.90. */
export async function importTiledJson(
  sourcePath: string,
  source: unknown,
  resolveJson: TiledJsonResolver,
  manifest?: Pick<SceneManifest, 'grid' | 'renderSpace'>,
): Promise<ImportedTiledMap> {
  const raw = object(source, `Tiled-Map ${sourcePath}`) as unknown as TiledMapJson;
  if (raw.type && raw.type !== 'map') throw new Error(`${sourcePath}: Tiled-Datei ist kein Map-Dokument.`);
  if (raw.orientation !== 'isometric') throw new Error(`${sourcePath}: Orientierung muss in Tiled auf Isometric (Diamond) stehen; gefunden: ${String(raw.orientation)}.`);
  if (!finitePositive(raw.tilewidth) || !finitePositive(raw.tileheight)) throw new Error(`${sourcePath}: tilewidth/tileheight müssen positiv sein.`);
  if (raw.tilewidth / raw.tileheight < 1.99 || raw.tilewidth / raw.tileheight > 2.01) {
    throw new Error(`${sourcePath}: 2:1-Dimetrie erwartet (tilewidth:tileheight ≈ 2:1), gefunden ${raw.tilewidth}:${raw.tileheight}.`);
  }
  if (raw.infinite) {
    throw new Error(`${sourcePath}: Infinite-Tiled-Maps mit Chunks sind in diesem Importerstand noch nicht unterstützt; bitte eine endliche Isometric-Diamond-Map exportieren.`);
  }
  if (!finitePositive(raw.width) || !finitePositive(raw.height)) {
    throw new Error(`${sourcePath}: endliche Map benötigt positive width/height.`);
  }
  const stageOverlay = manifest?.renderSpace.mode === 'pre-rendered-stage' && manifest.renderSpace.coordinateSpace === 'stage-pixel';
  if (manifest && manifest.grid.projection !== 'dimetric-2-to-1' && !stageOverlay) {
    throw new Error(`${sourcePath}: Tiled-Import benötigt dimetric-2-to-1 oder einen expliziten Legacy-Stage-Overlay.`);
  }
  if (manifest && (manifest.grid.tilePixelWidth !== raw.tilewidth || manifest.grid.tilePixelHeight !== raw.tileheight)) {
    throw new Error(`${sourcePath}: Tiled-Kachelgröße ${raw.tilewidth}×${raw.tileheight} passt nicht zum Manifest-Grid ${manifest.grid.tilePixelWidth}×${manifest.grid.tilePixelHeight}.`);
  }
  if (!Array.isArray(raw.layers)) throw new Error(`${sourcePath}: layers[] fehlt.`);
  if (!Array.isArray(raw.tilesets)) throw new Error(`${sourcePath}: tilesets[] fehlt.`);
  if (!stageOverlay && raw.tilesets.length === 0) throw new Error(`${sourcePath}: mindestens ein Tileset ist erforderlich.`)

  const tilesets: ImportedTileset[] = [];
  const embedded = [] as TiledTileset[];
  let previousFirstGid = 0;
  for (const refUnknown of raw.tilesets) {
    const ref = object(refUnknown, 'Tiled-Tileset-Referenz') as unknown as TiledTileset;
    if (!Number.isInteger(ref.firstgid) || ref.firstgid <= previousFirstGid) throw new Error(`${sourcePath}: tilesets müssen nach firstgid streng aufsteigend sortiert sein.`);
    previousFirstGid = ref.firstgid;
    let tileset: TiledTileset;
    let tilesetPath = sourcePath;
    if (typeof ref.source === 'string') {
      const externalPath = resolvePublicRelativePath(sourcePath, ref.source);
      const loaded = object(await resolveJson(externalPath), `Tileset ${externalPath}`) as unknown as TiledTileset;
      tileset = { ...loaded, firstgid: ref.firstgid };
      tilesetPath = externalPath;
    } else {
      tileset = { ...ref };
    }
    if (typeof tileset.name !== 'string' || !tileset.name.trim()) throw new Error(`${sourcePath}: Tileset ohne name (firstgid=${ref.firstgid}).`);
    if (!finitePositive(tileset.tilewidth) || !finitePositive(tileset.tileheight)) throw new Error(`${tileset.name}: tilewidth/tileheight müssen positiv sein.`);
    if (typeof tileset.image !== 'string' || !tileset.image) {
      throw new Error(`${tileset.name}: Phaser 3.90 benötigt ein atlas-basiertes Tileset mit einer gemeinsamen image-Datei; Image-Collection-Tilesets werden nicht unterstützt.`);
    }
    if (tileset.tiles?.some((tile) => typeof tile.image === 'string')) {
      throw new Error(`${tileset.name}: Image-Collection-Tilesets werden nicht unterstützt; bitte alle Tiles in eine Atlas-Datei packen.`);
    }
    if (tileset.columns !== undefined && (!Number.isInteger(tileset.columns) || tileset.columns < 1)) throw new Error(`${tileset.name}: columns muss eine positive Ganzzahl sein.`);
    if (tileset.tilecount !== undefined && (!Number.isInteger(tileset.tilecount) || tileset.tilecount < 1)) throw new Error(`${tileset.name}: tilecount muss eine positive Ganzzahl sein.`);
    const imagePath = resolvePublicRelativePath(tilesetPath, tileset.image);
    const normalized: TiledTileset = { ...tileset, firstgid: ref.firstgid, image: imagePath };
    embedded.push(normalized);
    tilesets.push({ ...normalized, imagePath });
  }
  const normalizeLayerPos = (layer: TiledLayer): TiledLayer => ({
    ...layer,
    x: typeof layer.x === 'number' && Number.isFinite(layer.x) ? layer.x : 0,
    y: typeof layer.y === 'number' && Number.isFinite(layer.y) ? layer.y : 0,
    offsetx: typeof layer.offsetx === 'number' && Number.isFinite(layer.offsetx) ? layer.offsetx : 0,
    offsety: typeof layer.offsety === 'number' && Number.isFinite(layer.offsety) ? layer.offsety : 0,
    ...(Array.isArray(layer.layers) ? { layers: layer.layers.map(normalizeLayerPos) } : {}),
  });
  const normalizedMap: TiledMapJson = {
    ...raw,
    tilesets: embedded,
    layers: raw.layers.map(normalizeLayerPos),
  };
  const layers = flattenLayers(raw.layers);
  let tileCount = 0;
  let objectCount = 0;
  let tileLayers = 0;
  let objectLayers = 0;
  for (const layer of layers) {
    if (layer.type === 'tilelayer') {
      tileCount += validateTileLayer(layer.raw, normalizedMap);
      tileLayers++;
    } else if (layer.type === 'objectgroup') {
      objectCount += validateObjectLayer(layer.raw);
      objectLayers++;
    }
  }
  if (!stageOverlay && tileLayers === 0) throw new Error(`${sourcePath}: Map enthält keinen Tile-Layer.`);
  if (stageOverlay && tileLayers === 0 && objectLayers === 0) throw new Error(`${sourcePath}: Legacy-Stage-Overlay benötigt mindestens einen Objekt-Layer.`);
  if (tileLayers > 0 && tilesets.length === 0) throw new Error(`${sourcePath}: Tile-Layer benötigen mindestens ein Tileset.`);
  return { sourcePath, data: normalizedMap, tilesets, layers, stats: { tileLayers, objectLayers, tileCount, objectCount } };
}

export function getTiledProperty(layerOrObject: { properties?: TiledProperty[] }, key: string): unknown {
  return properties(layerOrObject.properties)?.find((property) => property.name === key)?.value;
}
