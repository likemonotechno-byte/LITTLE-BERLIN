# Umsetzung — KLEIN BERLIN Hybrid-Engine V1.2

**Datum:** 28.10.2026  
**Arbeitsumfang:** Foundation / World Model V1

## Implementiert

- Neue versionierte Datenverträge in `src/world/WorldModel.ts`.
- Validierung von Projektmanifest, Weltindex, Modulmanifest und Asset-Katalog.
- Modul-lokale Meterkoordinaten mit Weltursprung, Höhenversatz und Drehungen 0°/90°/180°/270°.
- Loader in `src/world/WorldProjectLoader.ts`, mit injizierbarem JSON-Reader und Browser-Fetch-Adapter.
- World-Model-Validator im normalen `npm run validate`.
- Beispielwelt unter `public/data/worlds/klein-berlin/`: ein Stadtteil, zwei benachbarte 100×100-m-Module, fünf Geometrie-Features und ein bidirektionaler Straßenanschluss.
- Elf zusätzliche World-Model-Tests; insgesamt sind jetzt 57 Tests vorhanden.
- Architekturentscheidungen, World-Model-Dokumentation und aktualisierte README/Release-Notizen.
- `package.json` auf Version 1.2.0 angehoben und Root-Version im vorhandenen `package-lock.json` synchronisiert.

## Verifikation

| Befehl | Ergebnis |
|---|---|
| `npm test` | PASS — 57/57 Tests |
| `npm run validate` | PASS — Bestandsprojekt, Source-Graph und World-Model-Testprojekt |
| `npm run typecheck:navigation` | PASS — einschließlich der beiden neuen World-Model-Dateien |
| `npm run release-check` | Teilerfolg — Offline-Gates PASS; Build und Browser-QA BLOCKED |

Der vollständige Phaser-/Vite-Build und der Browser-Smoke wurden nicht ausgeführt, weil `node_modules` fehlt. Das ist ausdrücklich kein erfolgreicher Build-Nachweis. Das vorhandene Lockfile ist im Projektpaket enthalten; `npm ci` muss in einer Umgebung mit erreichbarer npm-Registry noch verifiziert werden.

## Bewusst noch nicht implementiert

- Grafische Editor-Oberfläche;
- Echtzeit-Rendering der neuen Weltmodule in Phaser;
- Straßenflächen-Extrusion, Kreuzungsaufbau oder automatische Navigationsableitung aus den neuen Vektorgeometrien;
- Referenzbild-Kalibrierungswerkzeuge;
- Asset-Browser und Drag-and-drop;
- Einbindung vorhandener Legacy-Bahnhofsszenen als visuelle Quellen im Weltindex;
- Tiled-Importadapter in die normalisierte World-Model-Repräsentation;
- Undo/Redo, Autosave und Projekt-Export-UI.

Diese Grenzen bleiben sichtbar dokumentiert, damit Datenmodell, Validator und Loader nicht mit einem fertigen Editor verwechselt werden.

## Nächster Umsetzungsschritt

Phase 2: `IsoProjector` und ein minimaler Daten-Renderer für ein neues `ModuleDocument`. Zuerst Boden-/Debug-Layer und eine Polygonfläche rendern, dann eine Asset-Instanz ergänzen. Erst nach dem Render-Prototyp folgt die Editor-Interaktion.
