import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertAssetCatalog,
  assertModuleDocument,
  assertProjectManifest,
  assertWorldDocument,
  validateWorldProject,
} from '../src/world/WorldModel.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const publicRoot = path.join(root, 'public');
const projectPath = 'data/worlds/klein-berlin/project.json';
const errors = [];
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(publicRoot, relativePath), 'utf8'));
const requireFile = async (relativePath, label) => {
  try { await access(path.join(publicRoot, relativePath)); }
  catch { errors.push(`${label}: Datei fehlt: ${relativePath}`); }
};

try {
  const project = await readJson(projectPath);
  assertProjectManifest(project);
  const world = await readJson(project.worldIndex);
  assertWorldDocument(world);
  const assetCatalog = await readJson(project.assetCatalog);
  assertAssetCatalog(assetCatalog);
  const modules = new Map();
  let geometryCount = 0;
  let connectorCount = 0;
  for (const district of world.districts) {
    for (const ref of district.modules) {
      const module = await readJson(ref.document);
      assertModuleDocument(module);
      modules.set(ref.id, module);
      geometryCount += module.geometries.length;
      connectorCount += module.connectors.length;
      for (const image of module.referenceImages) await requireFile(image.source, `${module.id}/${image.id}`);
      for (const tilemap of module.tilemaps) await requireFile(tilemap.source, `${module.id}/${tilemap.id}`);
    }
  }
  for (const asset of assetCatalog.assets) await requireFile(asset.visual.image, `Asset ${asset.id}`);
  const issues = validateWorldProject(project, world, modules, assetCatalog);
  for (const issue of issues) errors.push(`${issue.code} ${issue.path}: ${issue.message}`);
  if (!errors.length) {
    console.log('KLEIN BERLIN World Model V1 — Prüfung');
    console.log(`Welt: ${world.name} | Stadtteile: ${world.districts.length} | Module: ${modules.size}`);
    console.log(`Vektorgeometrien: ${geometryCount} | Connector-Endpunkte: ${connectorCount} | Assets: ${assetCatalog.assets.length}`);
    console.log('Geprüft: Schema-Versionen, IDs, Bounds, Layer, Geometrien, sichere Pfade, Asset-Referenzen und bidirektionale Modulanschlüsse.');
    console.log('ERGEBNIS: World-Model-Testprojekt ist gültig.');
  }
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}

if (errors.length) {
  for (const error of errors) console.error(`FEHLER: ${error}`);
  process.exitCode = 1;
}
