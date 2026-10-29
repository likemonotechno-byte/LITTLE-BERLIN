import test from 'node:test';
import assert from 'node:assert/strict';
import { approachCutawayAlpha, targetCutawayAlpha } from '../src/rendering/CutawayController.ts';

const profile = { fadeStartPx: 24, fadeEndPx: 160, minAlpha: 0.2 };
const occluder = { bounds: { left: 100, top: 10, right: 140, bottom: 220 }, footSy: 220 };

test('cutaway fades an occluder only while the actor is behind its footline', () => {
  assert.equal(targetCutawayAlpha(profile, occluder, { x: 120, footSy: 240 }), 1);
  assert.ok(targetCutawayAlpha(profile, occluder, { x: 120, footSy: 190 }) < 1);
});

test('cutaway reaches the configured minimum close to an overlapping occluder', () => {
  assert.equal(targetCutawayAlpha(profile, occluder, { x: 120, footSy: 200 }), profile.minAlpha);
});

test('cutaway stays opaque when the actor is far from the occluder bounds', () => {
  assert.equal(targetCutawayAlpha(profile, occluder, { x: 500, footSy: 200 }), 1);
});

test('cutaway easing is smooth, bounded, and frame-rate aware', () => {
  const afterSmallStep = approachCutawayAlpha(1, 0.2, 1 / 60);
  const afterLargeStep = approachCutawayAlpha(1, 0.2, 1 / 15);
  assert.ok(afterSmallStep < 1 && afterSmallStep > 0.2);
  assert.ok(afterLargeStep < afterSmallStep);
  assert.equal(approachCutawayAlpha(0.2, 1, 0), 0.2);
  assert.ok(approachCutawayAlpha(-2, 5, 0.1) <= 1);
});

test('invalid cutaway profiles and positions are rejected', () => {
  assert.throws(() => targetCutawayAlpha({ ...profile, fadeEndPx: 10 }, occluder, { x: 120, footSy: 200 }), /fadeStartPx < fadeEndPx/);
  assert.throws(() => targetCutawayAlpha({ ...profile, minAlpha: 1.2 }, occluder, { x: 120, footSy: 200 }), /zwischen 0 und 1/);
  assert.throws(() => targetCutawayAlpha(profile, occluder, { x: Number.NaN, footSy: 200 }), /endliche Zahlen/);
});
