import type { ConnectorZone, InteractionZone, NavMeshData, NavPolygon } from '../core/SceneManifest';
import type { ImportedTiledLayer, TiledObject, TiledPoint } from './TiledJsonImporter';
import type { ScreenBounds } from '../rendering/MultiTierDepthSorter';
import type { CutawayProfile } from '../rendering/CutawayController';

export type TiledSemanticRole = 'walkable' | 'collision' | 'connector' | 'interaction' | 'occluder' | 'renderable';

export interface TiledDepthObject {
  id: string;
  objectId: number;
  layerId?: number;
  name: string;
  tier: number;
  footSy: number;
  bounds: ScreenBounds;
  before: string[];
  after: string[];
  renderRole: string;
  sourceLayer: string;
  /** Optional property-driven fade for roof/foreground tile-objects. */
  cutaway?: CutawayProfile;
}

export interface TiledNavigationOptions {
  mapId: string;
  levelId: string;
  floorZ?: number;
  agentRadiusPx?: number;
  agentRadiusMeters?: number;
  /** Scale coordinates from Tiled editor pixels into the runtime scene coordinate space. */
  coordinateScaleX?: number;
  coordinateScaleY?: number;
}

export interface TiledDerivedSceneData {
  navmesh: NavMeshData;
  depthObjects: TiledDepthObject[];
  stats: {
    walkablePolygons: number;
    collisionPolygons: number;
    connectors: number;
    interactions: number;
    depthObjects: number;
    ignoredObjects: number;
  };
  diagnostics: string[];
}

type Point = [number, number];

const propertyValue = (record: { properties?: Array<{ name: string; value: unknown }> }, key: string): unknown =>
  record.properties?.find((property) => property.name === key)?.value;

const getProp = (object: TiledObject, ...names: string[]): unknown => {
  for (const name of names) {
    const value = propertyValue(object, name);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};
const asString = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback;
const asNumber = (value: unknown, fallback: number): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const asBoolean = (value: unknown, fallback: boolean): boolean => typeof value === 'boolean' ? value : fallback;
const listOfIds = (value: unknown, mapId: string): string[] => {
  const raw = Array.isArray(value) ? value.map(String)
    : typeof value === 'number' ? [String(value)]
      : typeof value === 'string' ? value.split(/[;,]/) : [];
  return raw.map((x) => x.trim()).filter(Boolean).map((x) => /^\d+$/.test(x) ? `tiled-${mapId}-obj-${x}` : x);
};
const normalize = (value: unknown): string => String(value ?? '').toLowerCase().replace(/[^a-z0-9_-]+/g, '');

function classifyToken(value: unknown): TiledSemanticRole | undefined {
  const token = normalize(value);
  if (/walkable|walksurface|navigation|navsurface|floorarea|patharea/.test(token)) return 'walkable';
  if (/collision|obstacle|blocked|blocker|solid|impassable/.test(token)) return 'collision';
  if (/connector|portal|transition|elevator|lift|stairs|stairwell|escalator/.test(token)) return 'connector';
  if (/interaction|interact|hotspot|trigger|actionzone/.test(token)) return 'interaction';
  if (/occluder|occlusion|depthobject|depthsort|foregroundslice/.test(token)) return 'occluder';
  if (/renderable|spriteobject/.test(token)) return 'renderable';
  return undefined;
}

function getLayerRole(layer: ImportedTiledLayer): TiledSemanticRole | undefined {
  return classifyToken(propertyValue(layer, 'navigationRole'))
    ?? classifyToken(propertyValue(layer, 'navRole'))
    ?? classifyToken(propertyValue(layer, 'role'))
    ?? classifyToken(layer.name.split('/').at(-1));
}

function getObjectRole(object: TiledObject, layerRole?: TiledSemanticRole): TiledSemanticRole | undefined {
  return classifyToken(getProp(object, 'navigationRole', 'navRole', 'kbRole', 'role', 'kind'))
    ?? classifyToken(object.class)
    ?? classifyToken(object.type)
    ?? layerRole;
}

function tierFor(layer: ImportedTiledLayer, object: TiledObject, fallback: number): number {
  const explicit = getProp(object, 'tier', 'tierId', 'floorZ');
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return explicit;
  const layerExplicit = propertyValue(layer, 'tier') ?? propertyValue(layer, 'tierId') ?? propertyValue(layer, 'floorZ');
  if (typeof layerExplicit === 'number' && Number.isFinite(layerExplicit)) return layerExplicit;
  const name = `${layer.name} ${object.name ?? ''}`;
  const match = name.match(/(?:tier|floor|level)[\s_-]*(-?\d+)/i);
  return match ? Number(match[1]) : fallback;
}

function objectBase(object: TiledObject, layer: ImportedTiledLayer, scaleX = 1, scaleY = 1): Point {
  return [(object.x + layer.offsetx) * scaleX, (object.y + layer.offsety) * scaleY];
}

function rotateLocal(point: TiledPoint, rotationDegrees = 0): Point {
  const radians = rotationDegrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [point.x * cos - point.y * sin, point.x * sin + point.y * cos];
}

/** Returns a closed shape in the same rendered pixel coordinate space as Tiled objects. */
function objectPolygon(object: TiledObject, layer: ImportedTiledLayer, circleRadius?: number, scaleX = 1, scaleY = 1): Point[] | null {
  const [baseX, baseY] = objectBase(object, layer, scaleX, scaleY);
  let localPoints: TiledPoint[];
  if (Array.isArray(object.polygon) && object.polygon.length >= 3) {
    localPoints = object.polygon;
  } else if (typeof object.gid === 'number' && object.gid > 0 && (object.width ?? 0) > 0 && (object.height ?? 0) > 0) {
    // Tiled tile-objects use their lower-left anchor, unlike rectangle objects.
    localPoints = [
      { x: 0, y: -object.height! }, { x: object.width!, y: -object.height! },
      { x: object.width!, y: 0 }, { x: 0, y: 0 },
    ];
  } else if (object.ellipse && (object.width ?? 0) > 0 && (object.height ?? 0) > 0) {
    const count = 16;
    localPoints = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      return { x: (object.width! / 2) + Math.cos(angle) * object.width! / 2, y: (object.height! / 2) + Math.sin(angle) * object.height! / 2 };
    });
  } else if ((object.width ?? 0) > 0 && (object.height ?? 0) > 0) {
    localPoints = [
      { x: 0, y: 0 }, { x: object.width!, y: 0 },
      { x: object.width!, y: object.height! }, { x: 0, y: object.height! },
    ];
  } else if (circleRadius && circleRadius > 0) {
    localPoints = Array.from({ length: 16 }, (_, i) => {
      const angle = (i / 16) * Math.PI * 2;
      return { x: Math.cos(angle) * circleRadius, y: Math.sin(angle) * circleRadius };
    });
  } else {
    return null;
  }
  const points = localPoints.map((point) => {
    const [rx, ry] = rotateLocal(point, object.rotation ?? 0);
    return [baseX + rx * scaleX, baseY + ry * scaleY] as Point;
  });
  if (points.length < 3 || points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) {
    throw new Error(`${layer.name}: Objekt ${object.id} erzeugt ein ungültiges Polygon.`);
  }
  return points;
}

function boundsFor(points: Point[]): ScreenBounds {
  return {
    left: Math.min(...points.map((point) => point[0])),
    top: Math.min(...points.map((point) => point[1])),
    right: Math.max(...points.map((point) => point[0])),
    bottom: Math.max(...points.map((point) => point[1])),
  };
}

function objectLabel(object: TiledObject): string {
  return object.name?.trim() || object.class?.trim() || object.type?.trim() || `Objekt ${object.id}`;
}

function requiredPolygon(object: TiledObject, layer: ImportedTiledLayer, role: TiledSemanticRole, scaleX = 1, scaleY = 1): Point[] {
  const radius = asNumber(getProp(object, 'radiusEditorPx', 'triggerRadiusEditorPx'), 0);
  const polygon = objectPolygon(object, layer, radius || undefined, scaleX, scaleY);
  if (!polygon) throw new Error(`${layer.name}: ${role}-Objekt ${object.id} benötigt ein Polygon, eine Ellipse oder ein Rechteck mit positiver Größe.`);
  return polygon;
}

/**
 * Converts named Tiled object layers into the engine's stage-pixel polygon contract.
 * Suggested layer names: walkable_tier_0, collision_tier_0, connectors_tier_0,
 * interactions_tier_0 and occluders_tier_0. An object's navigationRole/role property
 * overrides the layer name. Tiled object coordinates are retained in rendered map pixels.
 */
export function deriveTiledSceneData(
  layers: ImportedTiledLayer[],
  options: TiledNavigationOptions,
): TiledDerivedSceneData {
  const floorZ = options.floorZ ?? 0;
  const scaleX = options.coordinateScaleX ?? 1;
  const scaleY = options.coordinateScaleY ?? 1;
  if (![scaleX, scaleY].every((scale) => Number.isFinite(scale) && scale > 0)) {
    throw new Error(`${options.mapId}: coordinateScaleX/Y müssen positive endliche Zahlen sein.`);
  }
  const walkable: NavPolygon[] = [];
  const collisions: NavPolygon[] = [];
  const connectors: ConnectorZone[] = [];
  const interactions: InteractionZone[] = [];
  const depthObjects: TiledDepthObject[] = [];
  const diagnostics: string[] = [];
  let ignoredObjects = 0;

  for (const layer of layers) {
    if (layer.type !== 'objectgroup' || !layer.visible) continue;
    const layerRole = getLayerRole(layer);
    for (const object of layer.objects ?? []) {
      if (object.visible === false) continue;
      const role = getObjectRole(object, layerRole);
      const label = objectLabel(object);
      const stableId = `tiled-${options.mapId}-obj-${object.id}`;
      const tier = tierFor(layer, object, floorZ);
      const isTileSprite = typeof object.gid === 'number' && object.gid > 0;
      const layerRenderRole = asString(propertyValue(layer, 'renderRole'));
      const renderRole = asString(getProp(object, 'renderRole'), layerRenderRole || (role === 'occluder'
        ? 'occluder' : /foreground|roof|canopy|upper-front/i.test(layer.name) ? 'foreground' : 'depth-sorted'));

      // A tile-object may simultaneously define navigation/collision and a visual sprite.
      // Always emit its depth descriptor before handling its semantic navigation role.
      if (role === 'occluder' || isTileSprite || getProp(object, 'depthBefore', 'depthAfter', 'occludes') !== undefined) {
        let shape: Point[] | null = null;
        const [baseX, baseY] = objectBase(object, layer, scaleX, scaleY);
        if (isTileSprite && (object.width ?? 0) > 0 && (object.height ?? 0) > 0) {
          const width = object.width! * scaleX;
          const height = object.height! * scaleY;
          shape = [[baseX, baseY - height], [baseX + width, baseY - height], [baseX + width, baseY], [baseX, baseY]];
        } else {
          shape = objectPolygon(object, layer, undefined, scaleX, scaleY) ?? [[baseX, baseY], [baseX + 1, baseY], [baseX + 1, baseY + 1], [baseX, baseY + 1]];
        }
        const bounds = boundsFor(shape);
        const cutawayEnabled = asBoolean(getProp(object, 'cutawayEnabled', 'cutaway'), false);
        const cutaway: CutawayProfile | undefined = cutawayEnabled ? {
          fadeStartPx: asNumber(getProp(object, 'cutawayFadeStartPx', 'fadeStartPx'), 32),
          fadeEndPx: asNumber(getProp(object, 'cutawayFadeEndPx', 'fadeEndPx'), 160),
          minAlpha: asNumber(getProp(object, 'cutawayMinAlpha', 'minAlpha'), 0.22),
        } : undefined;
        depthObjects.push({
          id: stableId, objectId: object.id, layerId: layer.id, name: label, tier,
          footSy: asNumber(getProp(object, 'footSy', 'depthY'), bounds.bottom),
          bounds,
          before: listOfIds(getProp(object, 'depthBefore', 'before'), options.mapId),
          after: listOfIds(getProp(object, 'depthAfter', 'after'), options.mapId),
          renderRole,
          sourceLayer: layer.name,
          ...(cutaway ? { cutaway } : {}),
        });
      }

      if (role === 'walkable') {
        const points = requiredPolygon(object, layer, role, scaleX, scaleY);
        walkable.push({
          polygon_id: asString(getProp(object, 'polygonId', 'polygon_id'), stableId),
          name: label,
          points_px: points,
          allowed: asBoolean(getProp(object, 'allowed'), true),
          floor_z: asNumber(getProp(object, 'floorZ', 'floor_z'), tier),
          speed_modifier: asNumber(getProp(object, 'speedModifier', 'speed_modifier'), 1),
        });
        continue;
      }
      if (role === 'collision') {
        const points = requiredPolygon(object, layer, role, scaleX, scaleY);
        collisions.push({
          obstacle_id: asString(getProp(object, 'obstacleId', 'obstacle_id'), stableId),
          name: label,
          points_px: points,
          floor_z: asNumber(getProp(object, 'floorZ', 'floor_z'), tier),
          height_m: asNumber(getProp(object, 'heightMeters', 'height_m'), 0),
          allowed: false,
        });
        continue;
      }
      if (role === 'connector') {
        const points = requiredPolygon(object, layer, role, scaleX, scaleY);
        connectors.push({
          zone_id: asString(getProp(object, 'zoneId', 'zone_id'), `${options.mapId}-zone-${object.id}`),
          connector_id: asString(getProp(object, 'connectorId', 'connector_id'), `${options.mapId}-connector-${object.id}`),
          type: asString(getProp(object, 'connectorType', 'connector_type'), object.type || object.class || 'portal'),
          target_map: asString(getProp(object, 'targetMap', 'target_map', 'targetSceneId')) || undefined,
          target_level: asString(getProp(object, 'targetLevel', 'target_level')) || undefined,
          trigger_polygon_px: points,
          label: asString(getProp(object, 'label'), label),
          z_from: asNumber(getProp(object, 'zFrom', 'z_from'), tier),
          z_to: asNumber(getProp(object, 'zTo', 'z_to'), tier),
        });
        continue;
      }
      if (role === 'interaction') {
        const [baseX, baseY] = objectBase(object, layer, scaleX, scaleY);
        const position: Point = (object.width ?? 0) > 0 && (object.height ?? 0) > 0
          ? [baseX + object.width! / 2, baseY + (typeof object.gid === 'number' && object.gid > 0 ? -object.height! / 2 : object.height! / 2)]
          : [baseX, baseY];
        interactions.push({
          interaction_id: asString(getProp(object, 'interactionId', 'interaction_id'), `${options.mapId}-interaction-${object.id}`),
          name: label,
          object_id: String(object.id),
          position_px: position,
          radius_px: Math.max(1, asNumber(getProp(object, 'radiusPx', 'radius_px'), 56)),
          type: asString(getProp(object, 'interactionType', 'interaction_type'), object.type || object.class || 'interaction'),
          title: asString(getProp(object, 'title'), label),
          description: asString(getProp(object, 'description'), ''),
        });
        continue;
      }

      if (role === 'occluder' || isTileSprite || getProp(object, 'depthBefore', 'depthAfter', 'occludes') !== undefined) {
        continue;
      }
      ignoredObjects++;
    }
  }

  if (walkable.length === 0) diagnostics.push('Keine begehbaren Polygone in Tiled-Objekt-Layern gefunden.');
  for (const connector of connectors) {
    if (!connector.target_map) diagnostics.push(`${connector.connector_id}: Portal hat kein targetMap; es bleibt als Trigger sichtbar, kann aber keinen Szenenwechsel ausführen.`);
  }

  return {
    navmesh: {
      map_id: options.mapId,
      level_id: options.levelId,
      floor_z: floorZ,
      agent_radius_px: options.agentRadiusPx ?? 18,
      agent_radius_m: options.agentRadiusMeters ?? 0.35,
      walkable_polygons: walkable,
      collision_polygons: collisions,
      connector_zones: connectors,
      interaction_zones: interactions,
    },
    depthObjects,
    stats: {
      walkablePolygons: walkable.length,
      collisionPolygons: collisions.length,
      connectors: connectors.length,
      interactions: interactions.length,
      depthObjects: depthObjects.length,
      ignoredObjects,
    },
    diagnostics,
  };
}
