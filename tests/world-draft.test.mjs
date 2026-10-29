import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorldProject } from '../src/world/WorldProjectLoader.ts';
import { applyWorldDraftBundle, createWorldDraftBundle } from '../src/world/WorldDraft.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function loadFixtureProject() {
  return loadWorldProject('data/worlds/klein-berlin/project.json', async (relativePath) => {
    const content = await readFile(path.join(root, 'public', relativePath), 'utf8');
    return JSON.parse(content);
  });
}

test('draft export creates a versioned bundle of the current world modules', async () => {
  const loaded = await loadFixtureProject();
  const bundle = createWorldDraftBundle(loaded);
  assert.equal(bundle.format, 'klein-berlin-world-draft');
  assert.equal(bundle.formatVersion, 1);
  assert.equal(bundle.projectId, loaded.project.projectId);
  assert.equal(bundle.modules.length, 2);
  assert.notEqual(bundle.modules[0], loaded.modules.get(bundle.modules[0].id));
});

test('draft apply restores edited module data into the same project', async () => {
  const loaded = await loadFixtureProject();
  const bundle = createWorldDraftBundle(loaded);
  const module = bundle.modules.find((item) => item.id === 'kb-innenstadt-west');
  module.geometries.push({
    id: 'saved-road', kind: 'road-centerline', levelId: 'ground', widthMeters: 8,
    geometry: { type: 'LineString', pointsMeters: [{ x: 10, y: 10 }, { x: 30, y: 10 }] },
    tags: ['editor-created'],
  });
  const otherLoaded = await loadFixtureProject();
  const result = applyWorldDraftBundle(otherLoaded, bundle);
  assert.equal(result.appliedModules, 2);
  assert.ok(otherLoaded.modules.get('kb-innenstadt-west').geometries.some((feature) => feature.id === 'saved-road'));
});

test('draft apply rejects different projects, unknown modules and unsupported format versions', async () => {
  const loaded = await loadFixtureProject();
  const base = createWorldDraftBundle(loaded);
  assert.throws(() => applyWorldDraftBundle(loaded, { ...base, projectId: 'some-other-project' }), /anderen Projekt/);
  assert.throws(() => applyWorldDraftBundle(loaded, { ...base, formatVersion: 9 }), /nicht unterstützte Version/);
  assert.throws(() => applyWorldDraftBundle(loaded, { ...base, modules: [{ ...base.modules[0], id: 'missing-module' }] }), /unbekanntes Modul/);
});

test('draft apply does not mutate the loaded module object supplied by another project', async () => {
  const loaded = await loadFixtureProject();
  const bundle = createWorldDraftBundle(loaded);
  bundle.modules[0].name = 'Draft-only name';
  const restored = await loadFixtureProject();
  applyWorldDraftBundle(restored, bundle);
  assert.equal(restored.modules.get(bundle.modules[0].id).name, 'Draft-only name');
  assert.notEqual(loaded.modules.get(bundle.modules[0].id).name, 'Draft-only name');
});

test('apply-draft CLI script successfully updates module files and rejects invalid format', async () => {
  const { execSync } = await import('node:child_process');
  const { writeFile, unlink } = await import('node:fs/promises');
  const tempPath = path.join(root, 'temp-draft-test.json');
  const loaded = await loadFixtureProject();
  const bundle = createWorldDraftBundle(loaded);

  await writeFile(tempPath, JSON.stringify(bundle, null, 2), 'utf8');
  try {
    const output = execSync(`node ${path.join(root, 'scripts/apply-draft.mjs')} ${tempPath}`, { encoding: 'utf8' });
    assert.ok(output.includes('erfolgreich in das Projektverzeichnis zurückgeschrieben'));
  } finally {
    await unlink(tempPath).catch(() => {});
  }

  // Verify rejection on invalid format
  assert.throws(() => {
    execSync(`node ${path.join(root, 'scripts/apply-draft.mjs')} nonexistent.json`, { stdio: 'pipe' });
  });
});
