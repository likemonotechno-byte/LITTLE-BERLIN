import type { GeometryFeature, Point2 } from '../world/WorldModel.ts';

export type RoadProfileId = 'primary' | 'secondary' | 'residential' | 'pedestrian';

export interface RoadProfile {
  id: RoadProfileId;
  displayName: string;
  totalWidthMeters: number;
  carriagewayWidthMeters: number;
  sidewalkLeftWidthMeters: number;
  sidewalkRightWidthMeters: number;
  curbHeightMeters: number;
  surface: 'asphalt' | 'cobblestone' | 'paved';
  walkableCarriageway: boolean;
}

export const BERLIN_ROAD_PROFILES: Record<RoadProfileId, RoadProfile> = {
  primary: {
    id: 'primary',
    displayName: 'Hauptstraße (24 m)',
    totalWidthMeters: 24,
    carriagewayWidthMeters: 16,
    sidewalkLeftWidthMeters: 4,
    sidewalkRightWidthMeters: 4,
    curbHeightMeters: 0.15,
    surface: 'asphalt',
    walkableCarriageway: false,
  },
  secondary: {
    id: 'secondary',
    displayName: 'Nebenstraße / Allee (16 m)',
    totalWidthMeters: 16,
    carriagewayWidthMeters: 10,
    sidewalkLeftWidthMeters: 3,
    sidewalkRightWidthMeters: 3,
    curbHeightMeters: 0.15,
    surface: 'asphalt',
    walkableCarriageway: false,
  },
  residential: {
    id: 'residential',
    displayName: 'Wohnstraße / Kiez (10 m)',
    totalWidthMeters: 10,
    carriagewayWidthMeters: 6,
    sidewalkLeftWidthMeters: 2,
    sidewalkRightWidthMeters: 2,
    curbHeightMeters: 0.12,
    surface: 'cobblestone',
    walkableCarriageway: false,
  },
  pedestrian: {
    id: 'pedestrian',
    displayName: 'Fußgängerzone / Promenade (8 m)',
    totalWidthMeters: 8,
    carriagewayWidthMeters: 0,
    sidewalkLeftWidthMeters: 4,
    sidewalkRightWidthMeters: 4,
    curbHeightMeters: 0,
    surface: 'paved',
    walkableCarriageway: true,
  },
};

export function resolveRoadProfile(feature: GeometryFeature): RoadProfile {
  const profileKey = String(feature.properties?.roadProfile ?? feature.properties?.roadClass ?? '').toLowerCase();
  if (profileKey in BERLIN_ROAD_PROFILES) {
    return BERLIN_ROAD_PROFILES[profileKey as RoadProfileId];
  }
  if (feature.widthMeters && feature.widthMeters >= 20) return BERLIN_ROAD_PROFILES.primary;
  if (feature.widthMeters && feature.widthMeters >= 14) return BERLIN_ROAD_PROFILES.secondary;
  if (feature.widthMeters && feature.widthMeters <= 8) return BERLIN_ROAD_PROFILES.pedestrian;
  return BERLIN_ROAD_PROFILES.residential;
}

export function distance2D(a: Point2, b: Point2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Computes unit right-hand normal vector for segment AB: N = (-(By - Ay), Bx - Ax) / length. */
export function segmentNormal(a: Point2, b: Point2): Point2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-9) return { x: 0, y: 1 };
  return { x: -dy / length, y: dx / length };
}

/**
 * Extrudes an open polyline into a closed polygon ribbon between leftOffset and rightOffset
 * (leftOffset < 0 = left of direction, rightOffset > 0 = right of direction).
 */
export function extrudePolylineRibbon(points: Point2[], leftOffset: number, rightOffset: number): Point2[] {
  if (points.length < 2) return [];
  const leftEdge: Point2[] = [];
  const rightEdge: Point2[] = [];

  for (let i = 0; i < points.length; i++) {
    let normal: Point2;
    if (i === 0) {
      normal = segmentNormal(points[0], points[1]);
    } else if (i === points.length - 1) {
      normal = segmentNormal(points[i - 1], points[i]);
    } else {
      const n1 = segmentNormal(points[i - 1], points[i]);
      const n2 = segmentNormal(points[i], points[i + 1]);
      const avgX = n1.x + n2.x;
      const avgY = n1.y + n2.y;
      const len = Math.hypot(avgX, avgY);
      normal = len > 1e-6 ? { x: avgX / len, y: avgY / len } : n1;
    }

    leftEdge.push({ x: points[i].x + normal.x * leftOffset, y: points[i].y + normal.y * leftOffset });
    rightEdge.push({ x: points[i].x + normal.x * rightOffset, y: points[i].y + normal.y * rightOffset });
  }

  // Closed ring: left edge forward, right edge backwards
  return [...leftEdge, ...rightEdge.reverse()];
}

/** Tests if two line segments AB and CD intersect properly (open segments). */
export function segmentsIntersect(a: Point2, b: Point2, c: Point2, d: Point2): Point2 | null {
  const rX = b.x - a.x;
  const rY = b.y - a.y;
  const sX = d.x - c.x;
  const sY = d.y - c.y;
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-9) return null;
  const qpX = c.x - a.x;
  const qpY = c.y - a.y;
  const t = (qpX * sY - qpY * sX) / denom;
  const u = (qpX * rY - qpY * rX) / denom;
  const eps = 1e-4;
  if (t >= eps && t <= 1 - eps && u >= eps && u <= 1 - eps) {
    return { x: a.x + t * rX, y: a.y + t * rY };
  }
  return null;
}

export function pointInPolygon(point: Point2, polygon: Point2[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y))
      && (point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function makeRegularPolygon(center: Point2, radiusMeters: number, sides = 8): Point2[] {
  return Array.from({ length: sides }, (_, i) => {
    const angle = (i / sides) * Math.PI * 2;
    return {
      x: center.x + Math.cos(angle) * radiusMeters,
      y: center.y + Math.sin(angle) * radiusMeters,
    };
  });
}

export interface DerivedRoadSegmentSurface {
  featureId: string;
  levelId: string;
  profile: RoadProfile;
  totalWidthMeters: number;
  carriagewayPolygon: Point2[] | null;
  sidewalkLeftPolygon: Point2[] | null;
  sidewalkRightPolygon: Point2[] | null;
  corridorPolygon: Point2[];
}

export interface RoadIntersectionNode {
  id: string;
  positionMeters: Point2;
  connectedFeatureIds: string[];
  isIntersection: boolean;
  hubPolygon?: Point2[];
}

export interface DerivedRoadNetwork {
  segments: DerivedRoadSegmentSurface[];
  intersections: Point2[][];
  nodes: RoadIntersectionNode[];
  walkablePolygons: Point2[][];
  collisionPolygons: Point2[][];
}

/**
 * Derives physical road carriageway, sidewalks, intersection hubs, and walkable/collision
 * polygons from module road features according to the Berlin road profile specifications.
 */
export function deriveRoadNetwork(features: GeometryFeature[], snapRadiusMeters = 2.5): DerivedRoadNetwork {
  const roadFeatures = features.filter((f) => f.kind === 'road-centerline' && f.geometry.type === 'LineString');
  const segments: DerivedRoadSegmentSurface[] = [];
  const rawNodes: Array<{ pos: Point2; featureId: string; halfWidth: number }> = [];

  for (const feature of roadFeatures) {
    if (feature.geometry.type !== 'LineString') continue;
    const points = feature.geometry.pointsMeters;
    if (points.length < 2) continue;

    const profile = resolveRoadProfile(feature);
    const halfCarriage = profile.carriagewayWidthMeters * 0.5;
    const totalLeft = -(halfCarriage + profile.sidewalkLeftWidthMeters);
    const totalRight = halfCarriage + profile.sidewalkRightWidthMeters;
    const totalWidthMeters = totalRight - totalLeft;

    const carriagewayPolygon = profile.carriagewayWidthMeters > 0
      ? extrudePolylineRibbon(points, -halfCarriage, halfCarriage)
      : null;
    const sidewalkLeftPolygon = profile.sidewalkLeftWidthMeters > 0
      ? extrudePolylineRibbon(points, totalLeft, -halfCarriage)
      : null;
    const sidewalkRightPolygon = profile.sidewalkRightWidthMeters > 0
      ? extrudePolylineRibbon(points, halfCarriage, totalRight)
      : null;
    const corridorPolygon = extrudePolylineRibbon(points, totalLeft, totalRight);

    segments.push({
      featureId: feature.id,
      levelId: feature.levelId,
      profile,
      totalWidthMeters,
      carriagewayPolygon,
      sidewalkLeftPolygon,
      sidewalkRightPolygon,
      corridorPolygon,
    });

    for (const pt of points) {
      rawNodes.push({ pos: pt, featureId: feature.id, halfWidth: totalWidthMeters * 0.5 });
    }
  }

  // Detect crossing centerlines between distinct road segments
  for (let i = 0; i < roadFeatures.length; i++) {
    const fA = roadFeatures[i];
    if (fA.geometry.type !== 'LineString') continue;
    const ptsA = fA.geometry.pointsMeters;
    const wA = (segments[i]?.totalWidthMeters ?? 10) * 0.5;

    for (let j = i + 1; j < roadFeatures.length; j++) {
      const fB = roadFeatures[j];
      if (fB.geometry.type !== 'LineString') continue;
      if (fA.levelId !== fB.levelId) continue;
      const ptsB = fB.geometry.pointsMeters;
      const wB = (segments[j]?.totalWidthMeters ?? 10) * 0.5;

      for (let sA = 0; sA < ptsA.length - 1; sA++) {
        for (let sB = 0; sB < ptsB.length - 1; sB++) {
          const hit = segmentsIntersect(ptsA[sA], ptsA[sA + 1], ptsB[sB], ptsB[sB + 1]);
          if (hit) {
            const width = Math.max(wA, wB);
            rawNodes.push({ pos: hit, featureId: fA.id, halfWidth: width });
            rawNodes.push({ pos: hit, featureId: fB.id, halfWidth: width });
          }
        }
      }
    }
  }

  // Cluster nearby nodes into topological intersection nodes
  const clusters: Array<{ sumX: number; sumY: number; count: number; featureIds: Set<string>; maxHalfWidth: number }> = [];
  for (const item of rawNodes) {
    let matched = clusters.find((c) => distance2D({ x: c.sumX / c.count, y: c.sumY / c.count }, item.pos) <= snapRadiusMeters);
    if (!matched) {
      matched = { sumX: 0, sumY: 0, count: 0, featureIds: new Set(), maxHalfWidth: 0 };
      clusters.push(matched);
    }
    matched.sumX += item.pos.x;
    matched.sumY += item.pos.y;
    matched.count += 1;
    matched.featureIds.add(item.featureId);
    matched.maxHalfWidth = Math.max(matched.maxHalfWidth, item.halfWidth);
  }

  const nodes: RoadIntersectionNode[] = [];
  const intersections: Point2[][] = [];
  const walkablePolygons: Point2[][] = [];
  const collisionPolygons: Point2[][] = [];

  for (let index = 0; index < clusters.length; index++) {
    const cluster = clusters[index];
    const center: Point2 = { x: cluster.sumX / cluster.count, y: cluster.sumY / cluster.count };
    const connectedFeatureIds = [...cluster.featureIds];
    const isIntersection = connectedFeatureIds.length >= 2 || cluster.count >= 3;
    const hubPolygon = isIntersection
      ? makeRegularPolygon(center, Math.max(2, cluster.maxHalfWidth * 1.05), 8)
      : undefined;

    if (hubPolygon) {
      intersections.push(hubPolygon);
      walkablePolygons.push(hubPolygon);
    }

    nodes.push({
      id: `intersection-node-${index + 1}`,
      positionMeters: center,
      connectedFeatureIds,
      isIntersection,
      hubPolygon,
    });
  }

  // Collect sidewalk and carriageway polygons
  for (const seg of segments) {
    if (seg.sidewalkLeftPolygon) walkablePolygons.push(seg.sidewalkLeftPolygon);
    if (seg.sidewalkRightPolygon) walkablePolygons.push(seg.sidewalkRightPolygon);
    if (seg.profile.walkableCarriageway) {
      if (seg.carriagewayPolygon) walkablePolygons.push(seg.carriagewayPolygon);
    } else {
      if (seg.carriagewayPolygon) collisionPolygons.push(seg.carriagewayPolygon);
    }
  }

  return { segments, intersections, nodes, walkablePolygons, collisionPolygons };
}
