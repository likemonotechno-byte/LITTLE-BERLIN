import {
  assertAssetCatalog,
  assertModuleDocument,
  assertProjectManifest,
  assertProjectPath,
  assertWorldDocument,
  validateWorldProject,
  type LoadedWorldProject,
} from './WorldModel.ts';

export type WorldJsonReader = (relativePublicPath: string) => Promise<unknown>;

/**
 * Loads a versioned world project from root-relative public/ paths.
 * The reader is injected so the same logic works with fetch, tests or an editor filesystem adapter.
 */
export async function loadWorldProject(projectPath: string, readJson: WorldJsonReader): Promise<LoadedWorldProject> {
  assertProjectPath(projectPath, 'projectPath');
  const projectValue = await readJson(projectPath);
  assertProjectManifest(projectValue);

  const [worldValue, assetCatalogValue] = await Promise.all([
    readJson(projectValue.worldIndex),
    readJson(projectValue.assetCatalog),
  ]);
  assertWorldDocument(worldValue);
  assertAssetCatalog(assetCatalogValue);

  const modules = new Map<string, import('./WorldModel.ts').ModuleDocument>();
  for (const district of worldValue.districts) {
    for (const reference of district.modules) {
      if (modules.has(reference.id)) throw new Error(`Modul-ID '${reference.id}' wird im Weltindex mehrfach verwendet.`);
      const moduleValue = await readJson(reference.document);
      assertModuleDocument(moduleValue);
      if (moduleValue.id !== reference.id) {
        throw new Error(`Modulreferenz '${reference.id}' verweist auf Moduldokument '${moduleValue.id}'.`);
      }
      modules.set(reference.id, moduleValue);
    }
  }

  const issues = validateWorldProject(projectValue, worldValue, modules, assetCatalogValue);
  if (issues.length) {
    const summary = issues.map((issue) => `${issue.code} ${issue.path}: ${issue.message}`).join('\n');
    throw new Error(`World-Projekt ist ungültig:\n${summary}`);
  }

  return {
    project: projectValue,
    world: worldValue,
    modules,
    assetCatalog: assetCatalogValue,
  };
}

/** Browser helper. Paths inside the world model stay relative to the public root. */
export async function fetchWorldProject(projectPath: string, publicBaseUrl = '/'): Promise<LoadedWorldProject> {
  const base = publicBaseUrl.endsWith('/') ? publicBaseUrl : `${publicBaseUrl}/`;
  return loadWorldProject(projectPath, async (relativePath) => {
    assertProjectPath(relativePath, 'resourcePath');
    const response = await fetch(`${base}${relativePath}`);
    if (!response.ok) throw new Error(`World-Projektdatei konnte nicht geladen werden (${response.status}): ${relativePath}`);
    return response.json() as Promise<unknown>;
  });
}
