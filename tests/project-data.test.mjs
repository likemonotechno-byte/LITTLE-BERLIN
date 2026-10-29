import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSceneManifest } from '../src/core/SceneManifest.ts';
import { importTiledJson } from '../src/tiled/TiledJsonImporter.ts';
import { deriveTiledSceneData } from '../src/tiled/TiledNavigationExtractor.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = async (relativePath) => JSON.parse(await readFile(path.join(root, 'public', relativePath), 'utf8'));

test('scene index declares all four V0.3 levels without duplicate IDs', async () => {
  const index = await load('data/scene-index.json');
  assert.equal(index.scenes.length, 4);
  assert.deepEqual(index.scenes.map((scene) => scene.id).sort(), ['CON-01', 'EXT-00', 'RAIL-02', 'UG-03']);
  assert.equal(new Set(index.scenes.map((scene) => scene.id)).size, 4);
});

test('every scene resolves authoritative navigation while keeping render-space separate from projection', async () => {
  const index = await load('data/scene-index.json');
  for (const entry of index.scenes) {
    const manifest = await load(entry.manifest);
    assert.equal(manifest.id, entry.id);
    assert.equal(manifest.renderSpace.mode, 'pre-rendered-stage');
    assert.equal(manifest.renderSpace.widthPx, 2048);
    assert.equal(manifest.renderSpace.heightPx, 1529);
    assert.equal(manifest.grid.projection, 'legacy-stage-calibrated');
    assert.ok(manifest.worldMapping.type);
    let navmesh;
    if (manifest.navigationSource === 'tiled-object-layers') {
      const map = await load(manifest.tiledMapJson);
      const imported = await importTiledJson(manifest.tiledMapJson, map, async (assetPath) => {
        throw new Error(`Unexpected external TSJ: ${assetPath}`);
      }, manifest);
      const derived = deriveTiledSceneData(imported.layers, {
        mapId: manifest.id, levelId: manifest.display.levelLabel,
        floorZ: manifest.navigation.floorZ, agentRadiusPx: manifest.navigation.agentRadiusPx,
        agentRadiusMeters: manifest.navigation.agentRadiusMeters,
        coordinateScaleX: manifest.renderSpace.imageScaleX ?? 1,
        coordinateScaleY: manifest.renderSpace.imageScaleY ?? 1,
      });
      navmesh = derived.navmesh;
    } else {
      navmesh = await load(manifest.navmeshData);
    }
    assert.equal(navmesh.map_id, entry.id);
    assert.ok(navmesh.walkable_polygons.length > 0);
  }
});

test('CON-01 Tiled overlay round-trips all authoritative stage navigation coordinates', async () => {
  const manifest = await load('data/scenes/CON-01.manifest.json');
  const map = await load(manifest.tiledMapJson);
  const imported = await importTiledJson(manifest.tiledMapJson, map, async (assetPath) => {
    throw new Error(`Unexpected external TSJ: ${assetPath}`);
  }, manifest);
  assert.equal(map.orientation, 'isometric');
  assert.equal(map.tilewidth, 64);
  assert.equal(map.tileheight, 32);
  assert.equal(map.layers[0].type, 'imagelayer');
  assert.ok(map.layers[0].image.endsWith('assets/stages/con-01.jpg'));
  const derived = deriveTiledSceneData(imported.layers, {
    mapId: manifest.id, levelId: manifest.display.levelLabel,
    floorZ: manifest.navigation.floorZ, agentRadiusPx: manifest.navigation.agentRadiusPx,
    agentRadiusMeters: manifest.navigation.agentRadiusMeters,
    coordinateScaleX: manifest.renderSpace.imageScaleX,
    coordinateScaleY: manifest.renderSpace.imageScaleY,
  }).navmesh;
  const fallback = await load('data/navmeshes/CON-01.json');
  const comparePoints = (current, original, key) => {
    assert.equal(current.length, original.length, `${key} count`);
    current.forEach((record, index) => {
      const a = record.points_px ?? record.trigger_polygon_px;
      const b = original[index].points_px ?? original[index].trigger_polygon_px;
      assert.equal(a.length, b.length, `${key}[${index}] points`);
      a.forEach(([x, y], pointIndex) => {
        assert.ok(Math.abs(x - b[pointIndex][0]) < 0.01, `${key}[${index}] x${pointIndex}: ${x} != ${b[pointIndex][0]}`);
        assert.ok(Math.abs(y - b[pointIndex][1]) < 0.01, `${key}[${index}] y${pointIndex}: ${y} != ${b[pointIndex][1]}`);
      });
    });
  };
  comparePoints(derived.walkable_polygons, fallback.walkable_polygons, 'walkable');
  comparePoints(derived.collision_polygons, fallback.collision_polygons, 'collision');
  comparePoints(derived.connector_zones, fallback.connector_zones, 'connectors');
  assert.equal(derived.interaction_zones.length, fallback.interaction_zones.length);
  derived.interaction_zones.forEach((interaction, index) => {
    assert.equal(interaction.interaction_id, fallback.interaction_zones[index].interaction_id);
    assert.ok(Math.abs(interaction.position_px[0] - fallback.interaction_zones[index].position_px[0]) < 0.01);
    assert.ok(Math.abs(interaction.position_px[1] - fallback.interaction_zones[index].position_px[1]) < 0.01);
    assert.equal(interaction.radius_px, fallback.interaction_zones[index].radius_px);
  });
  assert.equal(derived.walkable_polygons.length, 6);
  assert.equal(derived.collision_polygons.length, 7);
  assert.equal(derived.connector_zones.length, 7);
  assert.equal(derived.interaction_zones.length, 5);
});

test('registers retain connector, asset and trace records from V0.3', async () => {
  assert.equal((await load('data/legacy/connector-register.json')).length, 17);
  assert.equal((await load('data/legacy/asset-register.json')).length, 23);
  assert.equal(Object.keys(await load('data/legacy/trace-register.json')).length, 4);
});


test('public Tiled smoke map is a finite 2:1 Isometric Diamond atlas map', async () => {
  const map = JSON.parse(await readFile(path.join(root, 'public/data/maps/examples/isometric-diamond-demo.json'), 'utf8'));
  assert.equal(map.orientation, 'isometric');
  assert.equal(map.tilewidth, map.tileheight * 2);
  assert.equal(map.infinite, false);
  assert.ok(map.layers.some((layer) => layer.type === 'tilelayer'));
  assert.ok(map.layers.some((layer) => layer.type === 'objectgroup'));
  assert.equal(map.tilesets.length, 2);
  for (const tileset of map.tilesets) {
    const atlasPath = path.resolve(root, 'public/data/maps/examples', tileset.image);
    assert.ok(await readFile(atlasPath));
  }
  const roofLayer = map.layers.find((layer) => layer.name === 'foreground_roof');
  assert.ok(roofLayer);
  assert.equal(roofLayer.properties.find((property) => property.name === 'renderRole')?.value, 'roof');
  assert.equal(roofLayer.properties.find((property) => property.name === 'cutawayEnabled')?.value, true);
  assert.equal(roofLayer.data.filter((gid) => gid > 0).length, 4);
});

test('isolated Tiled navigation manifest derives its navmesh from the checked-in Tiled map', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'public/data/scenes/examples/TILED-NAV-DEMO.manifest.json'), 'utf8'));
  const map = JSON.parse(await readFile(path.join(root, 'public', manifest.tiledMapJson), 'utf8'));
  assert.equal(manifest.navigationSource, 'tiled-object-layers');
  assert.equal(manifest.navmeshData, null);
  assert.equal(manifest.id, 'TILED-NAV-DEMO');
  assert.equal(map.orientation, 'isometric');
  assert.ok(map.layers.some((layer) => layer.type === 'objectgroup' && /walkable/i.test(layer.name)));
  assert.doesNotThrow(() => assertSceneManifest(manifest, 'TILED-NAV-DEMO'));
  const imported = await importTiledJson(manifest.tiledMapJson, map, async (assetPath) => { throw new Error(`Unexpected external TSJ: ${assetPath}`); }, manifest);
  const derived = deriveTiledSceneData(imported.layers, {
    mapId: manifest.id, levelId: manifest.display.levelLabel,
    floorZ: manifest.navigation.floorZ, agentRadiusPx: manifest.navigation.agentRadiusPx,
    agentRadiusMeters: manifest.navigation.agentRadiusMeters,
  });
  assert.equal(derived.navmesh.map_id, manifest.id);
  assert.equal(derived.navmesh.walkable_polygons.length, 1);
  assert.ok(derived.navmesh.walkable_polygons[0].points_px.length >= 3);
});


test('isolated render QA index keeps the Tiled depth/cutaway demo out of production scenes', async () => {
  const index = await load('data/qa-scene-index.json');
  assert.deepEqual(index.scenes.map((scene) => scene.id), ['TILED-NAV-DEMO']);
  assert.equal(index.defaultScene, 'TILED-NAV-DEMO');
  const production = await load('data/scene-index.json');
  assert.deepEqual(production.scenes.map((scene) => scene.id).sort(), ['CON-01', 'EXT-00', 'RAIL-02', 'UG-03']);
});
