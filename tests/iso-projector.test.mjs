import test from 'node:test';
import assert from 'node:assert/strict';
import { IsoProjector } from '../src/world/IsoProjector.ts';

const projection = {
  type: 'dimetric-2-to-1',
  tileWidthPx: 256,
  tileHeightPx: 128,
  referenceCellMeters: 10,
  elevationPxPerMeter: 9.6,
};

const moduleRef = (rotationDegrees = 0) => ({
  id: 'test-module',
  document: 'data/modules/test.json',
  originMeters: { x: 100, y: 200, z: 4 },
  rotationDegrees,
  boundsMeters: { width: 100, depth: 80, height: 24 },
});

test('isometric projector maps one reference cell to the configured diamond basis', () => {
  const projector = new IsoProjector(projection);
  assert.deepEqual(projector.worldToScreen({ x: 10, y: 0, z: 0 }), { x: 128, y: 64 });
  assert.deepEqual(projector.worldToScreen({ x: 0, y: 10, z: 0 }), { x: -128, y: 64 });
  assert.deepEqual(projector.worldToScreen({ x: 10, y: 10, z: 0 }), { x: 0, y: 128 });
});

test('worldToScreen and screenToWorld round-trip coordinates at positive and negative elevations', () => {
  const projector = new IsoProjector(projection);
  for (const point of [
    { x: 0, y: 0, z: 0 },
    { x: 43.5, y: 81.25, z: 6 },
    { x: -20, y: 14, z: -4 },
  ]) {
    const screen = projector.worldToScreen(point);
    const world = projector.screenToWorld(screen.x, screen.y, point.z);
    assert.ok(Math.abs(world.x - point.x) < 1e-9);
    assert.ok(Math.abs(world.y - point.y) < 1e-9);
    assert.equal(world.z, point.z);
  }
});

test('module-local projection respects origin, module rotation and elevation', () => {
  const projector = new IsoProjector(projection);
  const projected = projector.moduleLocalToWorld({ x: 10, y: 20, z: 3 }, moduleRef(90));
  assert.deepEqual(projected, { x: 80, y: 210, z: 7 });
});

test('projected bounds include module corners and return a stable center', () => {
  const projector = new IsoProjector(projection);
  const bounds = projector.boundsOf(projector.moduleScreenCorners(moduleRef(0)));
  assert.equal(bounds.width, 2304);
  assert.equal(bounds.height, 1152);
  assert.ok(Math.abs(bounds.centerX - (-1152)) < 1e-9);
  assert.ok(Math.abs(bounds.centerY - 2457.6) < 1e-9);
});

test('stroke width and heading transforms reject invalid input', () => {
  const projector = new IsoProjector(projection);
  assert.equal(projector.metersToScreenStrokeWidth(10), 128);
  assert.throws(() => projector.metersToScreenStrokeWidth(-1), /nicht negativ/);
  assert.throws(() => projector.worldHeadingToScreenRadians(Number.NaN), /endlich/);
  assert.throws(() => new IsoProjector({ ...projection, tileWidthPx: 0 }), /Projektionsparameter/);
});
