# Architekturentscheidungen — Engine V0.9

## ADR-001 — Phaser als Spiel-Laufzeit

**Entscheidung:** Phaser 3.90.0, TypeScript und Vite bilden den gelockten Engine-Kern.

**Begründung aus dem bereitgestellten Blueprint:** Das Dokument bevorzugt ein vollständiges Game-Framework gegenüber einer reinen Rendering-Bibliothek und nennt Phaser 3.90 LTS als risikominimierte Basis.

## ADR-002 — Szenen werden durch Manifestdaten registriert

`SceneRuntime` lädt `scene-index.json`; `SceneManifestLoader` lädt Manifeste und wählt je nach `navigationSource` zwischen einer vorhandenen `NavMeshData`-Datei und der Ableitung aus Tiled-Objektgruppen. Szenen-IDs werden nicht in `SceneRuntime` aufgezählt.

## ADR-003 — Legacy Stage-Pixel sind keine Weltmeter

Der bisherige HTML-Prototyp skaliert seine Backdrops auf 2048×1529 und positioniert NavMesh, Slices und Figur in diesen Stage-Pixeln. Diese Raumebene bleibt erhalten, um die aktuelle Referenz nicht neu zu projizieren. `UniversalIsoMath` akzeptiert ausschließlich `dimetric-2-to-1` und übernimmt bei projizierten Szenen die Telemetrie-Rücktransformation. Das Legacy-`worldMapping` ist in diesen Szenen nicht erforderlich.

## ADR-004 — Vorhandene Daten und Rückfallstand bleiben erhalten

Die bereitgestellte HTML-Datei bleibt unter `legacy/v0.3-reference.html` erhalten. Bilddaten, NavMesh-, Trace-, Connector- und Asset-Register sind in separate Dateien ausgelagert. Geschätzte und abgeleitete Messstatus bleiben unverändert.

## ADR-005 — Tiled JSON wird vor der Laufzeit normalisiert

Der `TiledJsonImporter` prüft das Map-JSON, 2:1-Kachelmetriken, Layerdaten und Objektgeometrien. Externe TSJ-Dateien werden aufgelöst und ins Map-JSON eingebettet, alle Assetpfade auf den öffentlichen Assetbereich beschränkt.

## ADR-006 — Tiled-Objektgruppen sind die Quelle für Navigation

Für projizierte Szenen kann `navigationSource: "tiled-object-layers"` die JSON-NavMesh-Datei ersetzen. Semantische Layer- oder Objektrollen leiten Laufbarkeit, Hindernisse, Portale, Interaktionen und Tiefenobjekte ab. Die abgeleiteten Punkte bleiben in der von der Phaser-Map verwendeten Pixel-Koordinatenebene; Weltmeter-Telemetrie nutzt weiterhin die im Manifest kalibrierte `UniversalIsoMath`.

## ADR-007 — Deklarierte Tiefenkanten schlagen die Footline-Heuristik

Der `MultiTierDepthSorter` verwendet bei überlappenden Objekten normalerweise Tier und Fußlinie. Explizite `before`- und `after`-Kanten überschreiben die heuristische Kante für dieses Paar, damit autorisierte Regeln nicht künstlich widersprüchlich werden. Zyklen führen zu einem deterministischen Fallback und einer Liste der tatsächlichen Zyklusmitglieder.

## ADR-008 — Quality Gates vor Feature-Ausbau

`npm run validate` prüft Dateireferenzen, Manifest-/NavMesh-IDs, Spawnpositionen, Registerzählungen, Tiled-Demo und den mathematischen Round-trip. `npm test` prüft Datenverträge, Koordinatentransformation, Tiefensortierung, Tiled-Import und automatische Navigationsextraktion. Ein erfolgreicher Build ist ein technisches Basis-Gate, aber kein Beweis für vollständige Stencil-, Shader-, Mobile- oder Gamepad-Funktionalität.

## ADR-009 — Agent-Clearance und swept collision sind Bestandteil der Navigation

`agent_radius_px` ist nicht länger eine nur dokumentierte Zahl. `PolygonNavMesh.isWalkable` prüft den Agent-Mittelpunkt plus seine Clearance-Perimeterproben gegen die Vereinigung begehbarer Polygone und gegen Hindernisse. `resolveStep` überprüft Zwischenpositionen, damit dünne Kollisionen bei größeren Frametimes nicht übersprungen werden.

## ADR-010 — Pfade müssen vor der Ausgabe sicher sein

Die Wegfindung nutzt ein gecachtes feines Raster mit A* statt einen übergroßen Sichtbarkeitsgraphen. Diagonale Züge können blockierte orthogonale Zellen nicht schneiden. Nach der Glättung wird der Pfad durch `isPathSafe` erneut validiert. `npm run validate` wendet denselben Laufzeitadapter auf die echten Manifeste an und prüft jeden vorhandenen Interaktionsweg.


## ADR-011 — Occluder-Cutaway Profile

A scene's foreground slice may declare `fadeStartPx`, `fadeEndPx`, and `minAlpha`. The alpha target is reduced only when the player is behind the object's footline and the distance to its horizontal bounds is within the configured threshold. A frame-rate-independent exponential interpolation avoids visible single-frame steps. Tiled tile-objects may opt in through explicit object properties; no implicit roof fading is enabled for arbitrary tiles.

The current preview is a static compositor check. The runtime browser smoke remains a separate quality gate requiring a complete Phaser/Vite install.


## ADR-012 — Eigenes World Model oberhalb von Szenen und Tilemaps

**Entscheidung:** Die Stadt wird durch einen versionierten Weltindex und eigenständige Module beschrieben. Ein Modul nutzt lokale Meterkoordinaten und wird durch `originMeters` plus eine unterstützte 90-Grad-Rotation im Weltkoordinatensystem platziert. Bestehende `SceneManifest`-Szenen bleiben Runtime-Szenen und werden nicht zwangsweise in Stadtmodule umgewandelt.

**Begründung:** Tilemaps eignen sich für Rasterflächen, sind aber weder ein vollständiger Stadtindex noch ein Ersatz für frei gezeichnete Geometrie, Asset-Instanzen oder mehrgeschossige Modulanschlüsse.

## ADR-013 — Gemeinsame normalisierte Geometrie

**Entscheidung:** Straßenmittellinien, Wege, Wasserläufe, Grundstücke, Gebäudefußabdrücke, Plätze und Parks erhalten typisierte Geometriedatensätze in Metern. Ihre Darstellung und abgeleitete Navigation werden später aus denselben Datensätzen erzeugt.

**Begründung:** Das verhindert, dass gezeichnete Inhalte, importierte Daten und Runtime-Kollisionen zu getrennten Wahrheitsquellen werden.

## ADR-014 — Modulanschlüsse sind explizite Datenverbindungen

**Entscheidung:** Verbundene Endpunkte referenzieren sich gegenseitig. Die Validierung prüft Typ, Weltposition, entgegengesetzte Richtung und Breite mit einer Toleranz von 0,01 m für Position/Breite und 1 Grad für Richtungsabweichung.

**Begründung:** Die optische Nähe zweier Module ist kein Beweis für eine tatsächlich durchgehende Straße, Schiene oder einen begehbaren Übergang.

## ADR-015 — Sichere relative Projektpfade

**Entscheidung:** Weltindex, Asset-Katalog, Tilemaps, Referenzbilder und Assetgrafiken verwenden relative Pfade ohne absolute Pfade oder Traversal-Segmente.

**Begründung:** Projektarchive bleiben portabel und können nicht über referenzierte Dateien aus ihrem Projektbereich ausbrechen.

## ADR-016 — Hybrid-World-Model V1 ist additiv

**Entscheidung:** Der erste World-Model-Kern ergänzt `src/world/WorldModel.ts` und ein isoliertes Beispieldokument. Die bestehenden vier Bahnhofsszenen, deren Bildraum und Navigationsquellen werden nicht verändert.

**Begründung:** Ein überprüfbares Migrationsfundament ist weniger riskant als eine vorzeitige Umstellung der funktionierenden Legacy-Referenz.
