import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'public');
const manifestPath = path.join(publicRoot, 'data/scenes/CON-01.manifest.json');
const navPath = path.join(publicRoot, 'data/navmeshes/CON-01.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const nav = JSON.parse(await readFile(navPath, 'utf8'));
const scaleX = manifest.renderSpace.imageScaleX;
const scaleY = manifest.renderSpace.imageScaleY;
if (!(scaleX > 0 && scaleY > 0)) throw new Error('CON-01 Manifest benötigt positive imageScaleX/imageScaleY.');
const toEditorPoint = ([x, y]) => ({ x: round(x / scaleX), y: round(y / scaleY) });
const round = (number) => Math.round(number * 1000) / 1000;
const property = (name, value) => ({
  name,
  type: typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? 'float' : 'string',
  value,
});
const properties = (record) => Object.entries(record).map(([name, value]) => property(name, value));
let nextObjectId = 1;
function polygonObject(role, name, stagePoints, props = {}) {
  const points = stagePoints.map(toEditorPoint);
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return {
    id: nextObjectId++, name, type: role, class: role,
    x: minX, y: minY, width: round(maxX - minX), height: round(maxY - minY),
    rotation: 0, visible: true,
    polygon: points.map((point) => ({ x: round(point.x - minX), y: round(point.y - minY) })),
    properties: properties({ navigationRole: role, ...props }),
  };
}
function pointObject(role, name, stagePoint, props = {}) {
  const { x, y } = toEditorPoint(stagePoint);
  return {
    id: nextObjectId++, name, type: role, class: role,
    x, y, width: 0, height: 0, rotation: 0, visible: true, point: true,
    properties: properties({ navigationRole: role, ...props }),
  };
}
const layers = [
  {
    id: 1, name: 'Background reference (not rendered by engine)', type: 'imagelayer',
    image: '../../assets/stages/con-01.jpg', imagewidth: manifest.renderSpace.sourceImageWidthPx,
    imageheight: manifest.renderSpace.sourceImageHeightPx, x: 0, y: 0, offsetx: 0, offsety: 0,
    visible: true, opacity: 1, repeatx: false, repeaty: false,
  },
  {
    id: 2, name: 'walkable_tier_0', type: 'objectgroup', draworder: 'topdown', visible: true, opacity: 0.45,
    color: '#22c55e', objects: nav.walkable_polygons.map((poly) => polygonObject('walkable', poly.name, poly.points_px, {
      polygonId: poly.polygon_id ?? '', allowed: poly.allowed !== false, floorZ: poly.floor_z ?? 0,
      speedModifier: poly.speed_modifier ?? 1,
    })),
  },
  {
    id: 3, name: 'collision_tier_0', type: 'objectgroup', draworder: 'topdown', visible: true, opacity: 0.65,
    color: '#ef4444', objects: nav.collision_polygons.map((poly) => polygonObject('collision', poly.name, poly.points_px, {
      obstacleId: poly.obstacle_id ?? '', floorZ: poly.floor_z ?? 0, heightMeters: poly.height_m ?? 0,
    })),
  },
  {
    id: 4, name: 'connectors_tier_0', type: 'objectgroup', draworder: 'topdown', visible: true, opacity: 0.65,
    color: '#38bdf8', objects: nav.connector_zones.map((connector) => polygonObject('connector', connector.label ?? connector.connector_id, connector.trigger_polygon_px, {
      zoneId: connector.zone_id, connectorId: connector.connector_id, connectorType: connector.type,
      targetMap: connector.target_map ?? '', targetLevel: connector.target_level ?? '',
      label: connector.label ?? connector.connector_id, zFrom: connector.z_from ?? 0, zTo: connector.z_to ?? 0,
    })),
  },
  {
    id: 5, name: 'interactions_tier_0', type: 'objectgroup', draworder: 'topdown', visible: true, opacity: 0.65,
    color: '#f59e0b', objects: nav.interaction_zones.map((interaction) => pointObject('interaction', interaction.name, interaction.position_px, {
      interactionId: interaction.interaction_id, radiusPx: interaction.radius_px, interactionType: interaction.type,
      title: interaction.title, description: interaction.description,
    })),
  },
];
const map = {
  type: 'map', version: '1.10', tiledversion: '1.10.2', orientation: 'isometric', renderorder: 'right-down',
  width: 22, height: 26, tilewidth: 64, tileheight: 32, infinite: false,
  nextlayerid: 6, nextobjectid: nextObjectId,
  properties: properties({
    kbMapRole: 'legacy-stage-navigation-overlay',
    kbCoordinateSpace: 'source-image-pixels',
    kbSceneId: 'CON-01',
    kbSourceImage: 'assets/stages/con-01.jpg',
    kbRuntimeScaleX: scaleX,
    kbRuntimeScaleY: scaleY,
    kbRuntimeWidthPx: manifest.renderSpace.widthPx,
    kbRuntimeHeightPx: manifest.renderSpace.heightPx,
    kbWorldMapping: 'legacy-stage-calibrated; Tiled object coordinates are scaled back to stage pixels by the scene manifest.',
    kbMacroCols: manifest.grid.macroCols,
    kbMacroRows: manifest.grid.macroRows,
    kbMacroTileMeters: manifest.grid.macroTileMeters,
  }),
  layers,
  tilesets: [],
};
const out = path.join(publicRoot, 'data/maps/CON-01.tiled.json');
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(map, null, 2)}\n`);
console.log(`Generated ${path.relative(root, out)}: ${nav.walkable_polygons.length} walkable, ${nav.collision_polygons.length} collision, ${nav.connector_zones.length} connectors, ${nav.interaction_zones.length} interactions (${nextObjectId - 1} objects).`);
