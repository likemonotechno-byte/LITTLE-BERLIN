# KLEIN BERLIN Hybrid Engine V1.4

**Status:** Die vier produktiven Bahnhof-Szenen bleiben erhalten. V1.4 ergänzt erste editierbare Stadtgeometrie im World-Model-Modus: Straßen zeichnen, rechteckige Flächen und Gebäudegrundrisse anlegen, letzte Änderung rückgängig machen, Entwurf lokal speichern und als JSON exportieren. Der V1.3-Renderer bleibt die Darstellungsschicht; Referenzbild-Kalibrierung, Asset-Drag-and-drop und vollständiges Auswahl-/Transformationswerkzeug folgen später. CON-01 verwendet weiterhin seine Tiled-Objekt-Layer als maßgebliche Navigationsquelle; die vorhandene Render-QA-Demo bleibt außerhalb des Produktionsindex.

## Lokal starten

Voraussetzungen: Node.js 22.6+, npm und Chromium/Chrome für Browser-QA.

```bash
npm ci
npm run dev
```

Standardansicht: vier Bahnhofsebenen. World-Model-Vorschau: `http://localhost:5173/?view=world`. Isolierte Render-QA-Demo: `http://localhost:5173/?qa=tiled-render`. In der World-Model-Vorschau verschiebt Ziehen die Karte, Scrollen zoomt; Buttons schalten Raster, Geometrien und Anschlüsse um.

## V1.4 — Erste editierbare World-Model-Geometrie

- `src/world/WorldEditorModel.ts` erzeugt validierbare Straßen-Mittellinien, rechteckige Park-/Platz-/Grundstücksflächen und Gebäudegrundrisse in Modul-Metern. IDs werden kollisionsfrei generiert.
- `src/world/WorldPreviewScene.ts` ergänzt einen Bearbeitungsmodus mit Werkzeugen für Auswahl/Koordinatenanzeige, Straße, Fläche und Gebäudegrundriss. Straßen/Flächen werden durch zwei Klicks innerhalb desselben Moduls erstellt; Gebäudegrundrisse werden um den Klickpunkt platziert.
- `src/world/WorldDraft.ts` definiert einen versionierten JSON-Draft-Bundle-Vertrag. Der Browser speichert neue Geometrien automatisch in `localStorage`; `JSON exportieren` erzeugt eine Datei `klein-berlin-world-draft.json`, und vorhandene Browser-Entwürfe werden beim erneuten Öffnen derselben Welt angewendet.
- `Rückgängig` stellt den Geometrie-Snapshot vor der letzten Änderung wieder her. Der Export ist ein Entwurfspaket und ersetzt noch nicht die einzelnen Projektdateien; ein vollständiger Projekt-Reimport folgt in einer späteren Stufe.
- `tests/world-editor.test.mjs` und `tests/world-draft.test.mjs` prüfen Geometrieerzeugung, Größenvalidierung, IDs, Formatversion, Projektbindung, Modulbindung und Wiederherstellung gespeicherter Entwürfe.
- Visual-QA-Capture-Artefakte: `docs/qa/world-model-view.png`, `docs/qa/world-editor-tools.png` und `docs/qa/world-editor-draft-example.png`. Sie werden mit `scripts/generate-world-editor-screenshots.py` reproduzierbar aus dem aktuellen World-Model-Testdatensatz erzeugt. Es sind Design-/Datenvorschauen, kein Ersatz für den blockierten Phaser-Browser-Smoke; `docs/qa/world-editor-capture.html` bietet zusätzlich einen unabhängigen visuellen HTML-Prototyp.

## V1.3 — World-Model-Renderer und Vorschau

- `src/world/IsoProjector.ts` projiziert Meterkoordinaten in die dimetrische 2:1-Ansicht und bietet eine inverse Bildschirm-zu-Welt-Transformation. Modulrotationen und Weltursprünge werden über den bestehenden Koordinatenvertrag berücksichtigt.
- `src/world/WorldPreviewScene.ts` zeichnet Modulflächen, Raster, Straßen, Plätze, Parks, Gebäudegrundrisse, Anschlussmarker und vorhandene Asset-Instanzen in einer separaten Phaser-Szene.
- `src/world/WorldPreviewRuntime.ts` lädt und validiert das World Model, bevor es die Vorschau startet. Die Szene wird über `?view=world` aufgerufen; die bestehende Bahnhofsruntime bleibt der Standardmodus.
- Die Vorschau bietet automatisches Zentrieren, Zoom, Verschieben, Raster-/Geometrie-/Connector-Toggles und eine Statuszeile mit der Weltposition des angeklickten Punktes.
- `tests/iso-projector.test.mjs` ergänzt fünf Tests für Projektion, inverse Transformation, Modulrotation, projizierte Bounds und ungültige Parameter.
- `npm test`: 62/62 Tests bestanden. `npm run validate`: bestanden. Der strikte Einzeldatei-Typecheck des reinen Projektors besteht ebenfalls. Der Gesamt-Typecheck und Browser-Smoke bleiben blockiert, solange Phaser 3.90.0 wegen nicht erreichbarer npm-Registry in der Laufzeitumgebung nicht installiert werden kann.

Technische Details: [`docs/WORLD_PREVIEW_V1.3.md`](docs/WORLD_PREVIEW_V1.3.md).

## V1.2 — World Model und Modulverträge (Grundlage)

- `src/world/WorldModel.ts` enthält versionierte Verträge für Projektmanifest, Weltindex, Stadtteilmodule, Layer, freie Geometrie, Asset-Katalog, Asset-Instanzen und semantische Anschlüsse.
- `src/world/WorldProjectLoader.ts` lädt das Weltprojekt über einen injizierten JSON-Reader und bietet zusätzlich einen Browser-Fetch-Adapter.
- Modulkoordinaten werden getrennt von Weltpositionen gespeichert; `moduleLocalToWorld` und `worldToModuleLocal` unterstützen 0°, 90°, 180° und 270° und berücksichtigen Z-Höhen.
- `public/data/worlds/klein-berlin/` enthält eine minimale Testwelt mit zwei 100×100-m-Modulen und einem bidirektional validierten Straßenanschluss.
- `npm run validate` prüft World-Model-Schemas, Geometrieformen, Pfade, Asset-Referenzen, Bounds und Anschluss-Konsistenz.
- Die neue World-Model-Schicht ist additiv. Sie ersetzt nicht die bestehenden Szenen; die Testwelt wird separat über den World-Preview-Modus gerendert.

Details: [`docs/WORLD_MODEL_V1.md`](docs/WORLD_MODEL_V1.md).

## V1.0 — Tile-Depth und Roof-Cutaway

- Tiled-Layer mit `renderRole=foreground|roof|canopy|upper-front|actor-sort|occluder`, `depthSortTiles=true` oder bekanntem Foreground-Layernamen werden in einzelne Sprites geteilt, damit jedes Tile individuell gegen Spieler und Foreground-Slices sortiert werden kann.
- Base/Ground-Layer bleiben native gebatchte `TilemapLayer`s.
- Atlas-Frames werden über globalen GID, `firstgid` und Tilecount bestimmt; Tiled-Flip-Flags/Rotation, Tileset-Offsets, Layer-Offsets und Opazität werden soweit vom Phaser-Tileobjekt verfügbar übertragen.
- `cutawayEnabled=true` aktiviert die weiche Radialmaske im WebGL-PostFX-Pipeline. Einstellbar über `cutawayFadeStartPx`, `cutawayFadeEndPx`, `cutawayMinAlpha`. Der Effekt greift nur bei einer Figur hinter dem Objekt-Fußpunkt. Canvas-Renderer nutzt den bestehenden Alpha-Fade-Fallback.
- Das `TILED-NAV-DEMO` hat einen echten 2×2-Roof-Layer mit Atlaszellen. Es ist nicht in `scene-index.json`, sondern nur im QA-Index.
- `npm run qa:browser` prüft Desktop, Mobile und die isolierte Render-QA-Szene und legt bei erfolgreichem Lauf drei Screenshots unter `docs/qa/` ab.

Technische Details: [`docs/RENDERING_V1.md`](docs/RENDERING_V1.md).

## Quality Gates

```bash
npm test
npm run validate
npm run typecheck:navigation
npm run typecheck
npm run build
npm run qa:browser
npm run release-check
```

V1.4-Stand: 72/72 Tests bestanden (Offline-Testlauf). `npm run validate` prüft nun zusätzlich das World Model und dessen Modulanschlüsse; `npm run typecheck:navigation` umfasst `WorldModel.ts` und `WorldProjectLoader.ts`. Der vollständige Phaser-/Vite-Typecheck und Browserlauf sind nicht bestätigt: `npm ci` konnte wegen `EAI_AGAIN` beim Zugriff auf die npm-Registry nicht abgeschlossen werden. Ein erfolgreicher Offline-Kerncheck wird nicht als erfolgreicher Produktionsbuild ausgegeben.

## Steuerung

- **WASD / Pfeiltasten:** bewegen
- **Klick / Tap auf begehbaren Boden:** Wegziel setzen
- **E / Interaktionsknopf:** Interaktion oder Verbindung auslösen
- **TAB / Geometrieknopf:** NavMesh, Hindernisse, Connectoren zeigen/verbergen
- **Hotspots:** Interaktionsradien zeigen/verbergen
- **Cutaway AN/AUS:** Dach-/Foreground-Cutaway aktivieren oder deaktivieren
- **Zentrieren / + / −:** Kamera bedienen
- **Touch-D-Pad:** gedrückt halten für acht Richtungen

## Bewahrte Produktionsdaten

- `public/data/scene-index.json`: vier Bestandskarten (CON-01, EXT-00, RAIL-02, UG-03).
- `public/data/maps/CON-01.tiled.json`: autoritative Navigation für CON-01; weiterhin auf den alten Stand mit weniger als 0,01 Stage-Pixel abgleichbar.
- `public/data/navmeshes/*.json`: vorhandene NavMesh-Baselines als Vergleichsdaten.
- `public/assets/stages/`: vier Original-Stage-Bilder; `public/assets/slices/`: zehn CON-01-Foreground-Slices.
- Register: 17 Connectoren, 23 Asset-Metadatensätze, vier Trace-Szenen.
- `legacy/v0.3-reference.html`: unveränderte Referenz.

## Render-QA getrennt von Produktionskarten

`public/data/qa-scene-index.json` führt ausschließlich `TILED-NAV-DEMO`. Die Karte dient zur Prüfung der einzelnen Tile-Sprites, Fußlinien-Sortierung und radialen Dachtransparenz. Der enthaltene Roof-Atlas ist Test-/Engineering-Art und ersetzt keine finalen Bahnhof-Assets.

## V1.1 — Release-QA gehärtet

- `renderRole=always-front` wird jetzt als Actor-Depth-Layer erkannt und über die vorhandene Always-Front-Logik behandelt.
- Browser-Smoke entfernt alte QA-Screenshots vor einem frischen Lauf, verwendet die aufgelöste URL und prüft die Aufrufkonvention per Regressionstest, damit veraltete Dateien oder undefinierte URLs keinen Scheinerfolg erzeugen.
- `npm run validate` prüft jetzt auch den lokalen statischen Importgraphen und nicht deklarierte externe Pakete.
- `npm run release-check` bündelt alle offline ausführbaren Quality Gates und meldet fehlende Phaser-/Vite-Abhängigkeiten als blockiertes Build-Gate (Exit-Code 2), statt einen erfolgreichen Build zu suggerieren.
- `package-lock.json` ist vorhanden. Eine saubere Installation mit `npm ci` muss in einer Umgebung mit erreichbarer npm-Registry verifiziert werden.

## Noch offen

1. Vollständigen Build und Browserlauf ausführen, sobald Phaser 3.90.0, Vite 6.3.5 und TypeScript 5.8.3 erfolgreich installiert sind.
2. Die tatsächliche Phaser-Positionierung der einzelnen Tiled-Sprites und Radialshader-Cutaway visuell im Browser freigeben.
3. Performancegrenzen für große Foreground-Layer messen; große Stadt-Ground-Layer bleiben gebatcht und sollen nicht in einzelne Sprites konvertiert werden.
4. Später zusätzliche Multi-Tier-Silhouetten, Tür-/Dach-Cutaway-Varianten, Persistenz, Dialoge, Audio und native Verpackung ergänzen.
