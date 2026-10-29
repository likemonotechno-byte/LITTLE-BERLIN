# KLEIN BERLIN – Hybrid-Engine für eine erweiterbare Isometrie-Stadt

**Planversion:** 1.0  
**Planungsstand:** 28.10.2026  
**Ausgangsbasis:** `Archiv.zip`, KLEIN BERLIN Engine V1.1  
**Ziel:** Den bestehenden isometrischen Bahnhof-/Szenen-Prototypen schrittweise zu einer datengetriebenen Stadtbau- und Laufzeit-Engine erweitern, in der neue Stadtteile durch Zeichnen, Referenzbilder, Tilemaps und wiederverwendbare Assets entstehen können.

---

## 1. Zusammenfassung und Empfehlung

KLEIN BERLIN soll eine **Hybrid-Engine aus Raster, freier Geometrie, modularen Assets und importierbaren Tilemaps** werden. Sie soll nicht verlangen, dass jeder neue Stadtteil als eigene, individuell programmierte Szene erstellt wird.

Die zentrale Architekturentscheidung lautet:

> **Die Stadt ist ein versioniertes Datenprojekt. Der Renderer, die Navigation und der Editor sind Werkzeuge, die dasselbe Stadtmodell lesen und verändern.**

Eine Welt besteht aus Stadtteilen und räumlichen Modulen. Ein Modul kann Tile-Layer, frei gezeichnete Straßen und Flächen, Asset-Instanzen, Höhenebenen, Navigation und Anschlüsse enthalten. Ein Editor konvertiert unterschiedliche Eingabewege in dieses gemeinsame Modell.

### Empfohlene Ziele

1. **Bestehende Bahnhofsszenen erhalten.** CON-01, EXT-00, RAIL-02 und UG-03 werden nicht im ersten Schritt neu gebaut.
2. **Neue Stadtteile ohne neue Programmierung erzeugen.** Ein Modul wird durch Daten beschrieben, nicht durch eine eigene Sonderimplementierung.
3. **Raster und freie Geometrie kombinieren.** Raster dienen Maßen und Tiles; Straßen, Grundstücke, Plätze, Wasserläufe und Gebäudeumrisse können frei gezeichnet werden.
4. **Mehrere Eingabewege unterstützen.** Zeichnen, Referenzbild nachzeichnen, Tiled importieren, Assets platzieren und später assistierte Erkennung.
5. **Weltkoordinaten verbindlich machen.** Spielobjekte, Geometrie, Anschlüsse und Navigationsdaten müssen dasselbe metrische Koordinatensystem verwenden.
6. **Daten automatisch prüfen und ableiten.** Kollisionen, begehbare Flächen, Tiefensortierung und Anschlussdiagnosen sollen wo möglich aus denselben Quelldaten generiert werden.
7. **Schrittweise statt als Rewrite entwickeln.** Der bestehende Runtime-Kern bleibt funktionsfähig und wird über Adapter erweitert.

### Was ausdrücklich nicht der erste Schritt ist

- keine automatische KI-Vollgenerierung einer ganzen Stadt;
- kein kompletter Neuaufbau des Bahnhofskomplexes;
- keine sofortige Simulation von Verkehr, Wirtschaft oder großen NPC-Mengen;
- kein Wechsel der Engine oder des Frameworks allein um des Wechsels willen;
- keine Entfernung funktionierender Daten, bevor Abhängigkeiten und Ersatz geprüft sind.

---

## 2. Bestandsaufnahme des vorhandenen Projekts

Die folgenden Punkte wurden direkt am Inhalt von `Archiv.zip` geprüft.

### 2.1 Bereits vorhandene Grundlagen

| Bereich | Aktueller Stand | Konsequenz für den Plan |
|---|---|---|
| Runtime | Phaser 3.90, TypeScript, Vite | Vorhandenen Stack beibehalten und Editor darin ergänzen |
| Szenenverwaltung | `SceneManifest`, `SceneManifestLoader`, `SceneRuntime`; vier produktive Szenen über `scene-index.json` | Vorhandenes Manifest-System als Legacy-/Runtime-Adapter weiterverwenden |
| Isometrie | `UniversalIsoMath` für `dimetric-2-to-1` | Als Grundlage nutzen, aber um eine klar definierte 3D-/Höhen-API erweitern |
| Legacy-Bilder | `pre-rendered-stage` mit kalibrierten Stage-Pixeln | Bestehende Bilder nicht fälschlich als frei projizierte Welt behandeln |
| Tilemaps | `TiledJsonImporter`, aktuell begrenzte isometrische JSON-Maps | Tiled für Tilemap-Arbeit nutzen; Importgrenzen planvoll erweitern |
| Navigation | `PolygonNavMesh`, `TiledNavigationExtractor` | Bestehende Kollision und Navigation mit dem Weltmodell verbinden |
| Rendering | `MultiTierDepthSorter`, per-Tile Depth, Cutaway | Für neue Assets und Module wiederverwenden und entkoppeln |
| Assets | 23 Einträge im Asset-Register; Stage-Bilder und Slices vorhanden | Aus dem Register eine typisierte Asset-Bibliothek entwickeln |
| Verbindungen | Connector-Register mit 17 Einträgen | Als Ausgangspunkt für einen Welt-/Level-Verbindungsgraph verwenden |
| Tests | 46 Tests bestehen | Vor jeder Erweiterung Regressionstests beibehalten und ausbauen |

### 2.2 Verifizierte Qualitätslage

Bei dieser Prüfung liefen erfolgreich:

- `node --experimental-strip-types --test tests/*.test.mjs` – 46 von 46 Tests bestanden;
- `node --experimental-strip-types scripts/validate-project.mjs` – statische Projekt- und Datenprüfung bestanden;
- `node scripts/validate-source-graph.mjs` – lokale Importgraph-Prüfung bestanden;
- `npm run typecheck:navigation` – bestanden.

Der vollständige Phaser-/Vite-Build und ein frischer Browser-Smoke-Lauf sind in dieser Arbeitsumgebung nicht verifiziert, weil `node_modules` fehlt. Das ist ein offenes Release-Gate, kein nachgewiesener Laufzeitfehler.

**Dokumentationsabweichung:** `package-lock.json` liegt im Archiv vor, obwohl README und Release-Bericht behaupten, es fehle. Diese Aussage muss in Phase 0 korrigiert und danach gegen den tatsächlichen Build-Stand geprüft werden.

### 2.3 Die wichtigsten architektonischen Grenzen

1. **Noch kein Stadtmodell:** Der Runtime-Index registriert Szenen, aber keine hierarchische Stadt aus Regionen, Stadtteilen und räumlichen Modulen.
2. **Noch kein Editor:** Es gibt keine vollständige Oberfläche zum Zeichnen, Platzieren, Importieren, Speichern, Rückgängigmachen und Prüfen von Stadtgeometrie.
3. **Zwei Koordinatenräume:** Neue projizierte Szenen verwenden Weltmeter; ältere Szenen verwenden kalibrierte Bild-/Stage-Pixel. Diese Trennung ist sinnvoll und muss explizit erhalten bleiben.
4. **Tiled ist noch kein unendliches Weltformat:** Der aktuelle Importer lehnt unendliche Tiled-Maps mit `chunks`, komprimierte/Base64-Layer und Image-Collection-Tilesets ab. Die erste Stadt-Engine sollte daher eigene räumliche Module verwalten und diese mit einzelnen begrenzten Tilemaps kombinieren.
5. **Höhenmodell ist noch teilweise stufenbasiert:** `UniversalIsoMath` projiziert aktuell x/y in Metern und berücksichtigt eine diskrete Tier-Verschiebung in Pixeln. Für frei kombinierbare Weltmodule braucht es zusätzlich eine explizite, getestete Höhen-/z-Koordinate.
6. **Rendering und Spielszene sind eng gekoppelt:** `GameScene.ts` ist groß und enthält zahlreiche Aufgaben. Neue Editor-Funktionen dürfen nicht einfach sämtliche Editorlogik dort hineinwachsen lassen.
7. **Assets sind überwiegend visuelle Dateien plus Metadaten:** Für automatisierte Platzierung braucht jedes verwendbare Asset standardisierte Angaben zu Maßstab, Ankerpunkt, Grundfläche, Höhe, Kollision und Darstellung.

---

## 3. Produktdefinition und Erfolgskriterien

### 3.1 Das Produkt

KLEIN BERLIN besteht langfristig aus drei zusammengehörigen Teilen:

- **Editor:** Weltkarte und Stadtteile erstellen, zeichnen, importieren, platzieren, validieren und speichern.
- **Engine-Runtime:** Dieselben Daten als spielbare isometrische Welt rendern, Navigation und Kollision berechnen und Übergänge ausführen.
- **Asset-Werkzeugkette:** Grafiken importieren, zuschneiden/registrieren, mit Metadaten versehen, Varianten verwalten und wiederverwenden.

### 3.2 Erfolg in der ersten auslieferbaren Editor-Version

Die erste brauchbare Version ist erreicht, wenn ein Nutzer ohne Änderung am TypeScript-Code:

1. ein neues Stadtprojekt erzeugen kann;
2. ein Raster und eine reale Maßeinheit einstellen kann;
3. ein Referenzbild importieren, skalieren und als Vorlage verwenden kann;
4. Straßen und Flächen frei einzeichnen kann;
5. Assets aus einer Bibliothek platzieren kann;
6. eine begrenzte Tiled-JSON-Karte importieren kann;
7. diese Inhalte als Stadtmodul speichern kann;
8. ein zweites Modul neben das erste setzen und einen Anschluss definieren kann;
9. die Module als gemeinsame Welt laden kann;
10. die Karte validieren und durch einen Test-Avatar begehen kann;
11. das Projekt exportieren und in einer frischen Sitzung wieder importieren kann.

### 3.3 Langfristige Erfolgskriterien

- Mehrere Stadtteile sind über eine gemeinsame Weltkarte verbunden.
- Einzelne Module können unabhängig bearbeitet und geladen werden.
- Änderungen an einem Asset lassen sich nachvollziehbar auf alle Verwendungen anwenden.
- Ein Gebäude oder Tile wird nicht für jeden Stadtteil neu angelegt.
- Geometrie und Spielphysik können auf dieselben Maße und dieselben Daten zurückgreifen.
- Bildreferenzen bleiben Editorquellen und werden nicht versehentlich als finale Spielgrafiken behandelt.
- Gültige ältere Szenen funktionieren weiter, bis sie bewusst auf das neue Format migriert wurden.

---

## 4. Verbindliche Architekturentscheidungen

### ADR-H01 – Hybrid statt Raster-only

**Entscheidung:** Raster und freie Geometrie werden gleichberechtigte, kombinierbare Arbeitsmittel.

- Raster sind für Tilemaps, Ausrichtung, Messung und regelmäßige Elemente zuständig.
- Vektor-/Polygongeometrie ist für Straßenverläufe, Grundstücke, Plätze, Flüsse, Gehwege und freie Grundrisse zuständig.
- Sprite-/Objekt-Assets sind für konkrete Gebäude, Bäume, Fahrzeuge und Ausstattung zuständig.
- Vorgerenderte Bilder bleiben für Referenzansichten oder ausdrücklich kalibrierte Bühnen zulässig.

### ADR-H02 – Metrische Weltkoordinaten sind die kanonische Quelle

Neue Weltobjekte erhalten Koordinaten in Metern und eine Höhenposition. Pixelpositionen werden durch einen Projektionsadapter berechnet und nicht als maßgebliche Weltposition gespeichert.

Vorgeschlagener Weltpunkt:

```ts
interface WorldPoint3 {
  xMeters: number;
  yMeters: number;
  zMeters: number;
}
```

Vorgeschlagene Geometrien speichern Punkte in Weltmetern. UI-Hilfsdaten (Mausposition, Bildschirmposition, Zoom) bleiben in Pixeln.

Die vorhandene `UniversalIsoMath` bleibt zunächst bestehen. Eine neue API, etwa `IsoProjector`, ergänzt kontinuierliche Höhe und rückwärtskompatible Adapter. Bestehende Aufrufe mit `tier` werden nicht stillschweigend semantisch umgedeutet.

### ADR-H03 – Die Stadt besteht aus räumlichen Modulen

Ein Stadtteil ist eine logische Gruppierung; ein Modul ist eine unabhängige, räumlich verortete Einheit. Die Modulgröße ist frei wählbar und kann sich am Produktionsworkflow orientieren. Es wird keine feste 100×100-m-Größe erzwungen.

Ein Modul enthält eigene Bounds, Layer, Objekt-Instanzen, Tilemaps, Geometrien, Höhenebenen und Verbindungen. Module referenzieren gemeinsame Assets über IDs.

### ADR-H04 – Weltverwaltung und Tilemap sind unterschiedliche Ebenen

Eine Welt enthält viele Module. Ein Modul kann eine oder mehrere begrenzte Tilemaps besitzen. Der Engine-eigene Weltindex verwaltet Lage und Nachbarschaft; Tiled bleibt zuständig für Tile-Layer und geeignete Objekt-Layer.

Die erste Version nutzt begrenzte Tiled-JSON-Maps je Modul. Support für Tiled Infinite Maps mit gechunkten Layerdaten wird später gezielt ergänzt. Das verhindert, dass der aktuelle Importer sofort durch einen kompletten Rewrite ersetzt werden muss.

### ADR-H05 – Eine normalisierte interne Repräsentation

Alle Eingaben durchlaufen einen Import-/Normalisierungspfad. Editor und Runtime arbeiten auf typisierten Dokumenten statt direkt auf unvalidierten Rohdaten unterschiedlicher Herkunft.

Eingaben:

- native Editor-Geometrie;
- Asset-Platzierung;
- Tiled-JSON;
- kalibrierte Referenzbilder;
- später automatisierte Bild-/Plananalyse.

Ausgaben:

- normalisiertes Stadtmodell;
- Render-Komponenten;
- abgeleitete Navigation und Kollision;
- Diagnosen und Qualitätsberichte;
- optional Tiled-Export für unterstützte Teilmengen.

### ADR-H06 – Referenzbild ist nicht automatisch Weltgeometrie

Ein Bild ist zunächst eine Vorlage. Seine Ausrichtung und Skalierung müssen explizit kalibriert werden. Die erste Version unterstützt mindestens:

- Maßstabs-Kalibrierung durch eine bekannte Distanz;
- Setzen eines Weltursprungs;
- Rotation/Ausrichtung der Vorlage;
- Deckkraft und Sperren der Referenzebene;
- manuelles Nachzeichnen von Straßen, Flächen und Gebäudefußabdrücken.

Für einfache orthogonale Lagepläne reicht eine affine Kalibrierung. Perspektivisch verzerrte oder isometrisch illustrierte Bilder können zusätzliche manuelle Kontrollpunkte und Korrekturen benötigen. Automatische Erkennung darf in späteren Versionen Vorschläge erstellen, aber nicht ungeprüft Spielgeometrie behaupten.

### ADR-H07 – Asset-Metadaten sind obligatorisch

Ein Asset ist erst platzierbar, wenn die für seine Kategorie erforderlichen Metadaten vollständig sind. Visuelle Datei und technische Definition bleiben getrennt.

### ADR-H08 – Quellengeometrie und abgeleitete Daten werden getrennt

Straßenlinien, Flächen, Gebäudefußabdrücke, Türen und Anschlussdefinitionen sind Autorenquellen. NavMesh, Kollision, Render-Bounds und Diagnoseberichte sind daraus abgeleitete Daten. Wenn eine Quelldatei geändert wird, werden betroffene Ableitungen invalidiert und neu erzeugt.

Eine generierte NavMesh-Datei darf nicht unbemerkt parallel zur Quelle weiterbearbeitet werden. Bei manuellen Eingriffen muss der Override explizit markiert sein.

### ADR-H09 – Legacy bleibt über Adapter angebunden

Die vier bestehenden Szenen behalten zunächst ihre `pre-rendered-stage`-/kalibrierte Stage-Pixel-Logik. Neue Weltmodule nutzen metrische Weltkoordinaten. Eine Legacy-Szene kann später in ein neues Modul eingebettet oder schrittweise migriert werden, wird aber nicht stillschweigend als metrische Isometrie interpretiert.

### ADR-H10 – Editor-Bedienung wird von der Runtime getrennt

`GameScene` bleibt die Spielszene. Der Editor erhält eigene Tools, Auswahlzustände, Dokumentzustände und Befehle. Gemeinsame Services für Projektion, Assetauflösung, Rendering, Tiefensortierung und Navigation werden nach und nach herausgezogen.

### ADR-H11 – Lokales, portables Projektformat

Ein Projekt soll alle benötigten JSON-Daten und Assets in einem versionierten Paket enthalten können. Arbeitsstand kann lokal zwischengespeichert werden; der portable Export muss aber ohne versteckte Abhängigkeit von Browserstorage wieder importierbar sein.

Empfohlener Zielweg:

- lokale Autosave-/Recovery-Daten während der Bearbeitung;
- expliziter Import und Export eines Projektpakets;
- Assets relativ zum Projekt statt durch maschinenabhängige absolute Pfade;
- Schema-Versionen und Migrationen für alle persistierten Daten.

Die ZIP-Implementierung wird als begrenzte neue Abhängigkeit evaluiert, statt Assets dauerhaft als riesige Base64-Daten in JSON einzubetten.

### ADR-H12 – Jede Phase braucht unabhängige Quality Gates

Eine Funktion gilt nicht als fertig, weil ein statischer Validator läuft. Für Engine-Änderungen braucht es passende Unit-Tests; für Renderer-, Touch- und Tiefensortierung reale Browserprüfung; für Import/Export einen Round-trip-Test.

---

## 5. Zielarchitektur

```text
KLEIN BERLIN PROJECT
│
├── Project manifest / schema version / asset catalog
│
├── WORLD MODEL
│   ├── Regionen und Stadtteile
│   ├── räumliche Module / Chunks
│   ├── Level- und Höhenmodell
│   ├── Straßennetz, Wege und Wasserwege
│   ├── freie Flächen und Grundrisse
│   ├── Tilemaps
│   ├── Asset-Instanzen
│   └── Connector-/Portalgraph
│
├── EDITOR APPLICATION
│   ├── Projekt-/Weltbrowser
│   ├── Viewport und Kamerasteuerung
│   ├── Auswahl- und Zeichenwerkzeuge
│   ├── Layer-/Level-Panel
│   ├── Asset-Browser
│   ├── Eigenschaftsinspektor
│   ├── Referenzbild-Kalibrierung
│   ├── Undo/Redo-Befehle
│   └── Validierung / Diagnosefenster
│
├── SHARED ENGINE SERVICES
│   ├── World coordinates + isometric projector
│   ├── Asset resolver / metadata validator
│   ├── Rendering / depth sorting / cutaway
│   ├── Geometry and road network
│   ├── Collision / navigation derivation
│   ├── Module connections / level graph
│   └── Chunk loading and cache
│
├── ADAPTERS
│   ├── Tiled JSON importer/exporter
│   ├── Existing scene manifest adapter
│   ├── Reference image adapter
│   └── Project package import/export
│
└── RUNTIME
    ├── editor preview
    ├── playable test mode
    └── later game builds
```

### Verantwortlichkeiten

- **World model:** beschreibt, was die Stadt ist.
- **Editor:** beschreibt, wie der Nutzer das Modell bearbeitet.
- **Importer/Exporter:** konvertiert externe Daten, nicht die fachlichen Regeln.
- **Renderer:** zeigt das Modell an und entscheidet nicht über die fachliche Wahrheit der Stadt.
- **Navigation:** wird aus Geometrien und semantischen Layern abgeleitet.
- **Runtime:** lädt denselben Projektdatenbestand für den Spielmodus.

---

## 6. Vorgeschlagenes Projektdatenmodell

Die folgenden Namen bilden einen Architekturvorschlag und müssen bei der Implementierung einmalig als Schema fixiert werden.

### 6.1 Projektmanifest

```json
{
  "schemaVersion": 1,
  "projectId": "klein-berlin",
  "name": "KLEIN BERLIN",
  "engineCompatibility": ">=1.2.0",
  "units": "meters",
  "projection": {
    "type": "dimetric-2-to-1",
    "tileWidthPx": 256,
    "tileHeightPx": 128,
    "referenceCellMeters": 10,
    "elevationPxPerMeter": 9.6
  },
  "worldIndex": "world/world-index.json",
  "assetCatalog": "assets/asset-catalog.json"
}
```

Die Werte sind Beispiele. Insbesondere `elevationPxPerMeter` muss anhand der gewünschten Bildsprache und vorhandener Assets kalibriert werden. Das Projekt darf nicht aus einem Beispielwert ableiten, dass alle neuen Inhalte diese Höhe verwenden müssen.

### 6.2 Weltindex

Der Weltindex ordnet Module in Weltkoordinaten ein. Er enthält keine vollständigen Tile-Daten.

```json
{
  "schemaVersion": 1,
  "worldId": "main-city",
  "name": "Klein Berlin",
  "districts": [
    {
      "id": "innenstadt",
      "name": "Innenstadt",
      "modules": [
        {
          "id": "kb-innenstadt-nord",
          "document": "districts/innenstadt/modules/nord/module.json",
          "originMeters": { "x": 0, "y": 0, "z": 0 },
          "boundsMeters": { "width": 200, "depth": 200, "height": 40 }
        }
      ]
    }
  ]
}
```

Die Bounding Box ist für räumliche Suche und Laden gedacht. Sie ersetzt nicht die tatsächliche Geometrie.

### 6.3 Modulmanifest

Ein Modul definiert die lokalen Layer, Quellen, Objektlisten und Anschlüsse.

```json
{
  "schemaVersion": 1,
  "id": "kb-innenstadt-nord",
  "name": "Innenstadt Nord",
  "coordinateSpace": "module-local-meters",
  "boundsMeters": { "width": 200, "depth": 200, "height": 40 },
  "levels": [
    { "id": "ground", "zMeters": 0, "label": "Straßenebene" },
    { "id": "u1", "zMeters": -6, "label": "Untergeschoss" }
  ],
  "layers": [
    { "id": "reference", "kind": "reference-image", "visibleInRuntime": false },
    { "id": "ground", "kind": "tilemap", "visibleInRuntime": true },
    { "id": "roads", "kind": "vector-geometry", "visibleInRuntime": true },
    { "id": "buildings", "kind": "asset-instances", "visibleInRuntime": true },
    { "id": "navigation", "kind": "derived-navigation", "visibleInRuntime": false }
  ],
  "tilemaps": [],
  "geometries": [],
  "entities": [],
  "connectors": []
}
```

### 6.4 Asset-Datensatz

```json
{
  "schemaVersion": 1,
  "id": "BLD-ALTBAU-001",
  "category": "building",
  "displayName": "Berliner Altbau – Eckhaus",
  "visual": {
    "image": "assets/buildings/BLD-ALTBAU-001.png",
    "projection": "dimetric-2-to-1",
    "anchor": "south-footpoint",
    "nominalWidthPx": 512,
    "nominalHeightPx": 640
  },
  "footprint": {
    "shape": "polygon",
    "pointsMeters": [[0, 0], [20, 0], [20, 10], [0, 10]]
  },
  "heightMeters": 18,
  "collisionProfile": "building-solid",
  "walkableTop": false,
  "tags": ["berlin", "altbau", "residential", "corner"],
  "variants": ["brick-red", "plaster-cream"],
  "source": { "type": "project-asset", "license": "to-be-recorded" }
}
```

### 6.5 Objektinstanz

Eine Instanz verweist auf ein Asset und speichert nur die abweichenden Platzierungsdaten.

```json
{
  "id": "entity-000042",
  "assetId": "BLD-ALTBAU-001",
  "positionMeters": { "x": 40, "y": 60, "z": 0 },
  "rotationDegrees": 90,
  "scale": { "x": 1, "y": 1, "z": 1 },
  "levelId": "ground",
  "variant": "brick-red",
  "overrides": {}
}
```

### 6.6 Freie Geometrie

Geometrie muss fachlich typisiert sein und in Metern vorliegen. Beispiele:

- `road-centerline` mit Breite, Straßentyp, Gehweg-/Spurprofil und Anschlussknoten;
- `walkway` als Weglinie mit Breite;
- `waterway` als Fluss-/Kanal-Mittellinie plus Uferprofil;
- `parcel` als Grundstückspolygon;
- `building-footprint` als Grundrisspolygon;
- `plaza` / `park` als Flächenpolygon;
- `walkable-area` und `collision-area` nur als explizite manuelle oder abgeleitete Datentypen.

Straßen dürfen nicht nur als optische Linie gerendert werden. Aus Linie und Breite müssen sichtbare Fläche, Gehwegkanten, Kreuzungsflächen und je nach Profil Navigationsgeometrie abgeleitet werden können.

### 6.7 Anschlüsse

Ein Anschluss ist eine stabile Schnittstelle an Modul- oder Levelgrenzen. Beispieltypen:

- `road`, `footpath`, `rail`, `waterway`;
- `stairs`, `escalator`, `elevator`, `portal`;
- optional später `service`, `power`, `transit-line`.

Ein Anschluss braucht mindestens ID, Typ, lokale Position, Richtung, Breite/Profil, Zielreferenz und Höhenangaben. Ein Anschluss gilt nicht nur deshalb als verbunden, weil sich zwei Bilder optisch berühren: die Verbindung muss im Datenmodell explizit bestätigt oder automatisch validiert sein.

---

## 7. Editor-UX: Aufbau und Werkzeuge

### 7.1 Hauptfenster

**Mittlere Fläche – Weltviewport**

- isometrische Karte mit Zoom und Pan;
- Raster wahlweise anzeigen, verbergen und feinjustieren;
- Ebenen-/Level-Filter;
- Auswahlrahmen, Ankerpunkte, Maßhilfen und Anschlussmarker;
- Referenzbilder mit Deckkraft, Sperre und Kalibrierwerkzeug;
- Editor-Overlay für Kollision und Navigation;
- Umschaltung zwischen Bearbeiten und Spielvorschau.

**Linke Seitenleiste – Projekt und Ebenen**

- Welt-/Stadtteil-/Modul-Browser;
- Layerliste mit Sichtbarkeit, Sperre und Typ;
- Level-Auswahl;
- Asset-Kategorien und Suche;
- Referenzbilder und importierte Tilemaps.

**Rechte Seitenleiste – Inspektor**

- Position x/y/z in Metern;
- Drehung, Skalierung und Ankerpunkt;
- Asset-ID und Variante;
- Grundfläche, Höhe, Collision- und Walkability-Profil;
- Anschlussdaten und Level;
- Quelle/Provenienz und Warnungen.

**Obere Werkzeugleiste**

- Auswahl/Hand;
- Raster konfigurieren;
- Straße/Wege zeichnen;
- Polygon/Fläche zeichnen;
- Gebäudegrundriss;
- Asset platzieren;
- Tile-Pinsel/Füllung/Radierer;
- Referenzbild kalibrieren;
- Verbinder setzen;
- Undo/Redo, Speichern, Prüfen, Vorschau.

**Unterer Statusbereich**

- Cursorposition in Weltmetern;
- aktives Modul/Level;
- gewählter Layer;
- Rasterfang;
- Anzahl Validierungsfehler und Warnungen;
- Status von Autosave und Export.

### 7.2 Auswahl- und Bearbeitungsregeln

- Ein Klick wählt das vorderste sichtbare Objekt anhand Render-Reihenfolge und Editor-Priorität.
- Bei mehreren überdeckten Objekten gibt es eine Auswahl-/Pick-Liste statt unvorhersehbarem Wechsel.
- Drag-Bewegungen erzeugen eine einzige Undo-Aktion beim Loslassen, nicht Hunderte Einzelschritte.
- Multi-Select, Duplizieren, Gruppieren und Ausrichten kommen früh.
- Rasterfang lässt sich temporär deaktivieren.
- Gesperrte Ebenen verhindern Auswahl/Bearbeitung.
- Referenzbild-Ebenen sind standardmäßig nicht Teil des Spielrenders.

### 7.3 Command-/Undo-System

Jede destruktive Editoraktion läuft durch eine Befehlsabstraktion:

```ts
interface EditorCommand {
  label: string;
  execute(document: CityDocument): void;
  undo(document: CityDocument): void;
}
```

Erste Befehle:

- `CreateModuleCommand`
- `PlaceAssetCommand`
- `MoveEntityCommand`
- `RotateEntityCommand`
- `DeleteSelectionCommand`
- `DrawGeometryCommand`
- `UpdateTileCommand`
- `UpdateConnectorCommand`
- `CalibrateReferenceCommand`
- `ImportTilemapCommand`

Das Command-System ist wichtig für zuverlässiges Undo/Redo, spätere Makros und reproduzierbare Fehlerberichte. Es sollte vor umfangreichen Zeichenwerkzeugen eingeführt werden.

---

## 8. Kernsysteme im Detail

### 8.1 Welt- und Modulmanager

Aufgaben:

- Projekt laden, validieren, speichern und migrieren;
- Module nach ID und räumlicher Position registrieren;
- Modulgrenzen und Nachbarschaften prüfen;
- Weltkoordinaten in lokale Modulkoordinaten umrechnen;
- benötigte Module anhand Kamera-/Spielbereich laden;
- Module entladen, ohne ungespeicherte Änderungen zu verlieren;
- Modul-/Asset-Abhängigkeiten berichten.

Die erste Version kann alle vorhandenen Module laden. Streaming und echtes Entladen gehören in eine spätere Performance-Phase, aber die Datenstruktur darf es nicht verhindern.

### 8.2 Koordinaten- und Projektionssystem

Es braucht eine ausdrücklich dokumentierte Transformationskette:

`Modul lokal (Meter) → Welt (Meter) → isometrische Projektion (Pixel) → Kameratransformation → Bildschirm`

Die inverse Kette wird für Auswahl, Zeichnen und Kalibrierung gebraucht.

Anforderungen:

- Round-trip-Tests für `worldToScreen` und `screenToWorld`;
- explizite Behandlung von z/Höhe;
- Projektionsparameter zentral pro Projekt;
- Module können lokale Ursprünge haben, ohne eigene Projektionen zu erfinden;
- Display-Zoom verändert nicht die Weltkoordinaten;
- unterschiedliche reale Maßeinheiten werden nicht durch Pixelgrößen simuliert;
- Legacy-Stage-Pixel werden nur über den existierenden Legacy-Adapter konvertiert.

### 8.3 Freie Straßen- und Flächengeometrie

Straßen sollen als geometrische Objekte und Netz gespeichert werden, nicht bloß als gezeichnete Textur.

Schritte:

1. Benutzer zeichnet eine Mittellinie mit Stützpunkten.
2. Straßentyp, Breite und Profil werden zugewiesen.
3. Geometrieservice berechnet Kanten, sichtbare Fläche und Kreuzungsanschlüsse.
4. Netzvalidierung sucht Lücken, überlappende Knoten, ungültige Kurven und nicht verbundene Endpunkte.
5. Renderer zeigt Straße, Gehweg, Bordstein und optional Markierung in getrennten Sub-Layern.
6. Navigationsableitung erstellt begehbare/gesperrte Zonen.

Für den ersten Prototyp reichen Polyline-Segmente und robuste Kreuzungen. Bézierkurven, komplexe Straßenmarkierungen, Fahrspuren und automatische Grundstückserzeugung können danach ergänzt werden.

### 8.4 Asset-System

Der Asset-Browser muss mindestens nach Kategorie, Stil, Tags, Maßstab, Grundfläche und Verfügbarkeit filtern können.

**Import-Assistent:**

1. Grafik oder Atlas auswählen.
2. Bildgröße und Transparenz prüfen.
3. Assettyp und ID vergeben.
4. Fußpunkt/Anker markieren.
5. Nominale Maße und reale Grundfläche erfassen.
6. Höhe, Kollisionsprofil, Level und Walkability definieren.
7. Vorschau in der isometrischen Projektion zeigen.
8. Metadaten validieren und in den Katalog aufnehmen.

**Assettypen:**

- Tiles und Atlanten;
- vollständige Sprites/Objekte;
- modulare Fassaden, Stockwerke und Dächer;
- Vektor-/Geometrievorlagen wie Straße oder Zaun;
- interaktive Objekte mit Hotspot;
- später animierte Objekte.

Keine importierte Grafik soll automatisch als korrekt skaliertes Spielasset gelten. Sie benötigt eine Bestätigung oder ein überprüfbares Standardprofil.

### 8.5 Referenzbild-System

Funktionen:

- Rasterfreie Referenzebene importieren;
- Bild proportional skalieren, drehen und verschieben;
- zwei bekannte Punkte und Distanz definieren;
- optional weitere Kontrollpunkte für verbesserte Ausrichtung erfassen;
- Deckkraft, Sichtbarkeit und Sperre anpassen;
- mehrere Vorlagen je Modul verwalten;
- Nachzeichnungsobjekte mit ihrer Quelle verknüpfen.

Später kann Bildanalyse Vorschläge für Linien, Gebäudegrenzen, Straßenränder und Wasserflächen erstellen. Jedes Ergebnis muss als Vorschlag angezeigt und vom Nutzer angenommen, angepasst oder verworfen werden können.

### 8.6 Tiled-Integration

Tiled bleibt wichtig, aber ist ein Adapter und ein spezialisiertes Tilemap-Werkzeug, kein übergeordnetes Weltmodell.

**Erste Stufe:**

- begrenzte isometrische 2:1-Tiled-JSON-Karte importieren;
- Atlas-Tilesets normalisieren;
- Layer und semantische Eigenschaften beibehalten;
- Navigation und Kollision aus passenden Objekt-Layern ableiten;
- importierte Karte als Layer eines Stadtmoduls platzieren;
- Export der bearbeitbaren Tile-Layer ermöglichen, soweit das interne Modell verlustfrei auf Tiled abbildbar ist.

**Bewusst später:**

- Tiled Infinite Maps mit `chunks`;
- komprimierte/Base64-Layer;
- Image-Collection-Tilesets;
- garantierter verlustfreier Export aller spezialisierten Editorobjekte.

Wenn eine Eigenschaft im Tiled-Format nicht verlustfrei repräsentiert werden kann, muss der Export warnen und darf keine stillschweigende Datenlöschung durchführen.

### 8.7 Navigation und Kollision

Die Engine sollte den bisherigen `PolygonNavMesh` und `TiledNavigationExtractor` weiter nutzen, aber die Quelldaten vereinheitlichen.

- Straßen-/Wegflächen können Begehbarkeit erzeugen.
- Gebäudefußabdrücke erzeugen Kollision, sofern das Assetprofil nichts anderes vorgibt.
- Türen, Tore, Aufzüge und Treppen liefern Interaktions-/Connectorzonen.
- Dächer und vordere Fassaden liefern Render-Occluder, nicht automatisch begehbare Flächen.
- Mehrere Höhenebenen besitzen getrennte Navigationsebenen mit expliziten Verbindungen.
- Das System meldet Inseln, Sackgassen, ungültige Startpunkte, Überlappungen und fehlende Verbindungspaare.

Die Navigation soll deterministisch aus den Eingabedaten abgeleitet werden. Manuelle Korrekturen müssen als Overrides versioniert sein.

### 8.8 Rendering und Ebenen

Der bestehende Depth-Sorter und Cutaway-Pfad werden als wiederverwendbare Engine-Services weiterentwickelt.

Renderrollen sollten konfigurierbar sein, beispielsweise:

- Ground / Ground-Detail;
- Road / Sidewalk / Water;
- Building-Back / Building-Body;
- Actor-Sorted / Foreground;
- Roof / Canopy / Occluder;
- UI / Editor-Overlay.

Nicht jedes Tile darf in ein einzelnes Sprite umgewandelt werden. Große Ground-Layer sollen gebatcht bleiben; per-Tile-Depth ist für Dächer, Vordächer, Brücken und andere tatsächlich überdeckende Bereiche bestimmt. Diese Trennung ist im aktuellen Rendering bereits angelegt und muss erhalten bleiben.

### 8.9 Mehrgeschossige Welt

Höhenebenen und räumliche Stadtmodule sind unterschiedliche Dinge:

- ein Modul kann mehrere Level enthalten;
- ein Bahnhof kann über mehrere Module und Level gehen;
- Treppe, Rolltreppe und Aufzug verbinden Navigationsebenen;
- ein Gebäude kann eine Außenansicht und eigene Innenraum-/Etagenmodule referenzieren;
- Innenräume können als separat ladbare Module behandelt werden, die über Türen/Portale verbunden sind.

Die erste Editor-Version sollte ein minimales Levelmodell und Connectoren unterstützen, aber nicht sofort jedes Gebäude als vollständig begehbares Innenraumlabyrinth umsetzen.

### 8.10 Speichern, Autosave und Export

- Ein Projekt erhält Schema-Version und Engine-Kompatibilität.
- Speichern validiert und schreibt nur ein konsistentes Modell.
- Autosave sichert Änderungen mit Statusanzeige und Wiederherstellung.
- Export enthält alle referenzierten Projektdateien und benötigten Assets.
- Import prüft Pfade, doppelte IDs, fehlende Dateien und inkompatible Versionen.
- Migration läuft versioniert und produziert ein Protokoll.
- Projektarchive enthalten keinen zufälligen absoluten Maschinenpfad.

---

## 9. Zielstruktur des Quellprojekts

Die bestehende Struktur wird schrittweise erweitert. Es ist nicht erforderlich, alle Dateien sofort umzubenennen.

```text
src/
  core/
    SceneManifest.ts                 # bestehender Scene-/Legacy-Vertrag
    SceneManifestLoader.ts
    SceneRuntime.ts
    UniversalIsoMath.ts
    IsoProjector.ts                   # neu: metrische Projektion inkl. z
    ProjectSchema.ts                  # neu: versionierte Projektverträge
    ProjectLoader.ts                  # neu: laden/migrieren/validieren
  world/
    WorldDocument.ts                  # neu: Welt- und Modulmodelle
    WorldIndex.ts                     # neu: räumliche Modulverwaltung
    ModuleTransform.ts                # neu: lokal ↔ Welt
    ConnectorGraph.ts                 # neu: Verbindungsgraph
    ChunkManager.ts                   # später: bedarfsgerechtes Laden
  geometry/
    VectorGeometry.ts                 # neu: Linien, Polygone, Grundrisse
    RoadNetwork.ts                    # neu: Straßenknoten und -kanten
    GeometryValidation.ts             # neu: Topologie/Anschlüsse
    GeometryDerivation.ts             # neu: Flächen-/Collision-Ableitung
  assets/
    AssetCatalog.ts                   # neu: Asset-Metadaten und IDs
    AssetResolver.ts                  # neu: Auflösung und Pfadprüfung
    AssetValidation.ts                # neu: Anker, Bounds, Maße
  importers/
    tiled/                            # vorhandene tiled-Module dorthin migrierbar
    reference-image/                  # neu: Kalibrierung und Trace-Adapter
    legacy-scene/                     # neu: vorhandene Manifeste anbinden
    project-package/                  # neu: Projektarchiv import/export
  rendering/
    WorldRenderer.ts                  # neu: gemeinsamer Welt-/Modulrenderer
    MultiTierDepthSorter.ts           # bestehend
    CutawayController.ts              # bestehend
  navigation/
    PolygonNavMesh.ts                 # bestehend
    NavigationBuilder.ts              # neu: abgeleitete NavMesh-Daten
  editor/
    EditorApp.ts                      # neu: UI-Orchestrierung
    EditorState.ts                    # neu: Auswahl/Werkzeug/Layers
    CommandStack.ts                   # neu: Undo/Redo
    commands/                         # neu: atomare Editierbefehle
    tools/                            # neu: Auswahl, Zeichnen, Pinsel, Platzierung
    panels/                           # neu: Layer, Assets, Inspektor, QA
    EditorScene.ts                    # neu: Editor-Viewport in Phaser
  scenes/
    GameScene.ts                      # bestehende Runtime-Szene
  ui/
    HudController.ts                  # bestehende Spiel-HUD-Funktionen
```

Die Dateinamen sind Vorschläge. Wichtiger als eine bestimmte Ordnerstruktur ist die Abhängigkeitsrichtung: **World- und Geometriemodell dürfen nicht von Phaser-GameObjects oder DOM-Elementen abhängen.** Rendering- und Editorcode konsumieren das Modell, nicht umgekehrt.

---

## 10. Migrationsplan für vorhandene Daten

### CON-01, EXT-00, RAIL-02 und UG-03

- Bestehende Manifeste und Stage-Bilder bleiben unverändert im Produktionsindex.
- Der Legacy-Adapter lädt sie weiter wie heute.
- Die vier Szenen werden im Editor als Legacy-Referenzen angezeigt und nicht ungefragt in metrische Geometrie umgerechnet.
- Sichtbare Tiled-Overlays, Connector-Register und Navigation werden aus den vorhandenen Daten übernommen.
- Erst wenn eine konkrete Szene manuell gegenprüft und kalibriert wurde, darf daraus ein neues Weltmodul entstehen.

### Asset-Register

- Bestehende Einträge werden zunächst eingelesen und auf ein neues typisiertes Schema abgebildet.
- Nicht verfügbare Metadaten bleiben als `unknown`/`unverified` markiert, nicht erfunden.
- Alle Bildpfade und Referenzen werden geprüft.
- Dubletten werden nur nach Referenzprüfung zusammengeführt.

### Connector-Register

- Vorhandene IDs werden stabil übernommen.
- Neue Weltconnectoren erhalten standardisierte Endpunkte und Levelreferenzen.
- Eine bestehende Verbindung wird nicht automatisch als vollständig metrisch verifiziert angesehen.

### Navigation

- Bestehende NavMesh-Dateien sind Referenzen und Regressionstests.
- Neue Modulnavigation wird aus normalisierten Layern und Geometrien abgeleitet.
- Die bestehende Pixelnavigation bleibt im Legacy-Pfad gültig.

### Build-/Release-Dokumentation

- README und Release-Berichte müssen den vorhandenen `package-lock.json` korrekt beschreiben.
- Quellen, generierte Dateien und Ausgaben müssen getrennt dokumentiert sein.
- `dist/` wird als generiertes Artefakt behandelt und nicht direkt bearbeitet.
- `.DS_Store` und `__MACOSX/` werden aus reproduzierbaren Projektpaketen ausgeschlossen.
- QA-Screenshots bleiben nur dann als Beleg erhalten, wenn sie eindeutig einem aktuellen QA-Lauf zugeordnet sind.

---

## 11. Phasenplan mit Lieferobjekten und Abnahmekriterien

Die Phasen werden nach erreichbaren technischen Ergebnissen getrennt. Die Reihenfolge ist wichtiger als Kalenderdaten.

### Phase 0 – Basis reproduzierbar machen

**Ziel:** Ein sauber prüfbarer Ausgangspunkt vor größeren Änderungen.

Arbeiten:

1. `npm ci` auf einem netzwerkfähigen Gerät ausführen.
2. Vollständigen `npm run release-check` und `npm run build` durchführen.
3. Browser-Smoke auf Desktop, Mobilviewport und Tiled-Render-QA ausführen.
4. README/Release-Dokumentation und tatsächlichen Lockfile-Zustand synchronisieren.
5. Quellen, generierte `dist`-Dateien und temporäre macOS-Metadaten trennen.
6. Baseline-Screenshots und Testergebnisse datiert ablegen.

**Abnahme:** Alle offline Gates bleiben grün; Build/Browserstatus ist wirklich gemessen und klar dokumentiert. Bestehende vier Szenen starten.

### Phase 1 – Schemas und World Model

**Ziel:** Das neue Stadtmodell ohne UI einführen.

Arbeiten:

1. Projektmanifest und Schema-Version hinzufügen.
2. `WorldDocument`, `DistrictModule`, `LayerDefinition`, `WorldPoint3`, `AssetInstance`, `GeometryFeature`, `ConnectorEndpoint` typisieren.
3. Laufzeitvalidatoren und Migrationstests schreiben.
4. Module in lokaler Meterkoordinate und Weltposition verorten.
5. Adapter für vorhandene Scene-Manifeste schreiben.
6. Koordinatentransformation inklusive z und Round-trip-Test spezifizieren.

**Abnahme:** Ein Beispielprojekt mit zwei Modulen lässt sich laden, validieren, serialisieren und erneut laden. Die bestehenden Szene-Tests bleiben grün.

### Phase 2 – Gemeinsamer Projektor und Modulrendering

**Ziel:** Ein neues datengetriebenes Modul tatsächlich darstellen.

Arbeiten:

1. Neue `IsoProjector`-API erstellen, bestehende `UniversalIsoMath` nicht brechen.
2. Modulursprung und lokale/weltweite Transformation ergänzen.
3. Renderer für Ground-Tiles, Vektorgeometrie und Asset-Instanzen als getrennte Renderpfade aufsetzen.
4. Ein kleines synthetisches Modul mit mehreren Layern rendern.
5. Tiefensortierung und Cutaway an eine minimale neue Asset-Instanz anbinden.
6. Debug-Overlay für Modulgrenzen, Achsen, Ursprung, Z-Wert und Fußpunkt bereitstellen.

**Abnahme:** Die neue Szene wird allein aus Daten geladen; Projektions-Roundtrip bleibt stabil. Bestehende Bahnhofsszenen werden nicht verändert.

### Phase 3 – Editor-Skelett und Undo/Redo

**Ziel:** Bearbeitung des neuen Modells ohne direkten Codeeingriff.

Arbeiten:

1. Editor-Einstieg und Editor-Viewport anlegen.
2. Weltbrowser, Layerliste, Eigenschaften-Panel und Werkzeugleiste umsetzen.
3. Auswahl, Verschieben, Drehen und Löschen von Asset-Instanzen implementieren.
4. CommandStack mit Undo/Redo und Batchdrag integrieren.
5. Cursorposition in Metern und Rasterfang einbauen.
6. Editorzustand von Dokumentzustand trennen.

**Abnahme:** Ein Nutzer kann Assets platzieren, ändern, löschen, rückgängig machen, wiederherstellen und das Ergebnis verlustfrei speichern/laden.

### Phase 4 – Referenzbilder und freie Geometrie

**Ziel:** Der Nutzer kann vorhandene Pläne als Vorlage verwenden und tatsächliche Stadtgeometrie darauf aufbauen.

Arbeiten:

1. Referenzbild-Import.
2. Maßstabs- und Ursprungswerkzeug.
3. Deckkraft, Rotation, Verschieben, Sperre und Sichtbarkeit.
4. Straßenmittellinien und Flächenpolygone zeichnen.
5. Gebäudegrundrisse und Grundstücke zeichnen.
6. Geometrie bearbeiten: Punkte verschieben, hinzufügen, löschen und snappen.
7. Geometrie speichern und in Weltkoordinaten prüfen.
8. Erste Topologie-Checks für offene Straßenenden, ungültige Polygone und Bounds.

**Abnahme:** Aus einem importierten Bild wird ein Modul mit echten meterbasierten Straßen- und Flächenobjekten erzeugt. Referenzbild und Spielgeometrie bleiben sauber getrennt.

### Phase 5 – Straßenmodell und automatische Ableitungen

**Ziel:** Gezeichnete Linien erzeugen nutzbare Infrastruktur.

Arbeiten:

1. Straßentypen, Breitenprofile und Kreuzungsknoten.
2. Straßenflächen und Gehwege aus Linien ableiten.
3. Wege- und Fahrbahnprofile als getrennte Attribute.
4. Begehbarkeit/Kollision aus Straßen, Flächen und Gebäude-Footprints generieren.
5. Verbindungsgraph und Diagnosebericht.
6. NavMesh aus abgeleiteten Flächen erstellen und Regression testen.

**Abnahme:** Ein einfacher Straßenzug mit Kreuzung ist nicht nur sichtbar, sondern im Testmodus korrekt begehbar; Gebäudefußabdrücke blockieren die Bewegung; Fehler werden im Editor erklärt.

### Phase 6 – Asset-Bibliothek und Tilemap-Import

**Ziel:** Wiederverwendung und schneller Aufbau aus Bausteinen.

Arbeiten:

1. Typisierten Asset-Katalog einführen.
2. Asset-Import-Assistent mit ID, Anker, Grundfläche, Höhe, Tags und Collision-Profile.
3. Suche, Kategorien, Vorschau und Drag-and-drop.
4. Tilemap-Import in ein Modul, zunächst mit bestehendem Tiled-Importerumfang.
5. Asset-/Tile-Layer-Zuordnung und semantische Eigenschaften erhalten.
6. Assetabhängigkeiten und fehlende Dateien validieren.
7. Import-/Export-Roundtrip für unterstützte Tiled-Layer testen.

**Abnahme:** Ein neues Modul wird aus mindestens einem Tilemap-Layer, freier Geometrie und mehreren Asset-Instanzen aufgebaut und ohne Codeänderung geladen.

### Phase 7 – Module verbinden und größere Welt

**Ziel:** Aus einzelnen Modulen eine zusammenhängende Stadt bauen.

Arbeiten:

1. Weltkarte mit frei positionierbaren Modulen.
2. Anschlüsse an Modulgrenzen setzen und bearbeiten.
3. Straßen-, Fußweg- und Wasserweg-Verbindungen validieren.
4. Connectoren zwischen Höhenebenen und Bahnhofszugängen verwalten.
5. Modulübergreifende Koordinaten, Auswahl und Kamera.
6. Fehlerdiagnostik bei doppelten, fehlenden oder nicht passenden Verbindungen.
7. Weltpaket mit mehreren Stadtteilen speichern und importieren.

**Abnahme:** Mindestens drei nebeneinanderliegende Module bilden eine optisch und navigationsseitig zusammenhängende Testwelt; ein Modul lässt sich verschieben, ohne interne Koordinaten zu verfälschen.

### Phase 8 – Chunking, Performance und mobile Bedienung

**Ziel:** Die Architektur für größere Städte und kleinere Displays absichern.

Arbeiten:

1. Räumlichen Index und aktive Module um die Kamera.
2. Cache für Assets, Tile-Layer und abgeleitete Navigation.
3. Keine einzelne Sprite-Instanz pro Ground-Tile; Batch-Rendering beibehalten.
4. Performanceprofil für viele Gebäude und Foreground-Tiles.
5. Editorlayout für Desktop, Tablet und schmale Displays.
6. Touch-Pan/Zoom, kontextabhängige Auswahl und ausreichend große Griffe.
7. Testprojekt in mehreren Größen messen.

**Abnahme:** Große Ground-Layer bleiben gebatcht; das Laden zusätzlicher Module erzeugt keine doppelten Objekte; Editoraktionen bleiben auf Zielgeräten brauchbar. Konkrete FPS-/Ladezeitziele werden nach einer gemessenen Baseline festgelegt, nicht aus dem Bauch heraus.

### Phase 9 – Assistierte Bildanalyse und Generatoren

**Ziel:** Manuelle Arbeit weiter reduzieren, ohne Kontrolle zu verlieren.

Arbeiten:

1. Bild als Referenz laden und kalibrieren.
2. Linien-/Flächenerkennung als Vorschlag erzeugen.
3. Nutzer prüft und korrigiert Vorschläge.
4. Grundstücke aus Straßenrändern ableiten.
5. Gebäudevorschläge nach Grundfläche, Stil, Nutzung und Asset-Verfügbarkeit platzieren.
6. Qualitätsprüfung: Abstände, Überlappungen, unverbundene Straßen, unzugängliche Grundstücke.
7. Seed und Generierungsparameter speichern, damit ein Ergebnis wiederholbar ist.

**Abnahme:** Generierung verändert keine bestätigten Bereiche unbemerkt und alle automatisch hinzugefügten Objekte lassen sich selektiv annehmen oder rückgängig machen.

---

## 12. MVP-Scope: Was zuerst wirklich gebaut wird

Der erste Durchstich soll klein, aber vollständig sein. Nicht alle Phasen müssen fertig sein, um Fortschritt zu beweisen.

### MVP-Inhalt

- ein Projektmanifest;
- eine Welt mit zwei Modulen;
- metrische Koordinaten inklusive Höhe;
- eine Referenzbild-Ebene mit Kalibrierung;
- ein Straßen-Polyline-Werkzeug;
- ein Polygonwerkzeug für eine Fläche oder Gebäudegrundriss;
- ein Asset-Browser mit wenigen Testassets;
- Asset platzieren/verschieben/drehen/löschen;
- ein begrenzter Tiled-JSON-Import;
- speichern/laden und Undo/Redo;
- Anschluss zwischen zwei Modulen;
- Validator und Test-Avatar;
- Desktop-Browser-QA.

### Bewusst nicht im MVP

- automatische Bilderkennung;
- komplexer Straßenbau mit allen Berliner Straßenprofilen;
- voll begehbare Gebäude-Innenräume;
- KI-generierte Gebäude;
- Verkehrssimulation;
- Online-Kollaboration;
- native mobile App;
- uneingeschränkter Import jedes denkbaren Tiled-Dateiformats.

Der MVP ist erfolgreich, wenn er den vollständigen Weg vom leeren Projekt bis zur begehbaren, gespeicherten 2-Modul-Welt zeigt.

---

## 13. Test- und Qualitätsstrategie

### 13.1 Unit-Tests

- Projekt- und Modulvalidator;
- Schema-Versionierung und Migration;
- Meter-/Pixel-Roundtrip, inklusive negativer Höhen;
- Modul lokal ↔ Welt;
- Straßennetz und Kreuzungstopologie;
- Polygonvalidierung und Bounds;
- Asset-Anker, Fußpunkt und Grundfläche;
- Assetresolver und Pfadvalidierung;
- CommandStack: execute/undo/redo;
- Tiled-Import normalisieren und Export-Roundtrip;
- Connectorgraph über mehrere Module;
- Ableitung von Kollision und Begehbarkeit.

### 13.2 Integrationstests

- Projektpaket importieren, laden, bearbeiten, exportieren, erneut importieren;
- zwei Module verbinden und nach Modulverschiebung erneut prüfen;
- Asset löschen/umbenennen und Referenzen anzeigen;
- Tilemap-Layer plus Vektorstraße plus Gebäude im selben Modul rendern;
- Legacy-Szene und neues Modul in derselben App starten, ohne Koordinatenverwechslung.

### 13.3 Browser-QA

- Desktop: Welt öffnen, bearbeiten, speichern, neu laden;
- Touch/Mobile: Kamera bewegen, zoomen, Auswahlwerkzeuge bedienen;
- Render-QA: Überdeckung, Fußpunkt, Höhen und Cutaway;
- Navigation: Wände blockieren, Straßen sind begehbar, Anschlüsse führen zum Ziel;
- Fehlerpfade: fehlende Assets, inkompatibles Schema, ungültiges Tiled-JSON, nicht verbundene Module.

### 13.4 Release-Gates

Ein Release darf nicht als erfolgreich markiert werden, wenn:

- Tests oder Datenvalidator fehlschlagen;
- der Vollbuild nicht gelaufen ist;
- die Browser-QA nach wesentlichen Renderingänderungen nicht gelaufen ist;
- ein Import Daten stillschweigend verwirft;
- ein neues Schema keine Migration/Versionierung besitzt;
- Legacy-Szenen unbeabsichtigt verändert wurden.

---

## 14. Risiken und Gegenmaßnahmen

| Risiko | Auswirkung | Gegenmaßnahme |
|---|---|---|
| Rewrite von `GameScene` | Bahnhof funktioniert plötzlich nicht mehr | Neue Editor-/World-Pfade daneben aufbauen, erst später gemeinsame Services extrahieren |
| Vermischung von Stage-Pixeln und Weltmetern | Falsche Positionen und Maßstäbe | Explizite Koordinatenräume und Adapter; keine stillen Konvertierungen |
| Überdehnung des MVP | Viele halbfertige Werkzeuge | Durchstich mit zwei Modulen und wenigen Geometrietypen zuerst |
| Assetgrafik ohne Maße/Anker | Gebäude schweben, Kollisionen passen nicht | Import-Assistent und Pflichtmetadaten je Asset-Kategorie |
| NavMesh wird von Hand und automatisch bearbeitet | Quelle und Ergebnis widersprechen sich | Ableitungen markieren, Overrides separat und sichtbar speichern |
| Tiled-Import nicht vollständig | Datenverlust bei Export | Unterstützte Teilmenge explizit dokumentieren, round-trip testen und vor verlustbehaftetem Export warnen |
| Viele Einzel-Sprites | Schlechte Performance bei großen Karten | Ground-Layer batchen; nur tatsächliche Occluder per Tile sortieren |
| Unkalibrierte Referenzbilder | Falsche reale Maße | Kalibrierwerkzeug und sichtbarer Messstatus; keine automatische Scheingenauigkeit |
| Assetpfade außerhalb des Projekts | Paket funktioniert auf anderem Gerät nicht | Relative Pfade, Projektpaketvalidator und Pfad-Sicherheitsregeln |
| Veraltete Build-Ausgaben | Falsche Erfolgssignale | Generierte `dist`-Artefakte bei Releases frisch erstellen und QA-Ergebnisse datieren |

---

## 15. Unmittelbare Arbeitspakete

Diese Reihenfolge sollte als erste konkrete Umsetzungsreihenfolge dienen.

### Arbeitspaket A – Qualität und Build

- Lockfile-Dokumentation korrigieren;
- Abhängigkeiten installieren und `release-check`/Build/Browser-QA tatsächlich laufen lassen;
- Tests und vorhandene Render-Screenshots als Baseline dokumentieren;
- keine Renderer-Refactors vor abgeschlossener Baseline.

### Arbeitspaket B – Datenverträge

- `ProjectSchema.ts` und `WorldDocument.ts` implementieren;
- Projekt, Weltindex, Modul, Layer, Geometrie, Asset-Instanz und Connector modellieren;
- Validatoren und Tests ergänzen;
- kleines zweimoduliges Beispieldokument erstellen.

### Arbeitspaket C – Koordinaten

- `IsoProjector` als neue API einführen;
- z in Metern oder als definierte Ebenenhöhe abbilden;
- lokale Modulkoordinaten und Weltkoordinaten trennen;
- Projektions- und Modultransform-Tests ergänzen.

### Arbeitspaket D – Renderbarer Modul-Prototyp

- Boden-Tile-Layer rendern;
- eine Vektorfläche rendern;
- ein Asset mit definiertem Footpoint rendern;
- Modulgrenzen, Grid und Koordinaten debuggen;
- Test-Avatar auf dem Modul bewegen.

### Arbeitspaket E – Minimaler Editor

- Editor-Viewport und UI-Panels;
- Auswahl, Platzierung, Verschieben, Löschen;
- CommandStack;
- Save/load round trip.

### Arbeitspaket F – Referenz und Zeichnen

- Bildkalibrierung;
- Linien-/Polygonwerkzeuge;
- erste Straßenflächen- und Kollisionserzeugung.

### Arbeitspaket G – Tiled und Asset-Katalog

- Tilemap in Modul importieren;
- Assets mit Metadaten registrieren und platzieren;
- Validierungsreport und Export.

### Arbeitspaket H – Modulverbindung und Weltkarte

- zwei Modulinstanzen auf Weltkoordinaten setzen;
- Anschluss definieren und prüfen;
- durchgängige Bewegung über Anschluss;
- Projektpaket exportieren/importieren.

---

## 16. Definition of Done für jede neue Engine-Funktion

Jede Feature-Implementierung gilt erst dann als abgeschlossen, wenn:

1. ihr Datenvertrag definiert und versioniert ist;
2. Quell- und abgeleitete Daten klar getrennt sind;
3. Unit-Tests die Fachlogik abdecken;
4. Projektvalidierung sinnvolle Fehlermeldungen liefert;
5. Speichern/Laden die Daten unverändert erhält;
6. Editor- und Runtime-Verhalten konsistent sind;
7. relevante Browser-QA durchgeführt wurde;
8. bestehende Szenen weiter funktionieren;
9. Dokumentation den tatsächlichen Stand und Einschränkungen nennt;
10. ungenutzte Altpfade nicht aus Gewohnheit mitgeschleppt werden, aber vor Entfernung aktivierte Abhängigkeiten geprüft sind.

---

## 17. Abschließende Empfehlung

**Nicht mit der automatischen Stadtgenerierung anfangen.** Der Hebel liegt zuerst in einem stabilen gemeinsamen Datenmodell, verlässlichen Koordinaten, einem minimalen Editor und wiederverwendbaren Assets.

Die beste Reihenfolge lautet:

1. bestehende Engine absichern;
2. World-/Modul-Datenmodell einführen;
3. neue metrische Projektion und Modulrenderer ergänzen;
4. Editor mit Undo/Redo aufbauen;
5. Referenzbild und freie Geometrie integrieren;
6. Asset- und Tiled-Workflow ergänzen;
7. Module verbinden und größere Welt verwalten;
8. erst dann Bildanalyse und Generierungsregeln hinzufügen.

Der wichtigste Architekturtest bleibt einfach: **Kann ein Nutzer einen neuen Stadtteil anlegen, zeichnen oder aus Assets zusammensetzen, speichern und mit einem bestehenden Modul verbinden, ohne eine neue TypeScript-Szene zu schreiben?** Wenn dieser Ablauf zuverlässig funktioniert, ist die Grundlage einer echten KLEIN-BERLIN-Engine geschaffen.

### Technische Referenzen

- Tiled JSON Map Format – insbesondere Layer und Chunk-Daten für Infinite Maps: https://docs.mapeditor.org/en/latest/reference/json-map-format/
- Phaser-Dokumentation – Szenen, Game Objects, Input, Kameras und Rendering: https://www.phaser.io/oss/docs/
- Vorhandene projektspezifische Dokumente: `README.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/RENDERING_V1.md`, `docs/TILED_IMPORT.md`, `docs/TILED_NAVIGATION.md`, `docs/RELEASE_CHECK_V1.1.md`.
