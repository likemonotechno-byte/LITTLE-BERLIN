import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSourceGraph } from '../scripts/validate-source-graph.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('all relative source, script, config and test imports resolve to project files', async () => {
  const result = await validateSourceGraph(root);
  assert.ok(result.sourceFiles >= 30, `expected a meaningful source graph, got ${result.sourceFiles} files`);
  assert.ok(result.importCount >= 50, `expected import declarations to be inspected, got ${result.importCount}`);
  assert.deepEqual(result.errors, []);
  assert.ok(result.externalImports.includes('phaser'));
  assert.ok(result.externalImports.includes('vite'));
});

test('browser smoke removes stale screenshot artifacts before starting a fresh run', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(path.join(root, 'scripts/browser-smoke.mjs'), 'utf8');
  const cleanup = source.indexOf('await Promise.all(screenshots.map((shot) => rm(shot.path, { force: true })))');
  const startServer = source.indexOf('const vite = spawn(');
  const screenshotCheck = source.indexOf('const screenshotExists = await access(shot.path');
  assert.ok(cleanup >= 0 && startServer > cleanup, 'stale screenshots must be removed before starting the new server run');
  assert.ok(screenshotCheck > startServer, 'screenshot existence must be checked only after the fresh browser run');
  assert.match(source, /const shotUrl = new URL\(shot\.urlPath, base\)\.toString\(\)/);
  assert.match(source, /'--dump-dom', shotUrl/);
  assert.doesNotMatch(source, /shot\.url\b/, 'browser must not receive the removed, undefined shot.url field');
});
