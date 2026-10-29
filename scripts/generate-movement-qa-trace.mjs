import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importTiledJson } from '../src/tiled/TiledJsonImporter.ts';
import { deriveTiledSceneData } from '../src/tiled/TiledNavigationExtractor.ts';
import { PolygonNavMesh } from '../src/navigation/PolygonNavMesh.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), 'utf8'));
const manifest = await readJson('public/data/scenes/CON-01.manifest.json');
const rawMap = await readJson(`public/${manifest.tiledMapJson}`);
const imported = await importTiledJson(manifest.tiledMapJson, rawMap, async (relative) => readJson(`public/${relative}`), manifest);
const derived = deriveTiledSceneData(imported.layers, {
  mapId: manifest.id,
  levelId: manifest.display.levelLabel,
  floorZ: manifest.navigation?.floorZ,
  agentRadiusPx: manifest.navigation?.agentRadiusPx,
  agentRadiusMeters: manifest.navigation?.agentRadiusMeters,
  coordinateScaleX: manifest.renderSpace.imageScaleX ?? 1,
  coordinateScaleY: manifest.renderSpace.imageScaleY ?? 1,
});
const nav = new PolygonNavMesh(derived.navmesh);
const spawn = [manifest.spawn.xPx, manifest.spawn.yPx];
if (!nav.isWalkable(...spawn)) throw new Error('CON-01 Spawn hat keinen ausreichenden Clearance-Abstand.');
const routes = derived.navmesh.interaction_zones.map((zone) => {
  const path = nav.findPath(spawn[0], spawn[1], zone.position_px[0], zone.position_px[1]);
  const safe = path.length > 0 && nav.isPathSafe(spawn, path);
  if (!safe) throw new Error(`${zone.name}: keine sichere Route generiert.`);
  let distancePx = 0;
  let previous = spawn;
  for (const point of path) {
    distancePx += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    previous = point;
  }
  return {
    id: zone.interaction_id,
    name: zone.name,
    targetStagePx: zone.position_px,
    routeStagePx: path,
    routeLengthStagePx: Number(distancePx.toFixed(2)),
    safe,
  };
});
const out = {
  schemaVersion: '1.0',
  purpose: 'Deterministic movement-path QA snapshot; coordinates stay in calibrated Stage pixels.',
  sceneId: manifest.id,
  referenceImage: 'public/assets/stages/con-01.jpg',
  referenceImageSize: [manifest.renderSpace.sourceImageWidthPx, manifest.renderSpace.sourceImageHeightPx],
  stageSize: [manifest.renderSpace.widthPx, manifest.renderSpace.heightPx],
  imageScale: [manifest.renderSpace.imageScaleX, manifest.renderSpace.imageScaleY],
  agentRadiusStagePx: nav.agentRadiusPx,
  spawnStagePx: spawn,
  walkablePolygons: derived.navmesh.walkable_polygons.map((polygon) => ({ id: polygon.polygon_id, name: polygon.name, pointsStagePx: polygon.points_px })),
  collisionPolygons: derived.navmesh.collision_polygons.map((polygon) => ({ id: polygon.obstacle_id, name: polygon.name, pointsStagePx: polygon.points_px })),
  routes,
  summary: { interactions: routes.length, safeRoutes: routes.filter((route) => route.safe).length },
};
const outPath = path.join(root, 'docs/qa/CON01_MOVEMENT_ROUTE_TRACE.json');
await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(`CON-01 Movement QA trace: ${routes.length}/${routes.length} sichere Routen → ${path.relative(root, outPath)}`);
