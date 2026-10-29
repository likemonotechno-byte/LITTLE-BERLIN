import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiTierDepthSorter } from '../src/rendering/MultiTierDepthSorter.ts';

const item = (id, footSy, bounds, before = []) => ({ id, tier: 0, footSy, bounds, before, payload: id });

test('depth sorter places an overlapping rear footline before the front object', () => {
  const sorter = new MultiTierDepthSorter();
  const result = sorter.sort([
    item('front', 200, { left: 10, top: 10, right: 80, bottom: 220 }),
    item('rear', 100, { left: 20, top: 5, right: 90, bottom: 160 }),
  ]);
  assert.deepEqual(result.items.map((entry) => entry.id), ['rear', 'front']);
  assert.equal(result.hadCycle, false);
});

test('depth sorter handles explicit cycles deterministically instead of hanging', () => {
  const sorter = new MultiTierDepthSorter();
  const bounds = { left: 0, top: 0, right: 10, bottom: 10 };
  const result = sorter.sort([
    item('a', 10, bounds, ['b']),
    item('b', 20, bounds, ['a']),
  ]);
  assert.equal(result.hadCycle, true);
  assert.deepEqual(result.cyclicIds, ['a', 'b']);
  assert.equal(result.items.length, 2);
});

test('declared before/after constraints override the automatic footline heuristic', () => {
  const sorter = new MultiTierDepthSorter();
  const bounds = { left: 0, top: 0, right: 100, bottom: 100 };
  const result = sorter.sort([
    { ...item('front-by-contract', 40, bounds), after: ['rear-by-contract'] },
    item('rear-by-contract', 90, bounds),
  ]);
  assert.equal(result.hadCycle, false);
  assert.deepEqual(result.items.map((entry) => entry.id), ['rear-by-contract', 'front-by-contract']);
});

test('depth sorter rejects duplicate or non-finite object metadata', () => {
  const sorter = new MultiTierDepthSorter();
  const bounds = { left: 0, top: 0, right: 10, bottom: 10 };
  assert.throws(() => sorter.sort([item('dup', 1, bounds), item('dup', 2, bounds)]), /Doppelte Depth-Sort-ID/);
  assert.throws(() => sorter.sort([item('bad', Number.NaN, bounds)]), /müssen endlich sein/);
});


test('cycle diagnostics omit downstream objects blocked by a cycle', () => {
  const sorter = new MultiTierDepthSorter();
  const bounds = { left: 0, top: 0, right: 10, bottom: 10 };
  const result = sorter.sort([
    item('a', 10, bounds, ['b']),
    item('b', 20, bounds, ['a']),
    { ...item('downstream', 30, bounds), after: ['b'] },
  ]);
  assert.equal(result.hadCycle, true);
  assert.deepEqual(result.cyclicIds, ['a', 'b']);
});
