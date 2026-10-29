import {
  assertModuleDocument,
  type LoadedWorldProject,
  type ModuleDocument,
} from './WorldModel.ts';

export interface WorldDraftBundle {
  format: 'klein-berlin-world-draft';
  formatVersion: 1;
  projectId: string;
  worldId: string;
  modules: ModuleDocument[];
}

export function createWorldDraftBundle(loaded: LoadedWorldProject): WorldDraftBundle {
  return {
    format: 'klein-berlin-world-draft',
    formatVersion: 1,
    projectId: loaded.project.projectId,
    worldId: loaded.world.worldId,
    modules: [...loaded.modules.values()].map((module) => JSON.parse(JSON.stringify(module)) as ModuleDocument),
  };
}

/** Applies a browser-saved draft only to the same project and only to known modules. */
export function applyWorldDraftBundle(loaded: LoadedWorldProject, value: unknown): { appliedModules: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Entwurf muss ein JSON-Objekt sein.');
  const draft = value as Partial<WorldDraftBundle>;
  if (draft.format !== 'klein-berlin-world-draft' || draft.formatVersion !== 1) throw new Error('Unbekanntes Entwurfsformat oder nicht unterstützte Version.');
  if (draft.projectId !== loaded.project.projectId || draft.worldId !== loaded.world.worldId) throw new Error('Entwurf gehört zu einem anderen Projekt oder einer anderen Welt.');
  if (!Array.isArray(draft.modules)) throw new Error('Entwurf benötigt modules[].');
  let appliedModules = 0;
  const seen = new Set<string>();
  for (const valueModule of draft.modules) {
    assertModuleDocument(valueModule);
    if (seen.has(valueModule.id)) throw new Error(`Entwurf enthält Modul '${valueModule.id}' mehrfach.`);
    seen.add(valueModule.id);
    const current = loaded.modules.get(valueModule.id);
    if (!current) throw new Error(`Entwurf enthält unbekanntes Modul '${valueModule.id}'.`);
    if (current.boundsMeters.width !== valueModule.boundsMeters.width || current.boundsMeters.depth !== valueModule.boundsMeters.depth) {
      throw new Error(`Entwurf und Projekt haben für '${valueModule.id}' unterschiedliche Modulmaße.`);
    }
    loaded.modules.set(valueModule.id, JSON.parse(JSON.stringify(valueModule)) as ModuleDocument);
    appliedModules += 1;
  }
  return { appliedModules };
}
