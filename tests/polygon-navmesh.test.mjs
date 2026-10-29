import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PolygonNavMesh } from '../src/navigation/PolygonNavMesh.ts';
import { importTiledJson } from '../src/tiled/TiledJsonImporter.ts';
import { deriveTiledSceneData } from '../src/tiled/TiledNavigationExtractor.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), 'utf8'));

function rectangle(name, points) { return { name, points_px: points }; }
function syntheticNavmesh() {
  return new PolygonNavMesh({
    map_id: 'TEST', level_id: 'L0', floor_z: 0, agent_radius_px: 8, agent_radius_m: 0.4,
    walkable_polygons: [rectangle('floor', [[0, 0], [200, 0], [200, 100], [0, 100]])],
    collision_polygons: [rectangle('thin-wall', [[90, 34], [110, 34], [110, 66], [90, 66]])],
    connector_zones: [], interaction_zones: [],
  });
}

test('player clearance keeps the footprint away from walkable edges and collision geometry', () => {
  const nav = syntheticNavmesh();
  assert.equal(nav.isWalkable(20, 20), true);
  assert.equal(nav.isWalkable(4, 50), false, 'outside the clearance from the outer floor edge');
  assert.equal(nav.isWalkable(83, 50), false, 'inside obstacle clearance radius');
  assert.equal(nav.isWalkable(80, 50), true, 'clearance at least the configured radius');
  assert.equal(nav.isWalkable(100, 50), false, 'inside collision polygon');
});

test('swept movement cannot tunnel through a thin wall', () => {
  const nav = syntheticNavmesh();
  const start = [50, 50];
  const result = nav.resolveStep(50, 50, 150, 50);
  assert.equal(result.hit, true);
  assert.ok(result.x < 90, `expected stop on the near side of wall, got x=${result.x}`);
  assert.ok(nav.isWalkable(result.x, result.y));
  assert.equal(nav.hasLineOfSight(start[0], start[1], result.x, result.y), true);
});

test('grid A* routes around an obstacle and every returned segment preserves clearance', () => {
  const nav = syntheticNavmesh();
  const started = performance.now();
  const path = nav.findPath(50, 50, 150, 50);
  const elapsed = performance.now() - started;
  assert.ok(path.length >= 2, `expected a detour path, got ${JSON.stringify(path)}`);
  assert.equal(nav.isPathSafe([50, 50], path), true, `unsafe path: ${JSON.stringify(path)}`);
  assert.ok(path.some(([, y]) => y < 34) || path.some(([, y]) => y > 66), 'path should route around either end of the wall');
  assert.ok(elapsed < 2500, `first grid build and route took ${elapsed.toFixed(0)}ms`);
});

test('CON-01 can navigate to every interaction target without crossing registered obstacles', async () => {
  const manifest = await readJson('public/data/scenes/CON-01.manifest.json');
  const map = await readJson(`public/${manifest.tiledMapJson}`);
  const imported = await importTiledJson(manifest.tiledMapJson, map, async (assetPath) => {
    throw new Error(`Unexpected external TSJ: ${assetPath}`);
  }, manifest);
  const derived = deriveTiledSceneData(imported.layers, {
    mapId: manifest.id, levelId: manifest.display.levelLabel,
    floorZ: manifest.navigation.floorZ, agentRadiusPx: manifest.navigation.agentRadiusPx,
    agentRadiusMeters: manifest.navigation.agentRadiusMeters,
    coordinateScaleX: manifest.renderSpace.imageScaleX, coordinateScaleY: manifest.renderSpace.imageScaleY,
  });
  const nav = new PolygonNavMesh(derived.navmesh);
  const spawn = [manifest.spawn.xPx, manifest.spawn.yPx];
  assert.equal(nav.isWalkable(...spawn), true, 'player spawn must have clearance');
  for (const zone of nav.interactions) {
    const path = nav.findPath(...spawn, ...zone.position_px);
    assert.ok(path.length > 0, `${zone.name}: no route found`);
    assert.equal(nav.isPathSafe(spawn, path), true, `${zone.name}: returned route crosses an obstacle or boundary`);
  }
});

test('all legacy scene spawn points have agent clearance and every interaction route is safe', async () => {
  const index = await readJson('public/data/scene-index.json');
  for (const entry of index.scenes) {
    const manifest = await readJson(`public/${entry.manifest}`);
    let navData;
    if (manifest.navigationSource === 'tiled-object-layers') {
      const map = await readJson(`public/${manifest.tiledMapJson}`);
      const imported = await importTiledJson(manifest.tiledMapJson, map, async (assetPath) => {
        throw new Error(`Unexpected external TSJ: ${assetPath}`);
      }, manifest);
      navData = deriveTiledSceneData(imported.layers, {
        mapId: manifest.id, levelId: manifest.display.levelLabel,
        floorZ: manifest.navigation?.floorZ,
        agentRadiusPx: manifest.navigation?.agentRadiusPx,
        agentRadiusMeters: manifest.navigation?.agentRadiusMeters,
        coordinateScaleX: manifest.renderSpace.imageScaleX ?? 1,
        coordinateScaleY: manifest.renderSpace.imageScaleY ?? 1,
      }).navmesh;
    } else {
      navData = await readJson(`public/${manifest.navmeshData}`);
    }
    const nav = new PolygonNavMesh(navData);
    const spawn = [manifest.spawn.xPx, manifest.spawn.yPx];
    assert.equal(nav.isWalkable(...spawn), true, `${entry.id}: spawn violates agent clearance`);
    for (const zone of nav.interactions) {
      const path = nav.findPath(...spawn, ...zone.position_px);
      assert.ok(path.length > 0, `${entry.id}/${zone.name}: no path found`);
      assert.equal(nav.isPathSafe(spawn, path), true, `${entry.id}/${zone.name}: unsafe path`);
    }
  }
});
