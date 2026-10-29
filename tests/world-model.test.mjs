import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorldProject } from '../src/world/WorldProjectLoader.ts';
import {
  assertAssetCatalog,
  assertModuleDocument,
  assertProjectManifest,
  assertProjectPath,
  assertWorldDocument,
  moduleLocalToWorld,
  validateWorldProject,
  worldToModuleLocal,
} from '../src/world/WorldModel.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'public');
async function loadFixture() {
  return loadWorldProject('data/worlds/klein-berlin/project.json', async (relativePath) => {
    return JSON.parse(await readFile(path.join(publicRoot, relativePath), 'utf8'));
  });
}

test('world project loader loads, validates and normalizes the sample project', async () => {
  const { project, world, modules, assetCatalog } = await loadFixture();
  assert.doesNotThrow(() => assertProjectManifest(project));
  assert.doesNotThrow(() => assertWorldDocument(world));
  assert.doesNotThrow(() => assertAssetCatalog(assetCatalog));
  for (const module of modules.values()) assert.doesNotThrow(() => assertModuleDocument(module));
  assert.equal(modules.size, 2);
  assert.equal(world.districts[0].modules.length, 2);
});

test('world validation accepts the two-module city and its reciprocal road connection', async () => {
  const { project, world, modules, assetCatalog } = await loadFixture();
  assert.deepEqual(validateWorldProject(project, world, modules, assetCatalog), []);
});

test('world project loader rejects malformed referenced module documents', async () => {
  await assert.rejects(
    loadWorldProject('data/worlds/klein-berlin/project.json', async (relativePath) => {
      const value = JSON.parse(await readFile(path.join(publicRoot, relativePath), 'utf8'));
      if (relativePath.endsWith('innenstadt-ost.json')) value.id = 'wrong-module-id';
      return value;
    }),
    /verweist auf Moduldokument/,
  );
});

test('module-local to world coordinates round-trip for each supported right-angle rotation', () => {
  const local = { x: 12.5, y: 37.25, z: -4 };
  const origin = { x: 200, y: -80, z: 12 };
  for (const rotation of [0, 90, 180, 270]) {
    const world = moduleLocalToWorld(local, origin, rotation);
    const back = worldToModuleLocal(world, origin, rotation);
    assert.ok(Math.abs(back.x - local.x) < 1e-9);
    assert.ok(Math.abs(back.y - local.y) < 1e-9);
    assert.ok(Math.abs(back.z - local.z) < 1e-9);
  }
});

test('world coordinates apply module origin, rotation and elevation independently', () => {
  assert.deepEqual(moduleLocalToWorld({ x: 10, y: 20, z: 3 }, { x: 100, y: 200, z: -2 }, 90), { x: 80, y: 210, z: 1 });
});

test('project paths reject absolute paths and traversal segments', () => {
  assert.throws(() => assertProjectPath('../secret.png', 'test'), /Traversal/);
  assert.throws(() => assertProjectPath('/root/image.png', 'test'), /absolute/);
  assert.throws(() => assertProjectPath('C:\\temp\\image.png', 'test'), /absolute/);
  assert.doesNotThrow(() => assertProjectPath('assets/buildings/house.png', 'test'));
});

test('module contracts reject unsupported rotation and malformed geometry', async () => {
  const { world, modules } = await loadFixture();
  const invalidWorld = structuredClone(world);
  invalidWorld.districts[0].modules[0].rotationDegrees = 45;
  assert.throws(() => assertWorldDocument(invalidWorld), /rotationDegrees/);

  const module = structuredClone(modules.get('kb-innenstadt-west'));
  module.geometries[0].geometry.pointsMeters = [{ x: 1, y: 2 }];
  assert.throws(() => assertModuleDocument(module), /mindestens zwei Punkte/);
});

test('world validation reports connector mismatch instead of accepting a visual-only join', async () => {
  const fixture = await loadFixture();
  const east = fixture.modules.get('kb-innenstadt-ost');
  east.connectors[0].positionMeters.x = 1;
  const issues = validateWorldProject(fixture.project, fixture.world, fixture.modules, fixture.assetCatalog);
  assert.ok(issues.some((issue) => issue.code === 'WORLD_CONNECTOR_POSITION_MISMATCH'));
});

test('world validation reports missing assets and non-reciprocal connector targets', async () => {
  const fixture = await loadFixture();
  const west = fixture.modules.get('kb-innenstadt-west');
  const east = fixture.modules.get('kb-innenstadt-ost');
  west.entities.push({ id: 'entity-test', assetId: 'DOES-NOT-EXIST', positionMeters: { x: 10, y: 10, z: 0 }, rotationDegrees: 0, scale: { x: 1, y: 1, z: 1 }, levelId: 'ground' });
  east.connectors[0].target = null;
  const issues = validateWorldProject(fixture.project, fixture.world, fixture.modules, fixture.assetCatalog);
  assert.ok(issues.some((issue) => issue.code === 'WORLD_ASSET_MISSING'));
  assert.ok(issues.some((issue) => issue.code === 'WORLD_CONNECTOR_NOT_RECIPROCAL'));
});

test('world validation detects mismatched module bounds and orphan modules', async () => {
  const fixture = await loadFixture();
  const ref = fixture.world.districts[0].modules[0];
  ref.boundsMeters.width = 80;
  fixture.modules.set('orphan-module', structuredClone(fixture.modules.get('kb-innenstadt-west')));
  fixture.modules.get('orphan-module').id = 'orphan-module';
  const issues = validateWorldProject(fixture.project, fixture.world, fixture.modules, fixture.assetCatalog);
  assert.ok(issues.some((issue) => issue.code === 'WORLD_BOUNDS_MISMATCH'));
  assert.ok(issues.some((issue) => issue.code === 'WORLD_ORPHAN_MODULE'));
});

// A JSON round-trip is the persistence contract for the first editor iteration.
test('world data stays JSON-serializable without runtime-only objects', async () => {
  const fixture = await loadFixture();
  const copy = JSON.parse(JSON.stringify(fixture.world));
  assert.deepEqual(copy, fixture.world);
});
