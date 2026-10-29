# Release-Check — KLEIN BERLIN Hybrid Engine V1.5

**Datum:** 29. Oktober 2026  
**Meilenstein:** V1.5.0 — Straßennetz-Synthese, Berliner Profile & Draft-Import

## 1. Prüfergebnisse der Quality Gates

| Quality Gate | Ergebnis | Beleg |
|---|---|---|
| **Automatisierte Unit-Tests** | **PASS** | `81 / 81 Tests bestanden` (inklusive neuer Suite für Straßenableitung & Draft-CLI) |
| **Projekt- & Datenvalidierung** | **PASS** | `npm run validate` (Bestandsprojekt, Source-Graph mit 48 Dateien/169 Imports, World-Model) |
| **Isolierter Navigation-Typecheck** | **PASS** | `npm run typecheck:navigation` |
| **Vollständiger TypeScript Typecheck** | **PASS** | `npm run typecheck` (`tsc --noEmit`) ohne Fehler |
| **Vollständiger Produktionsbuild** | **PASS** | `npm run build` erzeugt Vite-Bundle in 14 s |
| **Chromium Browser-Smoke** | **PASS** | 4/4 Szenen erfolgreich im Headless-Chromium geladen: Desktop, Mobile, Tiled-Render und neu: **World-View** (`docs/qa/browser-smoke-world-view.png`) |
| **Gesamter Release-Check** | **PASS** | `node scripts/release-check.mjs` schließt mit Exit-Code 0 ab |

---

## 2. In V1.5 neu implementiert

1. **Berliner Straßenprofile (`src/geometry/RoadNetwork.ts`):**
   - Typisierte Profile: `primary` (24 m, Fahrbahn 16 m, 2×4 m Gehweg), `secondary` (16 m, Fahrbahn 10 m, 2×3 m Gehweg), `residential` (10 m, Fahrbahn 6 m, 2×2 m Gehweg) und `pedestrian` (8 m, reine Fußgängerpromenade).
   - Mathematische Extrusion von Mittellinien zu geschlossenen Fahrbahn- und Gehweg-Bändern.
   - Automatische Zuweisung begehbarer Polygone (Gehwege $\to$ `walkablePolygons`) und Kollisionsobjekte (Fahrbahnen $\to$ `collisionPolygons`).
2. **Kreuzungs-Clustering & Snapping:**
   - Schnittpunktberechnung zwischen Straßenlinien erzeugt polygonale Kreuzungs-Hubs (Achtecke) mit nahtloser Gehweganbindung.
   - Magnetisches Snapping im Editor: Klicks innerhalb von 2,5 m docken automatisch an Modul-Connectoren oder bestehende Straßenenden an.
3. **Dualer Draft-Workflow:**
   - **Browser-Import:** Neuer Button *JSON laden* (`#btn-world-import`) sowie nativer Drag-and-Drop-Dateiupload direkt auf das App-Fenster.
   - **CLI-Persistenz:** Skript `scripts/apply-draft.mjs` (`npm run apply-draft <datei>`) zum sauberen Schreiben bearbeiteter Entwürfe in die physischen Moduldateien (`public/data/worlds/klein-berlin/modules/*.json`).
4. **Geometrie-Inspektor & Löschen:**
   - Klick im Auswahlmodus hebt das Element mit Cyan-Kontur hervor und zeigt ID und Typ im Badge an.
   - Eigenschaften wie das Straßenprofil oder der Flächentyp können direkt angepasst werden.
   - Geometrien können per Button *Löschen* oder `Entf`/`Backspace`-Taste entfernt werden (vollständig in den Undo-Stack integriert).
5. **Erweiterter Browser-Smoke-Test:**
   - `scripts/browser-smoke.mjs` testet nun auch die World-Model-Ansicht (`/?view=world`) und prüft Canvas, DOM-Status und Screenshot (`browser-smoke-world-view.png`).
