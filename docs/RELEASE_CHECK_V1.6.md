# Release-Check — KLEIN BERLIN Hybrid Engine V1.6

**Datum:** 29. Oktober 2026  
**Meilenstein:** V1.6.0 — Asset-Katalog & Stamp-Platzierung, Referenzbild-Tracing & Vertex-Editing

## 1. Prüfergebnisse der Quality Gates

| Quality Gate | Ergebnis | Beleg |
|---|---|---|
| **Automatisierte Unit-Tests** | **PASS** | `90 / 90 Tests bestanden` (inkl. neuer Suiten für 2-Punkt-Referenzbild-Kalibrierung, Asset-Stamp-Platzierung, 90°-Drehung, Vertex-Handle-Erkennung und Draft-Roundtrips) |
| **Projekt- & Datenvalidierung** | **PASS** | `npm run validate` (Bestandsprojekt, Source-Graph mit 51 Dateien/178 Imports, World-Model mit 6 validierten Assets) |
| **Isolierter Navigation-Typecheck** | **PASS** | `npm run typecheck:navigation` (`tsc -p tsconfig.navigation.json`) ohne Fehler |
| **Vollständiger TypeScript Typecheck** | **PASS** | `npm run typecheck` (`tsc --noEmit`) ohne Fehler |
| **Vollständiger Produktionsbuild** | **PASS** | `npm run build` erzeugt optimiertes Vite-Bundle in 15.4 s |
| **Chromium Browser-Smoke** | **PASS** | 4/4 Szenen erfolgreich im Headless-Chromium verifiziert: Desktop, Mobile, Tiled-Render-QA und World-Model V1.6 (`docs/qa/browser-smoke-world-view.png`) |
| **Gesamter Release-Check** | **PASS** | `node scripts/release-check.mjs` schließt mit Exit-Code 0 ab (alle 5 Gates grün) |

---

## 2. In V1.6 neu implementiert

1. **Asset-Katalog-Population (`public/data/worlds/klein-berlin/asset-catalog.json`):**
   - 6 verifizierte Berliner Kiez- und Bahnhofs-Assets mit metrischen Footprints, 2:1-Isometrie-Projektion und Tiefensortierung eingepflegt:
     - `bench-wood`: Kiez-Holzbank (2,2 × 0,8 m, Footline-Tiefe 0,8 m)
     - `ticket-red`: BVG Ticketautomat (1,0 × 0,9 m, Kollision aktiv)
     - `info-rondell`: DB Info-Rondell (2,8 × 2,8 m, zylindrischer 3D-Kollisionskörper)
     - `depboard`: Bahnhof-Abfahrtstafel (3,2 × 0,6 m)
     - `glass-lift`: Glasaufzug (2,4 × 2,4 m, transluzenter Schacht)
     - `facade-wall`: Gründerzeit-Fassadenelement (10,0 × 1,2 m, Höhe 16 m)
   - Vollständig validiert über das statische Prüfprotokoll `scripts/validate-world-project.mjs`.

2. **Interaktives Requisiten-Stempel-Werkzeug (Asset-Stamp):**
   - Neuer Modus `asset` im World-Editor (`data-editor-tool="asset"`).
   - Dropdown `#world-asset-kind` zur direkten Auswahl der aktiven Requisite.
   - Klick auf die Karte erzeugt eine neue Instanz (`createAssetInstance`) mit fortlaufender ID (`module-entity-XXX`), Tiefenpositionierung und automatischer Anbindung an die Bodenebene.
   - Undo/Redo (`undoLastEdit`) sichert und restauriert Entitätslisten parallel zu Geometrien.

3. **Requisiten-Inspektion, Rotation & Löschen:**
   - Klick im Auswahlmodus selektiert platzierte Requisiten und visualisiert deren Standpunkt mit einem Cyan-Leuchtring (`#38bdf8`).
   - Drehung im 90°-Raster (`rotateSelectedEntity`) über den Toolbar-Button *Drehen 90°* (`#btn-world-rotate`) oder per Tastatur-Shortcut `R`/`r`.
   - Löschen (`deleteSelectedEntity`) per Button *Löschen* (`#btn-world-delete`) oder Taste `Entf`/`Backspace`.
   - Nahtloser Export im `WorldDraftBundle` und CLI-Writeback via `npm run apply-draft`.

4. **Vertex-Editing (Drag-Handles):**
   - Wenn eine Geometrie (Straßenlinie oder Polygon-Fläche) ausgewählt ist, werden an allen Eckpunkten interaktive Griffe (`drawVertexHandles`) gerendert.
   - Direkte Manipulation per Maus-Drag: Klick auf einen Griff verschiebt den Vertex punktgenau im metrischen Raum in Echtzeit.
   - Alle Drag-Aktionen werden im Undo-Stack gesichert und triggern das automatische Speichern des Drafts im Browser.

5. **2-Punkt-Referenzbild-Kalibrierung & Overlay (`src/importers/reference-image/ReferenceImageCalibration.ts`):**
   - Mathematischer Kalibrierungsdienst: Berechnet aus zwei bekannten Bildpunkten und einer Realwelt-Distanz (z. B. 100 m Straßenbreite) den pixelgenauen Maßstab (`metersPerPixel`), Versatz und Koordinaten-Roundtrips.
   - Referenzbild-Projektion auf der Kartenebene (`drawReferenceImages`) mit konfigurierbarer Deckkraft (`opacity`) zur Vorlagen-basierten Vektorisierung.
   - Umschaltbar über den Toolbar-Button *Vorlage AN/AUS* (`#btn-ref-toggle`).
