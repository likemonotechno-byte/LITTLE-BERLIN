import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSceneManifest } from '../src/core/SceneManifest.ts';

test('projected-world manifest does not require a legacy backdrop or stage-to-world mapping', () => {
  const manifest = {
    version: '2.0', id: 'ISO-DEMO-01', displayName: 'Isometric Demo',
    baseBackdropImage: null, tiledMapJson: 'data/maps/examples/isometric-diamond-demo.json',
    renderSpace: { mode: 'projected-world', widthPx: 896, heightPx: 448, coordinateSpace: 'world-meter' },
    worldBoundsMeters: { width: 40, height: 30 }, worldMapping: null,
    grid: { macroCols: 4, macroRows: 3, macroTileMeters: 10, subGridDivisions: 20,
      projection: 'dimetric-2-to-1', tilePixelWidth: 256, tilePixelHeight: 128,
      elevationPxPerTier: 96, originX: 448, originY: 0 },
    display: { levelLabel: 'DEMO', zMeters: 0, scale: 1 }, spawn: { xPx: 448, yPx: 192 },
    tiers: [{ id: 0, name: 'Ground', zMeters: 0, ambientColor: '#0b1120', audioFilterCutoffHz: 20000, walkablePolygonLayer: 'walkable_tier_0' }],
    navmeshData: 'data/navmeshes/CON-01.json', foregroundSlices: [],
  };
  assert.doesNotThrow(() => assertSceneManifest(manifest, 'ISO-DEMO-01'));
  assert.throws(() => assertSceneManifest({ ...manifest, tiledMapJson: null }, 'ISO-DEMO-01'), /tiledMapJson/);
});

test('Tiled object layers can be the authoritative navigation source without a JSON navmesh file', () => {
  const manifest = {
    version: '2.0', id: 'TILED-NAV', displayName: 'Tiled Navigation Demo',
    baseBackdropImage: null, tiledMapJson: 'data/maps/examples/isometric-diamond-demo.json',
    renderSpace: { mode: 'projected-world', widthPx: 896, heightPx: 448, coordinateSpace: 'world-meter' },
    worldBoundsMeters: { width: 40, height: 30 }, worldMapping: null,
    grid: { macroCols: 4, macroRows: 3, macroTileMeters: 10, subGridDivisions: 20,
      projection: 'dimetric-2-to-1', tilePixelWidth: 256, tilePixelHeight: 128,
      elevationPxPerTier: 96, originX: 512, originY: 0 },
    display: { levelLabel: 'L0', zMeters: 0, scale: 1 }, spawn: { xPx: 384, yPx: 256 },
    tiers: [{ id: 0, name: 'Ground', zMeters: 0, ambientColor: '#0b1120', audioFilterCutoffHz: 20000, walkablePolygonLayer: 'walkable_tier_0' }],
    navmeshData: null, navigationSource: 'tiled-object-layers', navigation: { floorZ: 0, agentRadiusPx: 18, agentRadiusMeters: 0.35 }, foregroundSlices: [],
  };
  assert.doesNotThrow(() => assertSceneManifest(manifest, 'TILED-NAV'));
  assert.throws(() => assertSceneManifest({ ...manifest, tiledMapJson: null }, 'TILED-NAV'), /tiled-object-layers benötigt/);
  assert.throws(() => assertSceneManifest({ ...manifest, navigationSource: 'navmesh-json' }, 'TILED-NAV'), /navmesh-json benötigt navmeshData/);
});

test('legacy stage manifest still requires its original image and world mapping', () => {
  const manifest = {
    version: '2.0', id: 'LEGACY', displayName: 'Legacy', baseBackdropImage: null, tiledMapJson: null,
    renderSpace: { mode: 'pre-rendered-stage', widthPx: 100, heightPx: 100, coordinateSpace: 'stage-pixel' },
    worldBoundsMeters: { width: 1, height: 1 }, worldMapping: null,
    grid: { macroCols: 1, macroRows: 1, macroTileMeters: 10, subGridDivisions: 20,
      projection: 'legacy-stage-calibrated', tilePixelWidth: 256, tilePixelHeight: 128,
      elevationPxPerTier: 96, originX: 0, originY: 0 },
    display: { levelLabel: 'L0', zMeters: 0, scale: 1 }, spawn: { xPx: 0, yPx: 0 },
    tiers: [{ id: 0, name: 'Ground', zMeters: 0, ambientColor: '#000000', audioFilterCutoffHz: 20000, walkablePolygonLayer: 'walkable_tier_0' }],
    navmeshData: 'data/navmeshes/CON-01.json', foregroundSlices: [],
  };
  assert.throws(() => assertSceneManifest(manifest), /baseBackdropImage/);
});
