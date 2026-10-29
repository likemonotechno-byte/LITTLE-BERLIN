import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importTiledJson, resolvePublicRelativePath, getTiledProperty } from '../src/tiled/TiledJsonImporter.ts';

const fixture = JSON.parse(await readFile(new URL('./fixtures/isometric-diamond-map.json', import.meta.url), 'utf8'));
const resolverThatFails = async (path) => { throw new Error(`Unexpected external file request: ${path}`); };

const projectedManifest = {
  grid: { projection: 'dimetric-2-to-1', tilePixelWidth: 256, tilePixelHeight: 128 },
  renderSpace: { mode: 'projected-world', coordinateSpace: 'world-meter' },
};

test('imports an Isometric Diamond map, flattened layers and atlas tileset paths', async () => {
  const result = await importTiledJson('data/maps/examples/demo.json', fixture, resolverThatFails, projectedManifest);
  assert.equal(result.data.orientation, 'isometric');
  assert.equal(result.stats.tileLayers, 2);
  assert.equal(result.stats.objectLayers, 1);
  assert.equal(result.stats.tileCount, 12);
  assert.equal(result.stats.objectCount, 1);
  assert.deepEqual(result.layers.map((layer) => layer.name), ['Ground', 'walkable_tier_0', 'foreground_roof']);
  assert.equal(result.tilesets[0].name, 'demo-ground');
  assert.equal(result.tilesets[0].imagePath, 'assets/tilesets/demo-ground.png');
  assert.equal(getTiledProperty(result.layers[2], 'renderRole'), 'foreground');
});

test('inlines an external TSJ and resolves its image relative to the TSJ location', async () => {
  const map = structuredClone(fixture);
  map.tilesets = [{ firstgid: 1, source: '../../tilesets/ground.tsj' }];
  const requests = [];
  const resolver = async (path) => {
    requests.push(path);
    return {
      name: 'external-ground', tilewidth: 256, tileheight: 128, tilecount: 2, columns: 2,
      image: '../../assets/tilesets/external-ground.png', imagewidth: 512, imageheight: 128,
    };
  };
  const result = await importTiledJson('data/maps/examples/demo.json', map, resolver, projectedManifest);
  assert.deepEqual(requests, ['data/tilesets/ground.tsj']);
  assert.equal(result.data.tilesets[0].source, undefined);
  assert.equal(result.tilesets[0].imagePath, 'assets/tilesets/external-ground.png');
  assert.equal(result.data.tilesets[0].image, 'assets/tilesets/external-ground.png');
});

test('rejects orientation or raster mismatch before the Phaser runtime sees the map', async () => {
  await assert.rejects(() => importTiledJson('bad.json', { ...fixture, orientation: 'orthogonal' }, resolverThatFails, projectedManifest), /Isometric \(Diamond\)/);
  await assert.rejects(() => importTiledJson('bad.json', { ...fixture, tileheight: 64 }, resolverThatFails, projectedManifest), /2:1-Dimetrie/);
  await assert.rejects(() => importTiledJson('bad.json', fixture, resolverThatFails, {
    ...projectedManifest, grid: { ...projectedManifest.grid, tilePixelWidth: 128 },
  }), /passt nicht zum Manifest-Grid/);
});

test('rejects malformed layer data and unsafe asset paths', async () => {
  const bad = structuredClone(fixture);
  bad.tilesets[0].image = 'demo-ground.png';
  bad.layers[0].data = [1, 2];
  await assert.rejects(() => importTiledJson('tests/fixtures/bad.json', bad, resolverThatFails), /erwartet 12/);
  assert.throws(() => resolvePublicRelativePath('data/maps/map.json', '../../../secret.png'), /verlässt den public-Assetbereich/);
});


test('rejects infinite chunk maps until runtime chunk streaming is implemented', async () => {
  const infinite = structuredClone(fixture);
  infinite.infinite = true;
  await assert.rejects(() => importTiledJson('data/maps/examples/infinite.json', infinite, resolverThatFails), /Infinite-Tiled-Maps/);
});

import { deriveTiledSceneData } from '../src/tiled/TiledNavigationExtractor.ts';

test('derives walkable polygons, obstacles, portals, interactions, and occlusion descriptors from object layers', async () => {
  const map = structuredClone(fixture);
  map.layers.push(
    {
      id: 4, name: 'collision_tier_0', type: 'objectgroup', visible: true, opacity: 1, offsetx: 0, offsety: 0,
      objects: [{ id: 20, name: 'Bench blocker', type: 'obstacle', x: 300, y: 100, width: 64, height: 32,
        properties: [{ name: 'heightMeters', type: 'float', value: 1.1 }] }],
    },
    {
      id: 5, name: 'connectors_tier_0', type: 'objectgroup', visible: true, opacity: 1, offsetx: 0, offsety: 0,
      objects: [{ id: 21, name: 'Lift to upper hall', type: 'elevator', x: 760, y: 180, width: 48, height: 32,
        properties: [
          { name: 'connectorId', type: 'string', value: 'VC-LIFT-01' },
          { name: 'targetMap', type: 'string', value: 'RAIL-02' },
          { name: 'connectorType', type: 'string', value: 'elevator' },
        ] }],
    },
    {
      id: 6, name: 'interactions_tier_0', type: 'objectgroup', visible: true, opacity: 1, offsetx: 4, offsety: 6,
      objects: [{ id: 22, name: 'Ticket machine', type: 'interaction', x: 880, y: 200, point: true,
        properties: [
          { name: 'interactionType', type: 'string', value: 'ticket' },
          { name: 'radiusPx', type: 'int', value: 42 },
          { name: 'description', type: 'string', value: 'Kauft ein Testticket.' },
        ] }],
    },
    {
      id: 7, name: 'props_tier_0', type: 'objectgroup', visible: true, opacity: 1, offsetx: 0, offsety: 0,
      objects: [
        { id: 50, name: 'Kiosk sprite', type: 'object', gid: 1, x: 400, y: 300, width: 256, height: 128,
          properties: [
            { name: 'depthAfter', type: 'string', value: '51' },
            { name: 'cutawayEnabled', type: 'bool', value: true },
            { name: 'cutawayFadeStartPx', type: 'int', value: 28 },
            { name: 'cutawayFadeEndPx', type: 'int', value: 145 },
            { name: 'cutawayMinAlpha', type: 'float', value: 0.35 },
          ] },
        { id: 51, name: 'Kiosk foot volume', type: 'occluder', x: 400, y: 200, width: 256, height: 100 },
      ],
    },
  );
  const imported = await importTiledJson('data/maps/examples/navigation-demo.json', map, resolverThatFails, projectedManifest);
  const derived = deriveTiledSceneData(imported.layers, { mapId: 'NAV-DEMO', levelId: 'L0' });
  assert.equal(derived.stats.walkablePolygons, 1);
  assert.equal(derived.stats.collisionPolygons, 1);
  assert.equal(derived.stats.connectors, 1);
  assert.equal(derived.stats.interactions, 1);
  assert.equal(derived.stats.depthObjects, 2);
  assert.deepEqual(derived.navmesh.walkable_polygons[0].points_px[0], [128, 64]);
  assert.deepEqual(derived.navmesh.collision_polygons[0].points_px[2], [364, 132]);
  assert.equal(derived.navmesh.connector_zones[0].connector_id, 'VC-LIFT-01');
  assert.equal(derived.navmesh.connector_zones[0].target_map, 'RAIL-02');
  assert.deepEqual(derived.navmesh.interaction_zones[0].position_px, [884, 206]);
  assert.equal(derived.navmesh.interaction_zones[0].radius_px, 42);
  assert.equal(derived.depthObjects.find((object) => object.objectId === 50).after[0], 'tiled-NAV-DEMO-obj-51');
  assert.deepEqual(derived.depthObjects.find((object) => object.objectId === 50).cutaway, { fadeStartPx: 28, fadeEndPx: 145, minAlpha: 0.35 });
  assert.equal(derived.diagnostics.length, 0);
});

test('requires usable polygon geometry for walkable and collision objects', async () => {
  const map = structuredClone(fixture);
  map.layers.push({ id: 4, name: 'walkable_tier_0', type: 'objectgroup', objects: [{ id: 40, x: 12, y: 14 }] });
  const imported = await importTiledJson('data/maps/examples/bad-nav.json', map, resolverThatFails, projectedManifest);
  assert.throws(() => deriveTiledSceneData(imported.layers, { mapId: 'BAD', levelId: 'L0' }), /walkable-Objekt 40 benötigt ein Polygon/);
});

test('tile-object collision geometry also retains a renderable depth descriptor', async () => {
  const map = structuredClone(fixture);
  map.layers.push({ id: 4, name: 'collision_tier_0', type: 'objectgroup', objects: [
    { id: 60, name: 'Display case', type: 'obstacle', gid: 2, x: 500, y: 220, width: 256, height: 128 },
  ] });
  const imported = await importTiledJson('data/maps/examples/tile-obstacle.json', map, resolverThatFails, projectedManifest);
  const derived = deriveTiledSceneData(imported.layers, { mapId: 'TILE-OBSTACLE', levelId: 'L0' });
  assert.equal(derived.stats.collisionPolygons, 1);
  assert.equal(derived.stats.depthObjects, 1);
  assert.deepEqual(derived.navmesh.collision_polygons[0].points_px[0], [500, 92]);
});
