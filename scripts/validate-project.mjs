import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importTiledJson, resolvePublicRelativePath } from '../src/tiled/TiledJsonImporter.ts';
import { deriveTiledSceneData } from '../src/tiled/TiledNavigationExtractor.ts';
import { PolygonNavMesh } from '../src/navigation/PolygonNavMesh.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const publicRoot = path.join(root, 'public');
const errors = [];
const warnings = [];
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(publicRoot, relativePath), 'utf8'));
const pointInPolygon = (x, y, points) => {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};
const fileExists = async (filePath) => {
  try { return (await stat(filePath)).isFile(); } catch { return false; }
};

async function loadAuthoritativeNavmesh(manifest) {
  if ((manifest.navigationSource ?? 'navmesh-json') === 'tiled-object-layers') {
    if (!manifest.tiledMapJson) throw new Error(`${manifest.id}: Tiled-Navigation ohne tiledMapJson.`);
    const rawMap = await readJson(manifest.tiledMapJson);
    const imported = await importTiledJson(manifest.tiledMapJson, rawMap, readJson, manifest);
    const derived = deriveTiledSceneData(imported.layers, {
      mapId: manifest.id,
      levelId: manifest.display.levelLabel,
      floorZ: manifest.navigation?.floorZ ?? manifest.display.zMeters,
      agentRadiusPx: manifest.navigation?.agentRadiusPx,
      agentRadiusMeters: manifest.navigation?.agentRadiusMeters,
      coordinateScaleX: manifest.renderSpace.imageScaleX ?? 1,
      coordinateScaleY: manifest.renderSpace.imageScaleY ?? 1,
    });
    return { navmesh: derived.navmesh, imported, diagnostics: derived.diagnostics };
  }
  if (!manifest.navmeshData) throw new Error(`${manifest.id}: navmeshData fehlt.`);
  return { navmesh: await readJson(manifest.navmeshData) };
}

function comparePointCollections(sceneId, label, current, reference, pointKey) {
  if (current.length !== reference.length) {
    errors.push(`${sceneId}: ${label}-Anzahl unterscheidet sich vom Legacy-Referenzstand (${current.length}/${reference.length}).`);
    return;
  }
  current.forEach((record, index) => {
    const a = record[pointKey];
    const b = reference[index][pointKey];
    if (a.length !== b.length) {
      errors.push(`${sceneId}: ${label}[${index}] hat eine abweichende Punktzahl.`);
      return;
    }
    for (let pointIndex = 0; pointIndex < a.length; pointIndex++) {
      if (Math.abs(a[pointIndex][0] - b[pointIndex][0]) >= 0.01 || Math.abs(a[pointIndex][1] - b[pointIndex][1]) >= 0.01) {
        errors.push(`${sceneId}: ${label}[${index}] Punkt ${pointIndex} ist nicht pixelgetreu (${a[pointIndex]} vs ${b[pointIndex]}).`);
        break;
      }
    }
  });
}

const index = await readJson('data/scene-index.json');
if (index.version !== '1.0') errors.push('Unbekannte Version von scene-index.json.');
if (!Array.isArray(index.scenes) || index.scenes.length !== 4) errors.push(`Vier V0.3-Szenen erwartet, gefunden: ${index.scenes?.length ?? 0}.`);
const seen = new Set();
let connectorCount = 0;
let sliceCount = 0;
let cutawayCount = 0;
let walkableCount = 0;
let obstacleCount = 0;
let tiledAuthoritativeScenes = 0;
let testedMovementRoutes = 0;

for (const item of index.scenes ?? []) {
  if (seen.has(item.id)) errors.push(`Doppelte Szenen-ID: ${item.id}`);
  seen.add(item.id);
  const manifest = await readJson(item.manifest);
  if (manifest.id !== item.id) errors.push(`Index/Manifest-ID passt nicht: ${item.id} / ${manifest.id}`);
  if (manifest.renderSpace?.mode !== 'pre-rendered-stage') errors.push(`${item.id}: Erwartete Stage-Pixel-Referenzszene.`);
  if (manifest.renderSpace?.widthPx !== 2048 || manifest.renderSpace?.heightPx !== 1529) errors.push(`${item.id}: Unerwartete Referenz-Stage-Maße.`);
  if (manifest.grid?.projection !== 'legacy-stage-calibrated') errors.push(`${item.id}: Legacy-Koordinaten nicht separat markiert.`);
  if (!manifest.worldMapping?.type) errors.push(`${item.id}: worldMapping ist nicht deklariert.`);
  for (const rel of [manifest.baseBackdropImage, manifest.navmeshData, manifest.tiledMapJson, ...manifest.foregroundSlices.map((x) => x.image)]) {
    if (typeof rel === 'string' && !(await fileExists(path.join(publicRoot, rel)))) errors.push(`${item.id}: Referenzdatei fehlt: ${rel}`);
  }
  for (const slice of manifest.foregroundSlices ?? []) {
    if (!slice.cutaway) continue;
    cutawayCount++;
    const profile = slice.cutaway;
    if (![profile.fadeStartPx, profile.fadeEndPx, profile.minAlpha].every(Number.isFinite)
      || profile.fadeStartPx < 0 || profile.fadeEndPx <= profile.fadeStartPx
      || profile.minAlpha < 0 || profile.minAlpha > 1) {
      errors.push(`${item.id} Slice ${slice.id}: ungültiges Cutaway-Profil.`);
    }
  }

  let nav;
  let tiledImported;
  try {
    const loaded = await loadAuthoritativeNavmesh(manifest);
    nav = loaded.navmesh;
    tiledImported = loaded.imported;
    if (loaded.diagnostics?.length) warnings.push(...loaded.diagnostics.map((d) => `${item.id}: ${d}`));
  } catch (error) {
    errors.push(`${item.id}: Autoritative Navigation konnte nicht geladen werden: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }
  if (nav.map_id !== item.id) errors.push(`${item.id}: NavMesh-ID ${nav.map_id} stimmt nicht mit dem Manifest überein.`);
  if (!Array.isArray(nav.walkable_polygons) || !Array.isArray(nav.collision_polygons)
    || !Array.isArray(nav.connector_zones) || !Array.isArray(nav.interaction_zones)) {
    errors.push(`${item.id}: NavMesh enthält nicht alle vier Geometrietypen.`);
    continue;
  }
  connectorCount += nav.connector_zones.length;
  sliceCount += manifest.foregroundSlices.length;
  walkableCount += nav.walkable_polygons.length;
  obstacleCount += nav.collision_polygons.length;

  if ((manifest.navigationSource ?? 'navmesh-json') === 'tiled-object-layers') {
    tiledAuthoritativeScenes++;
    if (!tiledImported) errors.push(`${item.id}: Tiled wird als Quelle deklariert, wurde aber nicht importiert.`);
    if (manifest.navmeshData !== null) errors.push(`${item.id}: Tiled-source sollte keine doppelte authoritative navmeshData referenzieren.`);
    if (manifest.renderSpace.mode === 'pre-rendered-stage') {
      if (manifest.grid.tilePixelWidth !== 64 || manifest.grid.tilePixelHeight !== 32) errors.push(`${item.id}: Legacy-Overlay muss die native 64×32 Editor-Kachel deklarieren.`);
      const rawMap = await readJson(manifest.tiledMapJson);
      const background = rawMap.layers?.find((layer) => layer.type === 'imagelayer');
      if (!background?.image) errors.push(`${item.id}: Tiled-Overlay benötigt die Referenzbild-Image-Layer.`);
      else {
        const resolved = resolvePublicRelativePath(manifest.tiledMapJson, background.image);
        if (!(await fileExists(path.join(publicRoot, resolved)))) errors.push(`${item.id}: Tiled-Referenzbild fehlt: ${resolved}`);
      }
      if (!manifest.renderSpace.imageScaleX || !manifest.renderSpace.imageScaleY) errors.push(`${item.id}: Tiled-Overlay braucht Skalierung vom Originalbild zur Stage.`);
      const legacyPath = `data/navmeshes/${item.id}.json`;
      const legacy = await readJson(legacyPath);
      comparePointCollections(item.id, 'Walkable', nav.walkable_polygons, legacy.walkable_polygons, 'points_px');
      comparePointCollections(item.id, 'Collision', nav.collision_polygons, legacy.collision_polygons, 'points_px');
      comparePointCollections(item.id, 'Connector', nav.connector_zones, legacy.connector_zones, 'trigger_polygon_px');
      if (nav.interaction_zones.length !== legacy.interaction_zones.length) errors.push(`${item.id}: Interaktionsanzahl unterscheidet sich vom Legacy-Referenzstand.`);
      else nav.interaction_zones.forEach((current, n) => {
        const original = legacy.interaction_zones[n];
        if (current.interaction_id !== original.interaction_id
          || Math.abs(current.position_px[0] - original.position_px[0]) >= 0.01
          || Math.abs(current.position_px[1] - original.position_px[1]) >= 0.01
          || current.radius_px !== original.radius_px) errors.push(`${item.id}: Interaktion ${n} weicht vom Legacy-Referenzstand ab.`);
      });
    }
  }

  const { xPx, yPx } = manifest.spawn;
  const isInsideWalkable = nav.walkable_polygons.some((poly) => poly.allowed !== false && pointInPolygon(xPx, yPx, poly.points_px));
  const isInsideObstacle = nav.collision_polygons.some((poly) => pointInPolygon(xPx, yPx, poly.points_px));
  if (!isInsideWalkable) errors.push(`${item.id}: Spawn (${xPx}, ${yPx}) liegt nicht in einem Walkable-Polygon.`);
  if (isInsideObstacle) errors.push(`${item.id}: Spawn (${xPx}, ${yPx}) liegt in einem Kollisionspolygon.`);

  // Runtime QA: the spawn must fit the configured agent footprint and every declared
  // interaction should have a route whose entire swept path remains safe.
  try {
    const runtimeNav = new PolygonNavMesh(nav);
    if (!runtimeNav.isWalkable(xPx, yPx)) errors.push(`${item.id}: Spawn verletzt den Agent-Clearance-Radius (${runtimeNav.agentRadiusPx}px).`);
    for (const interaction of runtimeNav.interactions) {
      const route = runtimeNav.findPath(xPx, yPx, interaction.position_px[0], interaction.position_px[1]);
      if (route.length === 0) {
        errors.push(`${item.id}/${interaction.name}: Kein sicherer Laufweg vom Spawn gefunden.`);
      } else if (!runtimeNav.isPathSafe([xPx, yPx], route)) {
        errors.push(`${item.id}/${interaction.name}: Laufweg kreuzt eine Kollisions- oder Clearance-Zone.`);
      } else testedMovementRoutes++;
    }
  } catch (error) {
    errors.push(`${item.id}: Runtime-Navigationstest fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Tiled JSON smoke fixture: keep this projected-world engineering example outside production scene index.
try {
  const tiledDemoPath = 'data/maps/examples/isometric-diamond-demo.json';
  const tiledDemo = await readJson(tiledDemoPath);
  if (tiledDemo.orientation !== 'isometric') errors.push('Tiled-Demo: orientation muss isometric (Diamond) sein.');
  if (tiledDemo.tilewidth / tiledDemo.tileheight < 1.99 || tiledDemo.tilewidth / tiledDemo.tileheight > 2.01) errors.push('Tiled-Demo: Kachelmaß muss 2:1 sein.');
  if (!Array.isArray(tiledDemo.layers) || !tiledDemo.layers.some((layer) => layer.type === 'tilelayer')) errors.push('Tiled-Demo: mindestens ein Tile-Layer erwartet.');
  for (const layer of tiledDemo.layers ?? []) {
    if (layer.type === 'tilelayer' && Array.isArray(layer.data) && layer.data.length !== tiledDemo.width * tiledDemo.height) errors.push(`Tiled-Demo: Tile-Layer ${layer.name} hat eine inkonsistente Datenlänge.`);
  }
  for (const tileset of tiledDemo.tilesets ?? []) {
    if (typeof tileset.image !== 'string') errors.push(`Tiled-Demo: Tileset ${tileset.name} hat kein Atlas-Bild.`);
    else if (!(await fileExists(path.resolve(publicRoot, path.dirname(tiledDemoPath), tileset.image)))) errors.push(`Tiled-Demo: Atlas-Datei fehlt: ${tileset.image}`);
  }
  const roofLayer = tiledDemo.layers?.find((layer) => layer.type === 'tilelayer' && /roof/i.test(layer.name));
  if (!roofLayer) errors.push('Tiled-Demo: actor-depth roof tile-layer fehlt.');
  else {
    const role = roofLayer.properties?.find((property) => property.name === 'renderRole')?.value;
    const cutaway = roofLayer.properties?.find((property) => property.name === 'cutawayEnabled')?.value;
    if (role !== 'roof') errors.push('Tiled-Demo: roof-Layer muss renderRole=roof deklarieren.');
    if (cutaway !== true) errors.push('Tiled-Demo: roof-Layer muss Cutaway aktivieren.');
    if ((roofLayer.data ?? []).filter((gid) => gid > 0).length < 1) errors.push('Tiled-Demo: roof-Layer braucht mindestens ein belegtes Tile.');
  }
} catch (error) {
  errors.push(`Tiled-Demo konnte nicht geprüft werden: ${error instanceof Error ? error.message : String(error)}`);
}

try {
  const exampleManifest = await readJson('data/scenes/examples/TILED-NAV-DEMO.manifest.json');
  if (exampleManifest.navigationSource !== 'tiled-object-layers') errors.push('Tiled-Nav-Demo muss navigationSource=tiled-object-layers deklarieren.');
  if (exampleManifest.navmeshData !== null) errors.push('Tiled-Nav-Demo muss ohne manuell gepflegte navmeshData auskommen.');
  if (exampleManifest.renderSpace?.mode !== 'projected-world' || exampleManifest.grid?.projection !== 'dimetric-2-to-1') errors.push('Tiled-Nav-Demo muss die projizierte 2:1-Welt verwenden.');
  if (!(await fileExists(path.join(publicRoot, exampleManifest.tiledMapJson ?? '')))) errors.push('Tiled-Nav-Demo referenziert keine vorhandene Map-Datei.');
} catch (error) {
  errors.push(`Tiled-Nav-Demo-Manifest konnte nicht geprüft werden: ${error instanceof Error ? error.message : String(error)}`);
}

try {
  const qaIndex = await readJson('data/qa-scene-index.json');
  if (qaIndex.defaultScene !== 'TILED-NAV-DEMO' || qaIndex.scenes?.length !== 1 || qaIndex.scenes[0]?.id !== 'TILED-NAV-DEMO') {
    errors.push('Render-QA-Index muss genau die isolierte TILED-NAV-DEMO-Szene enthalten.');
  }
  for (const sharedPath of Object.values(qaIndex.sharedAssets ?? {})) {
    if (!(await fileExists(path.join(publicRoot, sharedPath)))) errors.push(`Render-QA-Index: Shared-Datei fehlt: ${sharedPath}`);
  }
} catch (error) {
  errors.push(`Render-QA-Index konnte nicht geprüft werden: ${error instanceof Error ? error.message : String(error)}`);
}

const connectors = await readJson(index.sharedAssets.connectorRegister);
const assets = await readJson(index.sharedAssets.assetRegister);
const traces = await readJson(index.sharedAssets.traceRegister);
if (connectors.length !== 17) errors.push(`Connector-Register: 17 Einträge erwartet, gefunden ${connectors.length}.`);
if (assets.length !== 23) errors.push(`Asset-Register: 23 Einträge erwartet, gefunden ${assets.length}.`);
if (connectorCount !== 17) errors.push(`Scene-NavMeshes: 17 Connector-Zonen erwartet, gefunden ${connectorCount}.`);
if (sliceCount !== 10) errors.push(`CON-01: 10 freigestellte Slices erwartet, gefunden ${sliceCount}.`);
if (Object.keys(traces).length !== 4) errors.push(`Trace-Register: 4 Szenenschlüssel erwartet, gefunden ${Object.keys(traces).length}.`);
for (const sharedPath of Object.values(index.sharedAssets)) if (!(await fileExists(path.join(publicRoot, sharedPath)))) errors.push(`Shared data fehlt: ${sharedPath}`);
if (!(await fileExists(path.join(root, 'legacy/v0.3-reference.html')))) errors.push('Original-V0.3-Referenzdatei fehlt.');

// Mathematical self-check for the canonical projected-world contract (2:1 diamond).
const metrics = { originX: 400, originY: 60, tileWidth: 256, tileHeight: 128, metersPerMacroTile: 10, elevationPxPerTier: 96 };
const worldToScreen = (x, y, tier) => ({
  sx: metrics.originX + (x / metrics.metersPerMacroTile - y / metrics.metersPerMacroTile) * metrics.tileWidth / 2,
  sy: metrics.originY + (x / metrics.metersPerMacroTile + y / metrics.metersPerMacroTile) * metrics.tileHeight / 2 - tier * metrics.elevationPxPerTier,
});
const screenToWorld = (sx, sy, tier) => {
  const dx = sx - metrics.originX;
  const dy = sy - metrics.originY + tier * metrics.elevationPxPerTier;
  const u = (dx / (metrics.tileWidth / 2) + dy / (metrics.tileHeight / 2)) / 2;
  const v = (dy / (metrics.tileHeight / 2) - dx / (metrics.tileWidth / 2)) / 2;
  return { x: u * metrics.metersPerMacroTile, y: v * metrics.metersPerMacroTile };
};
for (const sample of [{ x: 0, y: 0, z: 0 }, { x: 120, y: 60, z: 1 }, { x: 15.5, y: 72.25, z: -1 }]) {
  const screen = worldToScreen(sample.x, sample.y, sample.z);
  const world = screenToWorld(screen.sx, screen.sy, sample.z);
  if (Math.abs(world.x - sample.x) > 1e-9 || Math.abs(world.y - sample.y) > 1e-9) errors.push('UniversalIsoMath round-trip check fehlgeschlagen.');
}

console.log('KLEIN BERLIN Hybrid Engine V1.4 — Bestandsprojekt-Prüfung');
console.log(`Szenen: ${seen.size} | Walkable-Polygone: ${walkableCount} | Kollisionspolygone: ${obstacleCount} | Connector-Zonen: ${connectorCount} | Slices: ${sliceCount} | Cutaway-Profile: ${cutawayCount}`);
console.log(`Connector-Register: ${connectors.length} | Asset-Register: ${assets.length} | Trace-Szenen: ${Object.keys(traces).length} | Tiled-authoritative Szenen: ${tiledAuthoritativeScenes}`);
const qaMap = await readJson('data/maps/examples/isometric-diamond-demo.json');
const qaRoof = qaMap.layers.find((layer) => layer.type === 'tilelayer' && /roof/i.test(layer.name));
console.log(`Render-QA: ${qaMap.tilesets.length} Atlas-Tilesets | ${qaRoof?.data?.filter((gid) => gid > 0).length ?? 0} depth-sorted roof cells | isolated QA index confirmed.`);
console.log(`Laufweg-QA: ${testedMovementRoutes} sichere Interaktionsrouten über alle Szenen geprüft.`);
console.log('Geprüft: Manifest-Verknüpfungen, Asset-Pfade, Cutaway-Profile, Agent-Clearance, Bewegungswege, Tiled-Demo, pixelgenaue CON-01-Navigationsparität, Quellenregister und 2:1-Transformations-Roundtrip.')
for (const warning of warnings) console.warn(`WARNUNG: ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`FEHLER: ${error}`);
  process.exitCode = 1;
} else console.log('ERGEBNIS: alle statischen Prüfungen bestanden.');
