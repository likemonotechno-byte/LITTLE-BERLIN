import test from 'node:test';
import assert from 'node:assert/strict';
import { ReferenceImageCalibrator } from '../src/importers/reference-image/ReferenceImageCalibration.ts';

test('ReferenceImageCalibrator calibrates scale, origin and round-trips coordinates accurately', () => {
  const source = {
    id: 'hobrecht-1920',
    source: 'assets/maps/hobrecht-sample.png',
    positionMeters: { x: 0, y: 0 },
    widthMeters: 100,
    opacity: 0.5,
    visibleInEditor: true,
  };

  // Two points in the image 500 px apart represent exactly 100 m on the ground
  const pA = { x: 100, y: 200 };
  const pB = { x: 600, y: 200 };
  const knownDistance = 100; // meters

  const calibrated = ReferenceImageCalibrator.calibrateFromTwoPoints(
    source,
    pA,
    pB,
    knownDistance,
    { x: 10, y: 20 },
    1000,
  );

  assert.equal(calibrated.calibrated, true);
  // 100 m / 500 px = 0.2 m/px
  assert.equal(calibrated.nominalScaleMetersPerPx, 0.2);
  assert.equal(calibrated.widthMeters, 200); // 1000 px * 0.2 m/px

  // Test forward conversion
  const localA = ReferenceImageCalibrator.imagePixelToLocalMeters(calibrated, pA);
  assert.ok(Math.abs(localA.x - 10) < 1e-6);
  assert.ok(Math.abs(localA.y - 20) < 1e-6);

  const localB = ReferenceImageCalibrator.imagePixelToLocalMeters(calibrated, pB);
  assert.ok(Math.abs(localB.x - 110) < 1e-6);
  assert.ok(Math.abs(localB.y - 20) < 1e-6);

  // Test reverse conversion
  const backToPx = ReferenceImageCalibrator.localMetersToImagePixel(calibrated, localB);
  assert.ok(Math.abs(backToPx.x - 600) < 1e-6);
  assert.ok(Math.abs(backToPx.y - 200) < 1e-6);
});

test('ReferenceImageCalibrator rejects invalid points and non-positive distances', () => {
  const source = {
    id: 'test',
    source: 'test.png',
    positionMeters: { x: 0, y: 0 },
    widthMeters: 10,
    opacity: 0.5,
    visibleInEditor: true,
  };

  assert.throws(
    () => ReferenceImageCalibrator.calibrateFromTwoPoints(source, { x: 10, y: 10 }, { x: 10, y: 10 }, 50),
    /identisch/,
  );
  assert.throws(
    () => ReferenceImageCalibrator.calibrateFromTwoPoints(source, { x: 0, y: 0 }, { x: 50, y: 0 }, -5),
    /positiv/,
  );
});
