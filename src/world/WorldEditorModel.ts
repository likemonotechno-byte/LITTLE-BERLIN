import type { AssetInstance, GeometryFeature, GeometryKind, ModuleDocument, Point2 } from './WorldModel.ts';
import { BERLIN_ROAD_PROFILES, distance2D, pointInPolygon, type RoadProfileId } from '../geometry/RoadNetwork.ts';

export type WorldEditorTool = 'select' | 'road' | 'area' | 'building' | 'asset';
export type RectangleFeatureKind = Extract<GeometryKind, 'parcel' | 'building-footprint' | 'plaza' | 'park' | 'walkable-area' | 'collision-area'>;

export interface SnapTarget {
  point: Point2;
  kind: 'connector' | 'road-endpoint';
  label: string;
}

export interface VertexHandle {
  featureId: string;
  pointIndex: number;
  ringIndex?: number;
  point: Point2;
}

function assertPoint(point: Point2, label: string): void {
  if (![point.x, point.y].every(Number.isFinite)) throw new Error(`${label}: x/y müssen endliche Zahlen sein.`);
}

function assertId(id: string): void {
  if (!id.trim()) throw new Error('Geometrie benötigt eine nichtleere ID.');
}

/** Distance from point P to line segment AB. */
export function pointToSegmentDistance(p: Point2, a: Point2, b: Point2): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 < 1e-9) return distance2D(p, a);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * (b.x - a.x);
  const projY = a.y + t * (b.y - a.y);
  return distance2D(p, { x: projX, y: projY });
}

/** Creates a road centerline from module-local metric points according to Berlin road profiles. */
export function createRoadFeature(
  id: string,
  levelId: string,
  start: Point2,
  end: Point2,
  profileOrWidth: RoadProfileId | number = 'secondary',
): GeometryFeature {
  assertId(id);
  assertPoint(start, 'start');
  assertPoint(end, 'end');
  if (!levelId.trim()) throw new Error('Geometrie benötigt eine Ebene.');
  if (Math.hypot(end.x - start.x, end.y - start.y) < 1) throw new Error('Straße muss mindestens 1 m lang sein.');

  let profile = BERLIN_ROAD_PROFILES.secondary;
  let widthMeters: number;

  if (typeof profileOrWidth === 'number') {
    if (!Number.isFinite(profileOrWidth) || profileOrWidth <= 0) throw new Error('Straßenbreite muss positiv sein.');
    widthMeters = profileOrWidth;
    if (widthMeters >= 20) profile = BERLIN_ROAD_PROFILES.primary;
    else if (widthMeters >= 14) profile = BERLIN_ROAD_PROFILES.secondary;
    else if (widthMeters <= 8) profile = BERLIN_ROAD_PROFILES.pedestrian;
    else profile = BERLIN_ROAD_PROFILES.residential;
  } else {
    profile = BERLIN_ROAD_PROFILES[profileOrWidth] ?? BERLIN_ROAD_PROFILES.secondary;
    widthMeters = profile.totalWidthMeters;
  }

  return {
    id,
    kind: 'road-centerline',
    levelId,
    widthMeters,
    geometry: { type: 'LineString', pointsMeters: [{ ...start }, { ...end }] },
    tags: ['editor-created', 'street', profile.id],
    properties: {
      roadProfile: profile.id,
      roadClass: profile.id,
      surface: profile.surface,
      displayName: profile.displayName,
    },
  };
}

/** Creates a rectangular polygon in module-local meters from any two opposite corners. */
export function createRectangleFeature(
  id: string,
  kind: RectangleFeatureKind,
  levelId: string,
  first: Point2,
  second: Point2,
): GeometryFeature {
  assertId(id);
  assertPoint(first, 'first');
  assertPoint(second, 'second');
  if (!levelId.trim()) throw new Error('Geometrie benötigt eine Ebene.');
  if (first.x === second.x || first.y === second.y || Math.abs(first.x - second.x) < 1 || Math.abs(first.y - second.y) < 1) {
    throw new Error('Fläche muss mindestens 1 × 1 m groß sein.');
  }
  const minX = Math.min(first.x, second.x);
  const maxX = Math.max(first.x, second.x);
  const minY = Math.min(first.y, second.y);
  const maxY = Math.max(first.y, second.y);
  return {
    id,
    kind,
    levelId,
    geometry: {
      type: 'Polygon',
      ringsMeters: [[
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ]],
    },
    tags: ['editor-created'],
  };
}

export function nextEditorGeometryId(moduleId: string, existingIds: Iterable<string>): string {
  const ids = new Set(existingIds);
  let sequence = 1;
  let candidate = '';
  do {
    candidate = `${moduleId}-editor-${String(sequence).padStart(3, '0')}`;
    sequence += 1;
  } while (ids.has(candidate));
  return candidate;
}

/** Creates a placed asset instance in module-local coordinates. */
export function createAssetInstance(
  moduleId: string,
  assetId: string,
  levelId: string,
  positionMeters: Point2,
  existingEntities: Iterable<{ id: string }>,
): AssetInstance {
  const existingIds = new Set([...existingEntities].map((e) => e.id));
  let sequence = 1;
  let candidate = '';
  do {
    candidate = `${moduleId}-entity-${String(sequence).padStart(3, '0')}`;
    sequence += 1;
  } while (existingIds.has(candidate));

  return {
    id: candidate,
    assetId,
    levelId,
    positionMeters: { x: positionMeters.x, y: positionMeters.y, z: 0 },
    rotationDegrees: 0,
    scale: { x: 1, y: 1, z: 1 },
  };
}

/** Finds a snap target (existing road endpoint or connector) within snapRadiusMeters. */
export function findSnapTarget(
  point: Point2,
  module: ModuleDocument,
  snapRadiusMeters = 2.5,
): SnapTarget | null {
  let closest: SnapTarget | null = null;
  let closestDist = snapRadiusMeters;

  for (const connector of module.connectors) {
    const connPos: Point2 = { x: connector.positionMeters.x, y: connector.positionMeters.y };
    const d = distance2D(point, connPos);
    if (d < closestDist) {
      closestDist = d;
      closest = {
        point: { ...connPos },
        kind: 'connector',
        label: `Anschluss: ${connector.id}`,
      };
    }
  }

  for (const geom of module.geometries) {
    if (geom.geometry.type === 'LineString') {
      const pts = geom.geometry.pointsMeters;
      for (const p of [pts[0], pts[pts.length - 1]]) {
        const d = distance2D(point, p);
        if (d < closestDist) {
          closestDist = d;
          closest = {
            point: { ...p },
            kind: 'road-endpoint',
            label: `Straßenende: ${geom.id}`,
          };
        }
      }
    }
  }

  return closest;
}

/** Finds the top-most geometry feature hit by a click in module-local coordinates. */
export function findFeatureAtPoint(
  point: Point2,
  features: GeometryFeature[],
  hitToleranceMeters = 3.0,
): GeometryFeature | null {
  for (let i = features.length - 1; i >= 0; i--) {
    const f = features[i];
    if (f.geometry.type === 'Polygon') {
      const ring = f.geometry.ringsMeters[0];
      if (ring && pointInPolygon(point, ring)) {
        return f;
      }
    } else if (f.geometry.type === 'LineString') {
      const pts = f.geometry.pointsMeters;
      const roadTolerance = Math.max(hitToleranceMeters, (f.widthMeters ?? 8) * 0.5);
      for (let s = 0; s < pts.length - 1; s++) {
        if (pointToSegmentDistance(point, pts[s], pts[s + 1]) <= roadTolerance) {
          return f;
        }
      }
    }
  }
  return null;
}

/** Finds a placed asset entity near the click point. */
export function findAssetInstanceAtPoint(
  point: Point2,
  entities: AssetInstance[],
  hitToleranceMeters = 2.5,
): AssetInstance | null {
  for (let i = entities.length - 1; i >= 0; i--) {
    const entity = entities[i];
    if (distance2D(point, { x: entity.positionMeters.x, y: entity.positionMeters.y }) <= hitToleranceMeters) {
      return entity;
    }
  }
  return null;
}

/** Finds a vertex handle on the selected feature for dragging. */
export function findVertexHandleAtPoint(
  point: Point2,
  feature: GeometryFeature,
  hitRadiusMeters = 2.0,
): VertexHandle | null {
  if (feature.geometry.type === 'LineString') {
    const pts = feature.geometry.pointsMeters;
    for (let i = 0; i < pts.length; i++) {
      if (distance2D(point, pts[i]) <= hitRadiusMeters) {
        return { featureId: feature.id, pointIndex: i, point: pts[i] };
      }
    }
  } else if (feature.geometry.type === 'Polygon') {
    const ring = feature.geometry.ringsMeters[0] ?? [];
    for (let i = 0; i < ring.length; i++) {
      if (distance2D(point, ring[i]) <= hitRadiusMeters) {
        return { featureId: feature.id, pointIndex: i, ringIndex: 0, point: ring[i] };
      }
    }
  }
  return null;
}
