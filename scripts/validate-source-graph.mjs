import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, '..');

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(fullPath));
    else if (entry.isFile() && /\.(?:ts|tsx|js|mjs)$/.test(entry.name)) output.push(fullPath);
  }
  return output;
}

function packageName(specifier) {
  if (specifier.startsWith('node:')) return null;
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

async function fileExists(filePath) {
  try { return (await stat(filePath)).isFile(); } catch { return false; }
}

async function resolveLocalImport(sourceFile, specifier) {
  const raw = path.resolve(path.dirname(sourceFile), specifier);
  const candidates = path.extname(raw)
    ? [raw]
    : [raw, `${raw}.ts`, `${raw}.tsx`, `${raw}.js`, `${raw}.mjs`, `${raw}.json`, `${raw}.css`,
      path.join(raw, 'index.ts'), path.join(raw, 'index.js'), path.join(raw, 'index.mjs')];
  for (const candidate of candidates) if (await fileExists(candidate)) return candidate;
  return null;
}

export async function validateSourceGraph(root = defaultRoot) {
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const declaredPackages = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
  ]);
  const sourceRoots = ['src', 'scripts', 'tests'].map((name) => path.join(root, name));
  const sourceFiles = [];
  for (const directory of sourceRoots) sourceFiles.push(...await walk(directory));
  sourceFiles.push(path.join(root, 'vite.config.ts'));

  const errors = [];
  const externalImports = new Set();
  let importCount = 0;
  // Handles side-effect, type-only, multiline named, and export-from declarations.
  const importPattern = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s*)?["']([^"']+)["']/gm;

  for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      importCount++;
      if (specifier.startsWith('.')) {
        const resolved = await resolveLocalImport(sourceFile, specifier);
        if (!resolved) errors.push(`${path.relative(root, sourceFile)}: lokaler Import kann nicht aufgelöst werden: ${specifier}`);
        else if (!path.relative(root, resolved) || path.relative(root, resolved).startsWith('..')) {
          errors.push(`${path.relative(root, sourceFile)}: lokaler Import verlässt das Projektverzeichnis: ${specifier}`);
        }
      } else {
        const name = packageName(specifier);
        if (name) {
          externalImports.add(name);
          if (!declaredPackages.has(name)) errors.push(`${path.relative(root, sourceFile)}: externes Paket '${name}' ist nicht in package.json deklariert.`);
        }
      }
    }
  }

  return {
    sourceFiles: sourceFiles.length,
    importCount,
    externalImports: [...externalImports].sort(),
    errors,
  };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = await validateSourceGraph();
  console.log(`Source-Graph: ${result.sourceFiles} Quell-/Testdateien, ${result.importCount} Importdeklarationen, externe Pakete: ${result.externalImports.join(', ') || '(keine)'}.`);
  if (result.errors.length) {
    for (const error of result.errors) console.error(`FEHLER: ${error}`);
    process.exitCode = 1;
  } else {
    console.log('ERGEBNIS: alle lokalen Imports auflösbar; externe Pakete deklariert.');
  }
}
