# KLEIN BERLIN World Model V1

**Status:** Versioniertes Datenmodell und Validator. Seit V1.3 ist der World Model Core an einen ersten separaten Phaser-Renderer angeschlossen. Der grafische Stadtbau-Editor ist noch nicht implementiert.

## Warum diese Ebene eingeführt wird

`SceneManifest` beschreibt eine ladbare Laufzeitszene, zum Beispiel eine der vorhandenen Bahnhofsebenen. `WorldDocument` beschreibt dagegen eine zusammenhängende Stadt, die mehrere Stadtteile und Module enthält. Ein `ModuleDocument` ist eine bearbeitbare räumliche Einheit. Die Welt ordnet Module räumlich an; sie kopiert keine vollständigen Modul-Inhalte in den Weltindex.

## Dateien des Beispielprojekts

- `public/data/worlds/klein-berlin/project.json` – Engine-Projektmanifest und Pfade zu Weltindex und Asset-Katalog.
- `public/data/worlds/klein-berlin/world-index.json` – ein Stadtteil mit zwei angrenzenden Testmodulen.
- `public/data/worlds/klein-berlin/modules/innenstadt-west.json` – erstes Modul mit einer Straßenmittellinie, Platz und Fußabdruck.
- `public/data/worlds/klein-berlin/modules/innenstadt-ost.json` – zweites Modul mit Straßenmittellinie und Parkfläche.
- `public/data/worlds/klein-berlin/asset-catalog.json` – derzeit leerer Katalog. Noch werden keine neuen Assets vorgetäuscht oder aus fachfremden Bildern zusammengesetzt.

Alle Dateipfade in den JSON-Dokumenten sind relativ zum `public/`-Verzeichnis der Runtime und werden vor der Verwendung geprüft.

## Koordinatenkonvention

- `x` nimmt nach Osten zu.
- `y` nimmt nach Süden zu.
- `z` ist die Höhenposition in Metern.
- Modul-Geometrien nutzen `module-local-meters`.
- Der Weltindex legt jedes Modul per `originMeters` und `rotationDegrees` fest.
- In V1 sind Rotationen auf 0°, 90°, 180° und 270° begrenzt, um reproduzierbare orthogonale Modulgrenzen zu garantieren.
- Legacy-Stage-Pixel aus bestehenden Bahnhofsbildern bleiben ein eigener Raum und werden nicht stillschweigend als Weltmeter interpretiert.

## Schema-Bausteine

- `ProjectManifest`: Einheiten, Projektion, Pixelmaß, Referenzzellenmaß und relative Dokumentpfade.
- `WorldDocument`: Stadt-ID und Stadtteile.
- `WorldModuleReference`: Modul-ID, Dokumentpfad, Weltursprung, Rotation und Bounds.
- `ModuleDocument`: Ebenen, Layer, Referenzbilder, Tiled-Quellen, freie Geometrie, Asset-Instanzen und Anschlüsse.
- `GeometryFeature`: typisierte Linie oder Polygon in Metern.
- `AssetDefinition` / `AssetInstance`: getrennte Beschreibung eines wiederverwendbaren Assets und seiner Platzierung.
- `ConnectorEndpoint`: semantischer, gerichteter Anschluss mit Typ, Breite, Höhe und optionalem Gegenstück.

## Validator

`npm run validate` führt zusätzlich `scripts/validate-world-project.mjs` aus. Der Validator prüft:

- unterstützte Schema-Versionen und Pflichtfelder;
- eindeutige IDs;
- positive Modul-Bounds und gültige Höhenebenen;
- Layer-Typen und Layer-Referenzen von Tilemaps;
- endliche Koordinaten und Mindestanzahl von Punkten pro Linie/Polygonring;
- relative, nicht-traversierende Pfade;
- Asset-Referenzen;
- bidirektionale Modulanschlüsse einschließlich Typ, Weltposition, Richtung und Breite;
- dass referenzierte Module im Weltindex verankert und nicht als unverbundene Dateien verwaist sind.

Die Prüftoleranz für den gemeinsamen Anschluss-Weltpunkt beträgt 0,01 Meter. Richtungen müssen entgegengesetzt sein (maximal 1 Grad Abweichung von exakt 180 Grad), Anschlussbreiten weichen höchstens 0,01 Meter voneinander ab.

## Abgrenzung des aktuellen Implementierungsstands

Bereits implementiert sind die Datenverträge, Laufzeitprüfungen, Koordinatenumrechnung zwischen Modul und Welt, ein Beispielprojekt mit zwei verbundenen Modulen und eine separate Vorschau-Runtime. Der Vorschau-Renderer zeichnet Modulflächen, Raster, Straßen-/Wege-Linien, Platz-/Park-/Gebäudegrundrisse, Anschlussmarker und katalogisierte Asset-Instanzen. Noch nicht implementiert sind grafischer Editor, Undo/Redo, Maßstabskalibrierung für Referenzbilder, Tiled-Editor-Integration, Straßenflächen-Extrusion, Asset-Browser und das Ableiten von Navigation/Kollision aus dem neuen World Model. Diese Funktionen gehören in nachfolgende Entwicklungsphasen.

## Quality Gates

```bash
npm test
npm run validate
npm run typecheck:navigation
```

Der vollständige Phaser-/Vite-Build und Browser-Smoke benötigen die installierten Abhängigkeiten. Die V1.3-World-Preview-Ansicht wird über `?view=world` gestartet. Bestehende Bahnhofsszenen und deren Referenzdaten bleiben additiv unverändert.
