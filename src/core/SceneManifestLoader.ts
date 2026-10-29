import type { LoadedProject, LoadedScene, NavMeshData, SceneIndex, SceneManifest } from './SceneManifest';
import { assertSceneManifest } from './SceneManifest';
import { importTiledJson, type ImportedTiledMap } from '../tiled/TiledJsonImporter';
import { deriveTiledSceneData } from '../tiled/TiledNavigationExtractor';
import { PolygonNavMesh } from '../navigation/PolygonNavMesh';

export function publicAssetPath(baseUrl: string, relativePath: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}${relativePath.replace(/^\/+/, '')}`;
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status} beim Laden von ${url}`);
  try {
    return await response.json() as T;
  } catch (error) {
    throw new Error(`${label}: ungültiges JSON (${error instanceof Error ? error.message : String(error)}).`);
  }
}

/** Loads scene content as data. New scenes are added to scene-index.json, not to engine code. */
export class SceneManifestLoader {
  constructor(
    private readonly baseUrl = import.meta.env.BASE_URL || '/',
    private readonly indexPath = 'data/scene-index.json',
  ) {}

  async loadAll(): Promise<LoadedProject> {
    const index = await fetchJson<SceneIndex>(publicAssetPath(this.baseUrl, this.indexPath), 'Scene-Index');
    if (!Array.isArray(index.scenes) || index.scenes.length === 0) throw new Error('Scene-Index enthält keine Szenen.');
    const ids = new Set<string>();
    for (const entry of index.scenes) {
      if (!entry.id || !entry.manifest) throw new Error('Jeder Scene-Index-Eintrag benötigt id und manifest.');
      if (ids.has(entry.id)) throw new Error(`Doppelte Szenen-ID im Index: ${entry.id}`);
      ids.add(entry.id);
    }

    const scenes = await Promise.all(index.scenes.map(async (entry): Promise<LoadedScene> => {
      const manifestUrl = publicAssetPath(this.baseUrl, entry.manifest);
      const manifest = await fetchJson<SceneManifest>(manifestUrl, `Manifest ${entry.id}`);
      assertSceneManifest(manifest, entry.id);
      let tiledMap: ImportedTiledMap | undefined;
      if (manifest.tiledMapJson) {
        const mapPath = manifest.tiledMapJson.replace(/^\/+/, '');
        const rawMap = await fetchJson<unknown>(publicAssetPath(this.baseUrl, mapPath), `Tiled-Map ${entry.id}`);
        tiledMap = await importTiledJson(mapPath, rawMap, async (publicRelativePath) => {
          return fetchJson<unknown>(publicAssetPath(this.baseUrl, publicRelativePath), `Externes Tiled-Tileset ${publicRelativePath}`);
        }, manifest);
      }

      let navmesh: NavMeshData;
      let tiledDepthObjects: import('../tiled/TiledNavigationExtractor').TiledDepthObject[] | undefined;
      let navigationDiagnostics: string[] | undefined;
      if ((manifest.navigationSource ?? 'navmesh-json') === 'tiled-object-layers') {
        if (!tiledMap) throw new Error(`${entry.id}: NavMesh-Ableitung erfordert eine importierte Tiled-Map.`);
        const derived = deriveTiledSceneData(tiledMap.layers, {
          mapId: entry.id,
          levelId: manifest.display.levelLabel,
          floorZ: manifest.navigation?.floorZ ?? manifest.display.zMeters,
          agentRadiusPx: manifest.navigation?.agentRadiusPx,
          agentRadiusMeters: manifest.navigation?.agentRadiusMeters,
          coordinateScaleX: manifest.renderSpace.imageScaleX ?? 1,
          coordinateScaleY: manifest.renderSpace.imageScaleY ?? 1,
        });
        navmesh = derived.navmesh;
        tiledDepthObjects = derived.depthObjects;
        navigationDiagnostics = derived.diagnostics;
      } else {
        if (!manifest.navmeshData) throw new Error(`${entry.id}: navmeshData fehlt.`);
        navmesh = await fetchJson<NavMeshData>(publicAssetPath(this.baseUrl, manifest.navmeshData), `NavMesh ${entry.id}`);
      }
      if (navmesh.map_id !== entry.id) throw new Error(`${entry.id}: NavMesh-ID ${navmesh.map_id} passt nicht zum Manifest.`);
      this.validateNavMesh(entry.id, navmesh);
      const runtimeNav = new PolygonNavMesh(navmesh);
      if (!runtimeNav.isWalkable(manifest.spawn.xPx, manifest.spawn.yPx)) {
        throw new Error(`${entry.id}: Spawnpunkt verletzt den Agent-Clearance-Radius (${runtimeNav.agentRadiusPx}px).`);
      }
      return { ...manifest, navmesh, ...(tiledMap ? { tiledMap } : {}), ...(tiledDepthObjects ? { tiledDepthObjects } : {}), ...(navigationDiagnostics ? { navigationDiagnostics } : {}) };
    }));

    const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
    if (!sceneById.has(index.defaultScene)) throw new Error(`Default-Szene ${index.defaultScene} existiert nicht im Scene-Index.`);

    const [connectorRegister, assetRegister, traceRegister] = await Promise.all([
      fetchJson<Record<string, unknown>[]>(publicAssetPath(this.baseUrl, index.sharedAssets.connectorRegister), 'Connector-Register'),
      fetchJson<Record<string, unknown>[]>(publicAssetPath(this.baseUrl, index.sharedAssets.assetRegister), 'Asset-Register'),
      fetchJson<Record<string, unknown>>(publicAssetPath(this.baseUrl, index.sharedAssets.traceRegister), 'Trace-Register'),
    ]);

    return { index, scenes, connectorRegister, assetRegister, traceRegister, baseUrl: this.baseUrl, defaultScene: index.defaultScene };
  }

  private validateNavMesh(sceneId: string, navmesh: NavMeshData): void {
    if (!Array.isArray(navmesh.walkable_polygons) || !Array.isArray(navmesh.collision_polygons)
      || !Array.isArray(navmesh.connector_zones) || !Array.isArray(navmesh.interaction_zones)) {
      throw new Error(`${sceneId}: NavMesh benötigt Walkable-, Collision-, Connector- und Interaction-Arrays.`);
    }
    const checkPoints = (label: string, records: Array<{ points_px?: [number, number][] }>) => {
      for (const record of records) {
        if (!Array.isArray(record.points_px) || record.points_px.length < 3) throw new Error(`${sceneId}: ungültiges Polygon in ${label}.`);
        for (const point of record.points_px) {
          if (point.length !== 2 || !point.every(Number.isFinite)) throw new Error(`${sceneId}: nichtnumerischer Polygonpunkt in ${label}.`);
        }
      }
    };
    checkPoints('walkable_polygons', navmesh.walkable_polygons);
    checkPoints('collision_polygons', navmesh.collision_polygons);
    for (const connector of navmesh.connector_zones) {
      if (!Array.isArray(connector.trigger_polygon_px) || connector.trigger_polygon_px.length < 3) throw new Error(`${sceneId}: ungültiges Polygon in connector_zones.`);
      for (const point of connector.trigger_polygon_px) {
        if (point.length !== 2 || !point.every(Number.isFinite)) throw new Error(`${sceneId}: nichtnumerischer Polygonpunkt in connector_zones.`);
      }
    }
    for (const interaction of navmesh.interaction_zones) {
      if (!Array.isArray(interaction.position_px) || interaction.position_px.length !== 2 || !interaction.position_px.every(Number.isFinite)) {
        throw new Error(`${sceneId}: ungültige position_px in interaction_zones.`);
      }
      if (!Number.isFinite(interaction.radius_px) || interaction.radius_px <= 0) throw new Error(`${sceneId}: ungültiger radius_px in interaction_zones.`);
    }
  }
}
