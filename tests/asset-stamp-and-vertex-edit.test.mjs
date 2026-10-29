import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAssetInstance,
  findAssetInstanceAtPoint,
  findVertexHandleAtPoint,
} from '../src/world/WorldEditorModel.ts';
import { createWorldDraftBundle, applyWorldDraftBundle } from '../src/world/WorldDraft.ts';
import { assertModuleDocument } from '../src/world/WorldModel.ts';

test('createAssetInstance creates valid entities with sequential IDs and local coordinates', () => {
  const existing = [{ id: 'innenstadt-west-entity-001' }];
  const entity1 = createAssetInstance('innenstadt-west', 'bench-wood', 'ground', { x: 12.5, y: 18.0 }, existing);

  assert.equal(entity1.id, 'innenstadt-west-entity-002');
  assert.equal(entity1.assetId, 'bench-wood');
  assert.equal(entity1.levelId, 'ground');
  assert.equal(entity1.positionMeters.x, 12.5);
  assert.equal(entity1.positionMeters.y, 18.0);
  assert.equal(entity1.positionMeters.z, 0);
  assert.equal(entity1.rotationDegrees, 0);
  assert.deepEqual(entity1.scale, { x: 1, y: 1, z: 1 });
});

test('findAssetInstanceAtPoint detects nearest entity within tolerance and ignores distant entities', () => {
  const entities = [
    {
      id: 'e1',
      assetId: 'bench-wood',
      positionMeters: { x: 10, y: 20, z: 0 },
      rotationDegrees: 0,
      scale: { x: 1, y: 1, z: 1 },
      levelId: 'ground',
    },
    {
      id: 'e2',
      assetId: 'ticket-red',
      positionMeters: { x: 30, y: 40, z: 0 },
      rotationDegrees: 90,
      scale: { x: 1, y: 1, z: 1 },
      levelId: 'ground',
    },
  ];

  const hit1 = findAssetInstanceAtPoint({ x: 10.8, y: 20.6 }, entities, 2.0);
  assert.ok(hit1);
  assert.equal(hit1.id, 'e1');

  const hit2 = findAssetInstanceAtPoint({ x: 29.5, y: 40.2 }, entities, 2.0);
  assert.ok(hit2);
  assert.equal(hit2.id, 'e2');

  const miss = findAssetInstanceAtPoint({ x: 20, y: 30 }, entities, 2.0);
  assert.equal(miss, null);
});

test('asset entity rotation round-trips correctly through 90-degree steps', () => {
  const entity = {
    id: 'e-rot',
    assetId: 'info-rondell',
    positionMeters: { x: 15, y: 15, z: 0 },
    rotationDegrees: 0,
    scale: { x: 1, y: 1, z: 1 },
    levelId: 'ground',
  };

  const rotate = (e, delta) => {
    e.rotationDegrees = ((e.rotationDegrees + delta) % 360 + 360) % 360;
  };

  rotate(entity, 90);
  assert.equal(entity.rotationDegrees, 90);
  rotate(entity, 90);
  assert.equal(entity.rotationDegrees, 180);
  rotate(entity, 90);
  assert.equal(entity.rotationDegrees, 270);
  rotate(entity, 90);
  assert.equal(entity.rotationDegrees, 0);
});

test('findVertexHandleAtPoint identifies individual vertices of lines and polygons for dragging', () => {
  const line = {
    id: 'road-v',
    kind: 'road-centerline',
    levelId: 'ground',
    geometry: {
      type: 'LineString',
      pointsMeters: [
        { x: 5, y: 10 },
        { x: 25, y: 10 },
        { x: 45, y: 30 },
      ],
    },
  };

  const h0 = findVertexHandleAtPoint({ x: 5.2, y: 9.8 }, line, 2.0);
  assert.ok(h0);
  assert.equal(h0.pointIndex, 0);

  const h1 = findVertexHandleAtPoint({ x: 25.1, y: 10.3 }, line, 2.0);
  assert.ok(h1);
  assert.equal(h1.pointIndex, 1);

  const h2 = findVertexHandleAtPoint({ x: 44.9, y: 30.1 }, line, 2.0);
  assert.ok(h2);
  assert.equal(h2.pointIndex, 2);

  // Dragging vertex 1:
  line.geometry.pointsMeters[h1.pointIndex] = { x: 25, y: 15 };
  assert.deepEqual(line.geometry.pointsMeters[1], { x: 25, y: 15 });

  const poly = {
    id: 'poly-v',
    kind: 'park',
    levelId: 'ground',
    geometry: {
      type: 'Polygon',
      ringsMeters: [[
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
      ]],
    },
  };

  const hp2 = findVertexHandleAtPoint({ x: 19.8, y: 20.2 }, poly, 2.0);
  assert.ok(hp2);
  assert.equal(hp2.pointIndex, 2);
  assert.equal(hp2.ringIndex, 0);
});

test('placed asset entities and dragged vertices round-trip through draft bundle import/export', () => {
  const sampleModule = {
    schemaVersion: 1,
    id: 'test-mod',
    name: 'Test Module',
    coordinateSpace: 'module-local-meters',
    boundsMeters: { width: 100, depth: 100, height: 24 },
    levels: [{ id: 'ground', label: 'Ground', zMeters: 0 }],
    layers: [],
    referenceImages: [
      {
        id: 'ref-01',
        source: 'assets/stages/ext-00.jpg',
        positionMeters: { x: 0, y: 0 },
        widthMeters: 100,
        opacity: 0.5,
        visibleInEditor: true,
      },
    ],
    tilemaps: [],
    geometries: [
      {
        id: 'g-line',
        kind: 'road-centerline',
        levelId: 'ground',
        widthMeters: 16,
        geometry: { type: 'LineString', pointsMeters: [{ x: 10, y: 10 }, { x: 60, y: 10 }] },
      },
    ],
    entities: [
      {
        id: 'test-mod-entity-001',
        assetId: 'bench-wood',
        positionMeters: { x: 15, y: 25, z: 0 },
        rotationDegrees: 90,
        scale: { x: 1, y: 1, z: 1 },
        levelId: 'ground',
      },
    ],
    connectors: [],
  };

  assert.doesNotThrow(() => assertModuleDocument(sampleModule));

  const fakeLoaded = {
    project: { projectId: 'p1' },
    world: { worldId: 'w1' },
    modules: new Map([['test-mod', sampleModule]]),
  };

  const draft = createWorldDraftBundle(fakeLoaded);
  assert.equal(draft.modules[0].entities.length, 1);
  assert.equal(draft.modules[0].entities[0].assetId, 'bench-wood');
  assert.equal(draft.modules[0].entities[0].rotationDegrees, 90);

  // Apply to a fresh clone
  const targetModule = JSON.parse(JSON.stringify(sampleModule));
  targetModule.entities = []; // simulate empty before apply
  const targetLoaded = {
    project: { projectId: 'p1' },
    world: { worldId: 'w1' },
    modules: new Map([['test-mod', targetModule]]),
  };

  const res = applyWorldDraftBundle(targetLoaded, draft);
  assert.equal(res.appliedModules, 1);
  const updated = targetLoaded.modules.get('test-mod');
  assert.equal(updated.entities.length, 1);
  assert.equal(updated.entities[0].id, 'test-mod-entity-001');
  assert.equal(updated.entities[0].rotationDegrees, 90);
});
