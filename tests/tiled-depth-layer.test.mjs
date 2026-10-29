import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actorPositionToTextureUv,
  buildRadialCutawayBinding,
  cutawayProfileFromTiledProperties,
  isActorDepthTileLayer,
  readTiledBoolean,
  resolveTilesetFrame,
} from '../src/tiled/TiledDepthLayer.ts';

const props = (...records) => records.map(([name, value, type = 'string']) => ({ name, value, type }));

const tilesets = [
  { firstgid: 1, name: 'base', tilewidth: 256, tileheight: 128, tilecount: 2, columns: 2, imagePath: 'assets/base.png' },
  { firstgid: 3, name: 'roof', tilewidth: 256, tileheight: 128, tilecount: 2, columns: 2, imagePath: 'assets/roof.png' },
];

test('depth-sorted tile-layer roles are recognized without affecting ground layers', () => {
  assert.equal(isActorDepthTileLayer('Ground', props(['renderRole', 'ground'])), false);
  assert.equal(isActorDepthTileLayer('foreground_roof', []), true);
  assert.equal(isActorDepthTileLayer('Decor', props(['depthSortTiles', true, 'bool'])), true);
  assert.equal(isActorDepthTileLayer('Objects', props(['renderRole', 'roof'])), true);
  assert.equal(isActorDepthTileLayer('PinnedOverlay', props(['renderRole', 'always-front'])), true);
  assert.equal(isActorDepthTileLayer('always-front', []), true);
});

test('Tiled boolean properties accept native booleans, numbers and string exports', () => {
  assert.equal(readTiledBoolean(props(['enabled', true, 'bool']), 'enabled'), true);
  assert.equal(readTiledBoolean(props(['enabled', 1, 'int']), 'enabled'), true);
  assert.equal(readTiledBoolean(props(['enabled', 'false']), 'enabled', true), false);
  assert.equal(readTiledBoolean([], 'enabled', true), true);
});

test('roof layer cutaway properties parse and invalid profiles are rejected', () => {
  const profile = cutawayProfileFromTiledProperties(props(
    ['cutawayEnabled', true, 'bool'],
    ['cutawayFadeStartPx', 20, 'float'],
    ['cutawayFadeEndPx', 112, 'float'],
    ['cutawayMinAlpha', 0.16, 'float'],
  ));
  assert.deepEqual(profile, { fadeStartPx: 20, fadeEndPx: 112, minAlpha: 0.16 });
  assert.equal(cutawayProfileFromTiledProperties(props(['cutawayEnabled', false, 'bool'])), undefined);
  assert.throws(() => cutawayProfileFromTiledProperties(props(
    ['cutawayEnabled', true, 'bool'], ['cutawayFadeStartPx', 120, 'float'], ['cutawayFadeEndPx', 100, 'float'],
  )), /Ungültiges Cutaway-Profil/);
});

test('global GIDs resolve to the correct atlas and zero-based frame', () => {
  assert.deepEqual(resolveTilesetFrame(1, tilesets), { tileset: tilesets[0], tilesetIndex: 0, frame: 0 });
  assert.equal(resolveTilesetFrame(2, tilesets)?.frame, 1);
  assert.equal(resolveTilesetFrame(3, tilesets)?.tilesetIndex, 1);
  assert.equal(resolveTilesetFrame(4, tilesets)?.frame, 1);
  assert.equal(resolveTilesetFrame(5, tilesets), null);
  assert.equal(resolveTilesetFrame(0, tilesets), null);
});

test('radial shader binding stays finite and preserves the configured profile', () => {
  assert.deepEqual(buildRadialCutawayBinding(true, 120.5, 220, { fadeStartPx: 20, fadeEndPx: 112, minAlpha: 0.16 }), {
    enabled: true, actorX: 120.5, actorY: 220, fadeStartPx: 20, fadeEndPx: 112, minAlpha: 0.16,
  });
  assert.throws(() => buildRadialCutawayBinding(true, Number.NaN, 20, { fadeStartPx: 20, fadeEndPx: 112, minAlpha: 0.16 }), /endlich/);
});


test('actor-to-texture UV conversion accounts for Phaser PostFX vertical orientation', () => {
  assert.deepEqual(actorPositionToTextureUv(10, 20, { left: 0, top: 0, width: 20, height: 40 }), { u: 0.5, v: 0.5 });
  assert.deepEqual(actorPositionToTextureUv(10, 0, { left: 0, top: 0, width: 20, height: 40 }), { u: 0.5, v: 1 });
  assert.deepEqual(actorPositionToTextureUv(10, 40, { left: 0, top: 0, width: 20, height: 40 }), { u: 0.5, v: 0 });
  assert.throws(() => actorPositionToTextureUv(0, 0, { left: 0, top: 0, width: 0, height: 40 }), /positive Sprite-Abmessungen/);
});
