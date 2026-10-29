import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BERLIN_ROAD_PROFILES,
  resolveRoadProfile,
  segmentNormal,
  extrudePolylineRibbon,
  segmentsIntersect,
  pointInPolygon,
  deriveRoadNetwork,
} from '../src/geometry/RoadNetwork.ts';

test('BERLIN_ROAD_PROFILES defines four valid street profiles with consistent cross-sections', () => {
  for (const [key, profile] of Object.entries(BERLIN_ROAD_PROFILES)) {
    assert.equal(profile.id, key);
    assert.ok(profile.totalWidthMeters > 0, `${key} totalWidth must be positive`);
    assert.equal(
      profile.totalWidthMeters,
      profile.carriagewayWidthMeters + profile.sidewalkLeftWidthMeters + profile.sidewalkRightWidthMeters,
      `${key} total width must equal sum of carriageway and sidewalks`,
    );
  }
  assert.equal(BERLIN_ROAD_PROFILES.primary.totalWidthMeters, 24);
  assert.equal(BERLIN_ROAD_PROFILES.secondary.totalWidthMeters, 16);
  assert.equal(BERLIN_ROAD_PROFILES.residential.totalWidthMeters, 10);
  assert.equal(BERLIN_ROAD_PROFILES.pedestrian.totalWidthMeters, 8);
  assert.equal(BERLIN_ROAD_PROFILES.pedestrian.carriagewayWidthMeters, 0);
  assert.equal(BERLIN_ROAD_PROFILES.pedestrian.walkableCarriageway, true);
});

test('resolveRoadProfile maps properties, width thresholds and defaults accurately', () => {
  const fromProp = resolveRoadProfile({
    id: 'f1', kind: 'road-centerline', levelId: 'L0',
    geometry: { type: 'LineString', pointsMeters: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
    properties: { roadProfile: 'primary' },
  });
  assert.equal(fromProp.id, 'primary');

  const fromWidth = resolveRoadProfile({
    id: 'f2', kind: 'road-centerline', levelId: 'L0', widthMeters: 16,
    geometry: { type: 'LineString', pointsMeters: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
  });
  assert.equal(fromWidth.id, 'secondary');

  const defaultProf = resolveRoadProfile({
    id: 'f3', kind: 'road-centerline', levelId: 'L0',
    geometry: { type: 'LineString', pointsMeters: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
  });
  assert.equal(defaultProf.id, 'residential');
});

test('segmentNormal computes unit right-hand normal vectors', () => {
  // Horizontal segment (0,0) -> (10,0) points East (+x). Right-hand normal should point South (+y).
  const nEast = segmentNormal({ x: 0, y: 0 }, { x: 10, y: 0 });
  assert.ok(Math.abs(nEast.x) < 1e-6);
  assert.ok(Math.abs(nEast.y - 1) < 1e-6);
  assert.ok(Math.abs(Math.hypot(nEast.x, nEast.y) - 1) < 1e-6);

  // Vertical segment (0,0) -> (0,10) points South (+y). Right-hand normal should point West (-x).
  const nSouth = segmentNormal({ x: 0, y: 0 }, { x: 0, y: 10 });
  assert.ok(Math.abs(nSouth.x - (-1)) < 1e-6);
  assert.ok(Math.abs(nSouth.y) < 1e-6);
});

test('extrudePolylineRibbon generates closed polygon ribbons with accurate widths', () => {
  const centerline = [{ x: 10, y: 20 }, { x: 50, y: 20 }];
  const ribbon = extrudePolylineRibbon(centerline, -5, 5); // total width 10m
  assert.equal(ribbon.length, 4);

  // Centerline is at y=20, normal points +y.
  // Left edge offset -5 should be at y=15. Right edge offset +5 should be at y=25.
  assert.deepEqual(ribbon[0], { x: 10, y: 15 });
  assert.deepEqual(ribbon[1], { x: 50, y: 15 });
  assert.deepEqual(ribbon[2], { x: 50, y: 25 });
  assert.deepEqual(ribbon[3], { x: 10, y: 25 });
});

test('segmentsIntersect finds intersection of crossing lines and rejects parallel lines', () => {
  const crossing = segmentsIntersect(
    { x: 0, y: 10 }, { x: 20, y: 10 },
    { x: 10, y: 0 }, { x: 10, y: 20 },
  );
  assert.ok(crossing);
  assert.ok(Math.abs(crossing.x - 10) < 1e-6);
  assert.ok(Math.abs(crossing.y - 10) < 1e-6);

  const parallel = segmentsIntersect(
    { x: 0, y: 10 }, { x: 20, y: 10 },
    { x: 0, y: 15 }, { x: 20, y: 15 },
  );
  assert.equal(parallel, null);
});

test('pointInPolygon checks point containment accurately', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  assert.equal(pointInPolygon({ x: 5, y: 5 }, square), true);
  assert.equal(pointInPolygon({ x: -1, y: 5 }, square), false);
  assert.equal(pointInPolygon({ x: 12, y: 5 }, square), false);
});

test('deriveRoadNetwork clusters crossing streets into intersections and categorizes walkable and collision surfaces', () => {
  const features = [
    {
      id: 'road-ns',
      kind: 'road-centerline',
      levelId: 'ground',
      geometry: { type: 'LineString', pointsMeters: [{ x: 50, y: 0 }, { x: 50, y: 100 }] },
      properties: { roadProfile: 'primary' },
    },
    {
      id: 'road-ew',
      kind: 'road-centerline',
      levelId: 'ground',
      geometry: { type: 'LineString', pointsMeters: [{ x: 0, y: 50 }, { x: 100, y: 50 }] },
      properties: { roadProfile: 'secondary' },
    },
  ];

  const network = deriveRoadNetwork(features, 3.0);
  assert.equal(network.segments.length, 2);
  assert.ok(network.intersections.length >= 1, 'crossing roads must form an intersection hub');

  const hubNode = network.nodes.find((n) => n.isIntersection);
  assert.ok(hubNode, 'intersection node must be identified');
  assert.ok(Math.abs(hubNode.positionMeters.x - 50) < 1.0);
  assert.ok(Math.abs(hubNode.positionMeters.y - 50) < 1.0);

  // Primary road has 16m carriageway and 2x4m sidewalks
  const primarySeg = network.segments.find((s) => s.featureId === 'road-ns');
  assert.ok(primarySeg);
  assert.equal(primarySeg.totalWidthMeters, 24);
  assert.ok(primarySeg.carriagewayPolygon);
  assert.ok(primarySeg.sidewalkLeftPolygon);
  assert.ok(primarySeg.sidewalkRightPolygon);

  // Verify that sidewalks are in walkablePolygons and carriageways are in collisionPolygons
  assert.ok(network.walkablePolygons.length >= 4, 'should include left and right sidewalks of both roads plus intersection hub');
  assert.ok(network.collisionPolygons.length >= 2, 'should include carriageways of both non-pedestrian roads');
});

test('pedestrian street categorizes carriageway as walkable with no separate sidewalk collision', () => {
  const features = [
    {
      id: 'ped-zone',
      kind: 'road-centerline',
      levelId: 'ground',
      geometry: { type: 'LineString', pointsMeters: [{ x: 10, y: 10 }, { x: 40, y: 10 }] },
      properties: { roadProfile: 'pedestrian' },
    },
  ];

  const network = deriveRoadNetwork(features);
  assert.equal(network.segments.length, 1);
  assert.equal(network.collisionPolygons.length, 0, 'pedestrian street must not have collision carriageway');
  assert.ok(network.walkablePolygons.length > 0, 'pedestrian street must have walkable polygons');
});
