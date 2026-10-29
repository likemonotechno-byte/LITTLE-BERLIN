import test from 'node:test';
import assert from 'node:assert/strict';
import { UniversalIsoMath } from '../src/core/UniversalIsoMath.ts';

const metrics = {
  macroCols: 22, macroRows: 8, macroTileMeters: 10, subGridDivisions: 20,
  projection: 'dimetric-2-to-1', tilePixelWidth: 256, tilePixelHeight: 128,
  elevationPxPerTier: 96, originX: 400, originY: 60,
};

test('UniversalIsoMath round-trips world meters to screen pixels across tiers', () => {
  const math = new UniversalIsoMath(metrics);
  const samples = [
    { x: 0, y: 0, tier: 0 },
    { x: 120, y: 60, tier: 1 },
    { x: 15.5, y: 72.25, tier: -1 },
    { x: 219.9, y: 79.9, tier: 2 },
  ];
  for (const sample of samples) {
    const screen = math.worldToScreen(sample.x, sample.y, sample.tier);
    const world = math.screenToWorld(screen.sx, screen.sy, sample.tier);
    assert.ok(Math.abs(world.xMeters - sample.x) < 1e-9);
    assert.ok(Math.abs(world.yMeters - sample.y) < 1e-9);
  }
});

test('UniversalIsoMath refuses legacy-stage calibration to prevent applying the wrong projection', () => {
  assert.throws(() => new UniversalIsoMath({ ...metrics, projection: 'legacy-stage-calibrated' }), /dimetric-2-to-1/);
});
