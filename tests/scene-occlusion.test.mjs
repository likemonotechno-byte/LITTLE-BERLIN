import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MultiTierDepthSorter } from '../src/rendering/MultiTierDepthSorter.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'public/data/scenes/CON-01.manifest.json'), 'utf8'));
const sorter = new MultiTierDepthSorter();
const scale = (manifest.display.scale || 1) * 1.45;

function makeSliceItems() {
  return manifest.foregroundSlices.map((slice) => ({
    id: slice.id,
    tier: manifest.tiers[0]?.id ?? 0,
    footSy: slice.footSy,
    bounds: {
      left: slice.xPx,
      top: slice.yPx,
      right: slice.xPx + slice.widthPx,
      bottom: slice.yPx + slice.heightPx,
    },
    payload: slice.id,
  }));
}

function playerItem(x, y) {
  const width = 64 * scale;
  const height = 96 * scale;
  return {
    id: 'dynamic-player',
    tier: manifest.tiers[0]?.id ?? 0,
    footSy: y,
    bounds: { left: x - width / 2, top: y - 88 * scale, right: x + width / 2, bottom: y - 88 * scale + height },
    payload: 'player',
  };
}

test('every CON-01 foreground slice occludes a rear player and lets a front player render over it', () => {
  for (const slice of manifest.foregroundSlices) {
    const x = slice.xPx + slice.widthPx / 2;
    const behindY = slice.footSy - 25;
    const frontY = slice.footSy + 25;
    const behindItems = sorter.sort([...makeSliceItems(), playerItem(x, behindY)]);
    const frontItems = sorter.sort([...makeSliceItems(), playerItem(x, frontY)]);
    assert.equal(behindItems.hadCycle, false, `${slice.id}: unexpected DAG cycle for behind case`);
    assert.equal(frontItems.hadCycle, false, `${slice.id}: unexpected DAG cycle for front case`);
    const playerBehindIndex = behindItems.items.findIndex((item) => item.id === 'dynamic-player');
    const sliceBehindIndex = behindItems.items.findIndex((item) => item.id === slice.id);
    const playerFrontIndex = frontItems.items.findIndex((item) => item.id === 'dynamic-player');
    const sliceFrontIndex = frontItems.items.findIndex((item) => item.id === slice.id);
    assert.ok(playerBehindIndex < sliceBehindIndex, `${slice.id}: player should render behind when footSy < ${slice.footSy}`);
    assert.ok(sliceFrontIndex < playerFrontIndex, `${slice.id}: player should render in front when footSy > ${slice.footSy}`);
  }
});
