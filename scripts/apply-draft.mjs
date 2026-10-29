import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const publicRoot = path.join(root, 'public');

const inputPath = process.argv[2] ?? path.join(root, 'klein-berlin-world-draft.json');

async function main() {
  console.log(`Lese World-Draft aus: ${inputPath}`);
  let raw;
  try {
    raw = await readFile(inputPath, 'utf8');
  } catch (err) {
    console.error(`FEHLER: Draft-Datei konnte nicht gelesen werden (${inputPath}):`, err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const draft = JSON.parse(raw);
  if (draft.format !== 'klein-berlin-world-draft' || draft.formatVersion !== 1) {
    console.error('FEHLER: Ungültiges Draft-Format oder nicht unterstützte Version:', draft.format, draft.formatVersion);
    process.exit(1);
  }

  const projectPath = path.join(publicRoot, 'data/worlds/klein-berlin/project.json');
  const project = JSON.parse(await readFile(projectPath, 'utf8'));
  const worldPath = path.join(publicRoot, project.worldIndex);
  const world = JSON.parse(await readFile(worldPath, 'utf8'));

  const moduleDocMap = new Map();
  for (const district of world.districts) {
    for (const modRef of district.modules) {
      moduleDocMap.set(modRef.id, modRef.document);
    }
  }

  let appliedCount = 0;
  for (const draftModule of draft.modules) {
    const docRelPath = moduleDocMap.get(draftModule.id);
    if (!docRelPath) {
      console.warn(`WARNUNG: Modul '${draftModule.id}' gehört nicht zu dieser Welt — übersprungen.`);
      continue;
    }

    const fullPath = path.join(publicRoot, docRelPath);
    const formatted = JSON.stringify(draftModule, null, 2) + '\n';
    await writeFile(fullPath, formatted, 'utf8');
    console.log(`✓ Modul '${draftModule.id}' aktualisiert (${draftModule.geometries.length} Geometrien, ${draftModule.entities?.length ?? 0} Entities, ${draftModule.connectors.length} Connectoren) -> ${docRelPath}`);
    appliedCount += 1;
  }

  console.log(`\nERFOLG: ${appliedCount} Modul(e) erfolgreich in das Projektverzeichnis zurückgeschrieben.`);
}

main().catch((err) => {
  console.error('Unerwarteter Fehler:', err);
  process.exit(1);
});
