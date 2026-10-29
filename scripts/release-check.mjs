import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const results = [];

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    child.once('error', (error) => resolve({ code: 127, error: error.message }));
    child.once('close', (code) => resolve({ code: code ?? 1 }));
  });
}

async function addStep(label, args) {
  console.log(`\n=== ${label} ===`);
  const result = await run(npmCommand, args);
  const status = result.code === 0 ? 'PASS' : 'FAIL';
  results.push({ label, status, code: result.code });
  if (result.error) console.error(result.error);
  return result.code === 0;
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
const nodeMinor = Number(process.versions.node.split('.')[1]);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 6)) {
  console.error(`BLOCKED: Node.js >=22.6.0 benötigt; gefunden ${process.versions.node}.`);
  process.exit(2);
}

for (const step of [
  ['Unit-Tests', ['run', 'test']],
  ['Projekt- und Importgraph-Validierung', ['run', 'validate']],
  ['Isolierter Navigation-Typecheck', ['run', 'typecheck:navigation']],
]) {
  if (!(await addStep(step[0], step[1]))) {
    console.error(`Release-Check abgebrochen: Quality Gate '${step[0]}' ist fehlgeschlagen.`);
    process.exit(1);
  }
}

const requiredPackages = ['phaser', 'vite', 'typescript'];
const missing = [];
for (const name of requiredPackages) {
  try { await access(path.join(root, 'node_modules', name, 'package.json'), constants.R_OK); }
  catch { missing.push(name); }
}
let packageLockPresent = true;
try { await access(path.join(root, 'package-lock.json'), constants.R_OK); } catch { packageLockPresent = false; }

if (!packageLockPresent) {
  console.warn('WARN: package-lock.json fehlt. Direkte Paketversionen sind fixiert; transitive Versionen sind noch nicht reproduzierbar gelockt.');
}
if (missing.length) {
  console.warn(`\nBLOCKED: Vollständiger Build und Browser-QA übersprungen; lokale npm-Abhängigkeiten fehlen: ${missing.join(', ')}.`);
  console.warn('Ein positives Offline-QA-Ergebnis wird ausdrücklich nicht als Produktionsbuild gewertet. Installiere die festgelegten Abhängigkeiten mit `npm ci`, sobald die Registry erreichbar ist, und führe `npm run release-check` erneut aus.');
  results.push({ label: 'Phaser/Vite-Produktionsbuild', status: 'BLOCKED', code: 2 });
  results.push({ label: 'Chromium Browser-Smoke', status: 'BLOCKED', code: 2 });
} else {
  if (!(await addStep('Vollständiger Produktionsbuild', ['run', 'build']))) process.exit(1);
  if (!(await addStep('Chromium Browser-Smoke', ['run', 'qa:browser']))) process.exit(1);
}

console.log('\n=== Release-Check Zusammenfassung ===');
for (const item of results) console.log(`${item.status.padEnd(7)} ${item.label}`);
if (results.some((item) => item.status === 'BLOCKED')) process.exit(2);
console.log('Release-Check vollständig bestanden.');
