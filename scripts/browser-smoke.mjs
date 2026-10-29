import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { constants, accessSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requirePath = async (entry) => {
  try { await access(path.join(root, 'node_modules', entry, 'package.json'), constants.R_OK); return true; }
  catch { return false; }
};

const missing = (await Promise.all(['phaser', 'vite'].map(async (name) => (await requirePath(name)) ? null : name))).filter(Boolean);
if (missing.length) {
  console.error(`BROWSER-QA BLOCKIERT: fehlende npm-Abhängigkeiten: ${missing.join(', ')}.`);
  console.error('Bitte im Projektordner `npm install` ausführen und danach `npm run qa:browser` wiederholen.');
  process.exit(2);
}

const browserCandidates = [
  'chromium',
  'chromium-browser',
  'google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const browser = process.env.CHROMIUM_BIN || browserCandidates.find((name) => {
  if (name.startsWith('/')) {
    try { accessSync(name, constants.X_OK); return true; } catch { return false; }
  }
  return spawnSync('sh', ['-lc', `command -v ${name}`], { encoding: 'utf8' }).status === 0;
});
if (!browser) {
  console.error('BROWSER-QA BLOCKIERT: Chromium/Google Chrome nicht gefunden. Setze CHROMIUM_BIN auf den Browserpfad.');
  process.exit(2);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const { timeout = 50000, ...spawnOptions } = options;
    const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], ...spawnOptions });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr, timedOut });
    };
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); finish(-1); }, timeout);
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => { setTimeout(() => finish(code), 250); });
    child.once('close', (code) => finish(code));
  });
}

async function reservePort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const qaDir = path.join(root, 'docs/qa');
await mkdir(qaDir, { recursive: true });
const screenshots = [
  { name: 'desktop', size: '1365,900', urlPath: '/', expectedScene: 'CON-01', path: path.join(qaDir, 'browser-smoke-desktop.png') },
  { name: 'mobile', size: '390,844', urlPath: '/', expectedScene: 'CON-01', path: path.join(qaDir, 'browser-smoke-mobile.png') },
  { name: 'tiled-render-qa', size: '1365,900', urlPath: '/?qa=tiled-render', expectedScene: 'TILED-NAV-DEMO', path: path.join(qaDir, 'browser-smoke-tiled-render.png') },
  { name: 'world-view', size: '1365,900', urlPath: '/?view=world', expectedScene: 'World Model Preview', path: path.join(qaDir, 'browser-smoke-world-view.png') },
];
// Remove old artifacts before starting this run: file existence must prove that Chromium wrote a fresh screenshot.
await Promise.all(screenshots.map((shot) => rm(shot.path, { force: true })));

const port = await reservePort();
const vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root, stdio: 'ignore',
});
const base = `http://127.0.0.1:${port}/`;
const deadline = Date.now() + 15000;
let serverReady = false;
while (Date.now() < deadline) {
  if (vite.exitCode !== null) break;
  try { const response = await fetch(base); if (response.ok) { serverReady = true; break; } }
  catch { /* Vite is still starting. */ }
  await new Promise((resolve) => setTimeout(resolve, 200));
}
if (!serverReady) {
  vite.kill('SIGTERM');
  console.error('BROWSER-QA FEHLGESCHLAGEN: Vite-Server wurde nicht bereit.');
  process.exit(1);
}

let failed = false;
const userDataDir = await mkdtemp(path.join(tmpdir(), 'kb-browser-smoke-'));
try {
  for (const shot of screenshots) {
    const shotUrl = new URL(shot.urlPath, base).toString();
    const args = [
      '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-crash-reporter',
      '--no-first-run', '--no-default-browser-check',
      '--disable-background-networking', '--disable-component-update', '--enable-webgl', '--enable-unsafe-swiftshader',
      `--user-data-dir=${userDataDir}`,
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-logging=stderr', `--window-size=${shot.size}`,
      '--virtual-time-budget=8000', `--screenshot=${shot.path}`, '--dump-dom', shotUrl,
    ];
    const result = await run(browser, args, { timeout: 50000 });
    const dom = result.stdout;
    const hasCanvas = /<canvas\b/i.test(dom);
    const errorMatch = dom.match(/<div\b[^>]*id="loading-error"[^>]*>([\s\S]*?)<\/div>/i);
    const errorVisible = errorMatch && !/\bhidden\b/.test(errorMatch[0]);
    const uncaughtError = /Uncaught (?:TypeError|Error|ReferenceError)|Failed to load module script|Failed to resolve module specifier/i.test(`${result.stdout}\n${result.stderr}`);
    const sceneLabel = dom.match(/<div\b[^>]*id="active-scene-label"[^>]*>([\s\S]*?)<\/div>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
    const correctScene = sceneLabel.includes(shot.expectedScene);
    const screenshotExists = await access(shot.path, constants.R_OK).then(() => true).catch(() => false);
    const ok = result.code === 0 && !result.timedOut && hasCanvas && !errorVisible && !uncaughtError && correctScene && screenshotExists;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${shot.name}: canvas=${hasCanvas}, scene=${sceneLabel || '(missing)'}, expectedScene=${shot.expectedScene}, visibleError=${Boolean(errorVisible)}, uncaughtError=${uncaughtError}, screenshot=${screenshotExists}, timeout=${result.timedOut}, chromiumExit=${result.code}, screenshotPath=${path.relative(root, shot.path)}`);
    if (!ok) {
      failed = true;
      if (errorMatch) console.error(errorMatch[1].replace(/<[^>]+>/g, '').slice(0, 500));
      if (result.stderr.trim()) console.error(result.stderr.trim().slice(-1200));
    }
  }
} finally {
  vite.kill('SIGTERM');
  await new Promise((resolve) => vite.once('exit', resolve)).catch(() => {});
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
}

if (failed) process.exit(1);
console.log('Browser-Smoke erfolgreich: Phaser startete in Desktop, Mobile und der isolierten Tiled-Render-QA-Szene.');
