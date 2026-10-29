# KLEIN BERLIN Hybrid Engine V1.4 — World-Model-Editor

**Stand:** 28. Oktober 2026  
**Ziel:** Erste editierbare Vektorgeometrie direkt in der World-Model-Ansicht, ohne die bestehenden Bahnhofsszenen zu ersetzen.

## Bedienung

1. Projekt mit `npm ci` installieren und per `npm run dev` starten.
2. `http://localhost:5173/?view=world` öffnen.
3. Oben **Bearbeiten** aktivieren.
4. Ein Werkzeug wählen:
   - **Auswahl:** Klick zeigt Modul und lokale Meterkoordinate; Ziehen verschiebt die Kamera.
   - **Straße zeichnen:** zwei Klicks im selben Modul erzeugen eine Straßen-Mittellinie (8 m Breite).
   - **Fläche zeichnen:** zwei gegenüberliegende Ecken erzeugen ein Rechteck vom gewählten Typ (Park, Platz, Grundstück, begehbare Fläche oder Kollisionsfläche).
   - **Gebäudegrundriss:** ein Klick erzeugt einen 18 × 14 m großen Gebäudegrundriss um den Klickpunkt.
5. **Rückgängig** stellt die Geometrien vor der letzten Editieraktion wieder her.
6. **JSON exportieren** lädt `klein-berlin-world-draft.json` herunter.

## Daten und Speicherung

- Alle neuen Geometrien verwenden Modul-Lokal-Koordinaten in Metern und die bestehende Schema-Version 1.
- IDs werden aus der Modul-ID und einer kollisionsfreien Sequenz gebildet.
- Der Draft wird nach jeder Änderung in `localStorage` unter einem projektspezifischen Schlüssel gespeichert und beim nächsten Öffnen desselben Projekts geladen.
- Exportformat: `klein-berlin-world-draft`, `formatVersion: 1`, mit `projectId`, `worldId` und vollständigen Moduldokumenten.
- Der Draft ist ein editierbares Zwischenaustauschpaket. V1.4 schreibt keine Dateien direkt in den Projektordner und bietet noch keinen Importdialog für die heruntergeladene Draft-Datei.

## Aktuelle Grenzen

- Straßen werden als Mittellinien mit semantischer Breite gespeichert; die abgeleitete physische Straßenfläche und automatische Navigations-/Kollisionsaktualisierung kommen später.
- Flächenwerkzeuge erzeugen Rechtecke, keine frei gezeichneten Mehrpunkt-Polygone.
- Gebäudegrundrisse sind Geometrie-Platzhalter; sie erzeugen noch keine Asset-Instanz und keine Fassade.
- Auswahl zeigt aktuell Koordinaten, aber unterstützt noch kein Verschieben, Rotieren oder Löschen ausgewählter Features.
- Referenzbild-Import und Maßstabskalibrierung sowie Asset-Browser/Drag-and-drop sind nicht enthalten.
- Der Browser-Lauf mit echtem Phaser bleibt blockiert, solange `npm ci` die externen Pakete nicht von der npm-Registry beziehen kann (`EAI_AGAIN`).

## Quality Gates in dieser Arbeitsumgebung

| Prüfung | Ergebnis |
|---|---|
| Node-Testlauf | 72/72 bestanden; auch nach Entpacken des Release-ZIP erneut ausgeführt |
| Bestandsprojekt-Validierung | Bestanden |
| Importgraph-Validierung | Bestanden |
| World-Model-Validierung | Bestanden, auch nach Entpacken des Release-ZIP |
| Strict TypeScript für WorldModel, WorldDraft und WorldEditorModel | Bestanden |
| TypeScript-Integration von WorldPreviewRuntime / WorldPreviewScene mit temporärem Phaser-API-Shim | Bestanden; kein Ersatz für offizielle Phaser-Typen |
| Vollständiger Build mit Phaser 3.90 / Vite | Blockiert: Abhängigkeiten nicht verfügbar |
| Tatsächlicher Phaser-Browser-Smoke | Nicht ausgeführt |

## Visual-QA-Dateien

- `docs/qa/world-model-view.png` — Weltansicht mit den zwei vorhandenen Modulen.
- `docs/qa/world-editor-tools.png` — Werkzeugpanel mit aktivem Straßenwerkzeug und gesetztem Startpunkt.
- `docs/qa/world-editor-draft-example.png` — illustrative Darstellung zusätzlicher Straßen-, Flächen- und Gebäudegrundriss-Geometrien.
- `docs/qa/world-editor-capture.html` — selbstständige Canvas-Vorschau auf Basis eingebetteter World-Model-Daten.
- `scripts/generate-world-editor-screenshots.py` — reproduziert die drei PNG-Vorschauen direkt aus den gespeicherten Projekt-JSON-Daten.

Die drei PNGs wurden vom deterministischen Visual-QA-Renderer erzeugt und sind **keine Screenshots eines laufenden Phaser-Builds**. Sie dienen der visuellen Prüfung des Datenmodells und der geplanten Editor-Oberfläche, solange ein echter Browserlauf nicht verfügbar ist.
