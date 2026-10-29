import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoadFeature, createRectangleFeature, nextEditorGeometryId } from '../src/world/WorldEditorModel.ts';
import { assertModuleDocument } from '../src/world/WorldModel.ts';

const isPoint = (point) => Number.isFinite(point.x) && Number.isFinite(point.y);

test('road editor creates a valid metric centerline with width', () => {
  const feature = createRoadFeature('road-01', 'ground', { x: 2, y: 3 }, { x: 20, y: 30 }, 8);
  assert.equal(feature.kind, 'road-centerline');
  assert.equal(feature.widthMeters, 8);
  assert.equal(feature.geometry.type, 'LineString');
  assert.deepEqual(feature.geometry.pointsMeters, [{ x: 2, y: 3 }, { x: 20, y: 30 }]);
});

test('road editor rejects too-short or invalid geometry', () => {
  assert.throws(() => createRoadFeature('r', 'ground', { x: 2, y: 2 }, { x: 2.2, y: 2.1 }), /mindestens 1 m/);
  assert.throws(() => createRoadFeature('r', 'ground', { x: Number.NaN, y: 1 }, { x: 2, y: 2 }), /endliche Zahlen/);
  assert.throws(() => createRoadFeature('r', 'ground', { x: 1, y: 1 }, { x: 2, y: 2 }, -1), /positiv/);
});

test('rectangle editor normalizes opposite corners and keeps a closed polygon ring', () => {
  const feature = createRectangleFeature('park-01', 'park', 'ground', { x: 18, y: 20 }, { x: 4, y: 5 });
  assert.equal(feature.kind, 'park');
  assert.equal(feature.geometry.type, 'Polygon');
  const ring = feature.geometry.ringsMeters[0];
  assert.deepEqual(ring, [{ x: 4, y: 5 }, { x: 18, y: 5 }, { x: 18, y: 20 }, { x: 4, y: 20 }]);
  assert.ok(ring.every(isPoint));
});

test('rectangle editor rejects zero-area and sub-meter areas', () => {
  assert.throws(() => createRectangleFeature('bad', 'plaza', 'ground', { x: 1, y: 1 }, { x: 1, y: 8 }), /mindestens 1 × 1 m/);
  assert.throws(() => createRectangleFeature('bad', 'plaza', 'ground', { x: 1, y: 1 }, { x: 1.5, y: 2 }), /mindestens 1 × 1 m/);
});

test('editor geometry IDs do not collide', () => {
  assert.equal(nextEditorGeometryId('m', ['m-editor-001', 'm-editor-002']), 'm-editor-003');
});

test('asset instance placement and hit testing', async () => {
  const { createAssetInstance, findAssetInstanceAtPoint } = await import('../src/world/WorldEditorModel.ts');
  const instance = createAssetInstance('mod-1', 'bench-wood', 'ground', { x: 25, y: 35 }, []);
  assert.equal(instance.id, 'mod-1-entity-001');
  assert.equal(instance.assetId, 'bench-wood');
  assert.equal(instance.positionMeters.x, 25);
  assert.equal(instance.positionMeters.y, 35);

  const hit = findAssetInstanceAtPoint({ x: 25.5, y: 35.2 }, [instance], 2.0);
  assert.ok(hit);
  assert.equal(hit.id, 'mod-1-entity-001');

  const miss = findAssetInstanceAtPoint({ x: 40, y: 40 }, [instance], 2.0);
  assert.equal(miss, null);
});

test('vertex handle detection finds endpoints and polygon corners', async () => {
  const { findVertexHandleAtPoint } = await import('../src/world/WorldEditorModel.ts');
  const road = {
    id: 'road-test',
    kind: 'road-centerline',
    levelId: 'ground',
    geometry: { type: 'LineString', pointsMeters: [{ x: 10, y: 10 }, { x: 50, y: 10 }] },
  };

  const startHandle = findVertexHandleAtPoint({ x: 10.5, y: 10.2 }, road, 1.5);
  assert.ok(startHandle);
  assert.equal(startHandle.pointIndex, 0);

  const endHandle = findVertexHandleAtPoint({ x: 49.8, y: 10.1 }, road, 1.5);
  assert.ok(endHandle);
  assert.equal(endHandle.pointIndex, 1);

  const noHandle = findVertexHandleAtPoint({ x: 30, y: 20 }, road, 1.5);
  assert.equal(noHandle, null);
});

test('rectangle output satisfies the shared geometry contract', () => {
  const geometry = createRectangleFeature('building-01', 'building-footprint', 'ground', { x: 10, y: 10 }, { x: 22, y: 25 });
  const module = {
    schemaVersion: 1,
    id: 'module-01',
    name: 'Fixture',
    coordinateSpace: 'module-local-meters',
    boundsMeters: { width: 100, depth: 100, height: 24 },
    levels: [{ id: 'ground', label: 'Ground', zMeters: 0 }],
    layers: [], referenceImages: [], tilemaps: [], geometries: [geometry], entities: [], connectors: [],
  };
  assert.doesNotThrow(() => assertModuleDocument(module));
});
