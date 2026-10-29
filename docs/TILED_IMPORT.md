# Tiled-JSON-Import — Engine V0.8

## Ziel

Der neue Importpfad unterscheidet klar zwischen den vorgerenderten V0.3-Stage-Szenen (`pre-rendered-stage`) und neuen echten Karten (`projected-world`). Der Tiled-Importer wird nur ausgeführt, wenn das Szenenmanifest `tiledMapJson` setzt. Dadurch werden alte Stage-Pixel nicht versehentlich durch Tilekoordinaten oder das neue 2:1-Raster interpretiert.

## Verbindliche Tiled-Einstellungen

- Map Orientation: **Isometric (Diamond)** (`orientation: "isometric"` im JSON).
- Rastermaß im aktuellen Blueprint: **256×128 Pixel je Raute**.
- Export: Tiled JSON mit normalem `data: number[]` für endliche Tile-Layer.
- Tilesets: Atlas-basiert, ein gemeinsames Bild pro Tileset. Externe TSJ-Definitionen dürfen referenziert werden; der Loader löst sie auf und bettet die Definitionen vor dem Übergang an Phaser in das Map-JSON ein.
- Layernamen sind stabile IDs. Gruppen werden als `Gruppe/Layer` abgeflacht.
- Für ganze Vordergrund-Layer kann die Custom Property `renderRole = "foreground"` oder `renderRole = "roof"` gesetzt werden. Alternativ erkennt die Laufzeit entsprechende Layernamen wie `foreground_roof`.
- Für Navigation werden Objekt-Layer bevorzugt `walkable_tier_0`, `collision_tier_0`, `connectors_tier_0`, `interactions_tier_0` und `occluders_tier_0` benannt. Vollständige Rollenkonventionen stehen in `TILED_NAVIGATION.md`.
- Für Navigation werden Objekt-Layer bevorzugt `walkable_tier_0`, `collision_tier_0`, `connectors_tier_0`, `interactions_tier_0` und `occluders_tier_0` benannt. Vollständige Rollenkonventionen stehen in `TILED_NAVIGATION.md`.

## Was der Importer prüft

- Map-JSON-Form, Orientierung, positive Abmessungen und 2:1-Verhältnis.
- Übereinstimmung der Tiled-Kachelmaße mit `grid.tilePixelWidth` / `grid.tilePixelHeight` im Manifest.
- Datenlänge der Tile-Layer, nichtnegative ganzzahlige GIDs, Objektpositionen und Polygonpunkte.
- Sortierung der `firstgid`-Werte, gültige Tileset-Metriken und auflösbare Bildpfade.
- Grenzen der Assetpfade: relative Pfade dürfen den `public`-Assetbereich nicht verlassen.

## Derzeitige Grenzen

- Infinite Maps mit Chunks werden noch nicht in eine endliche Runtime-Map konvertiert.
- Base64-/komprimierte Tile-Layer werden noch nicht decodiert; bitte ein JSON mit ausgeschriebenen `data`-Arrays exportieren.
- Tiled-Image-Collections (je Tile ein eigenes Bild) werden von Phaser 3.90 in diesem Pfad nicht unterstützt. Bitte ein gemeinsames Atlas-Bild verwenden.
- Objekt-Layer werden importiert und stehen der Laufzeit zur Verfügung. Ihre Polygone werden in diesem Schritt noch **nicht automatisch** in `NavMeshData`, Connector-Zonen oder Interaktionszonen umgewandelt. Bis zur NavMesh-Ableitung bleibt `navmeshData` ein expliziter Manifest-Verweis.
- Die nativen Phaser-Tile-Layer erhalten eine Grund-/Vordergrund-Tiefenstaffelung. Vollständige dynamische Tiefensortierung zwischen Spielfigur und beliebigen Tiled-Objekten ist Teil des späteren Occlusion-DAG-Meilensteins.

## Technischer Smoke-Test

`public/data/maps/examples/isometric-diamond-demo.json` zeigt ein kleines endliches Isometric-Diamond-Map-JSON mit Atlas-Tileset, Ground-Layer, Objekt-Layer und `foreground_roof`. Die Map ist bewusst nicht in `scene-index.json` registriert und verändert daher die vier bestehenden Bahnhofsebenen nicht.

Das isolierte `TILED-NAV-DEMO`-Manifest unter `public/data/scenes/examples/` demonstriert das Schema ohne die produktiven vier Bahnhofsebenen zu verändern. Es ist bewusst nicht in `scene-index.json` eingetragen.

Das isolierte `TILED-NAV-DEMO`-Manifest unter `public/data/scenes/examples/` demonstriert das Schema ohne die produktiven vier Bahnhofsebenen zu verändern. Es ist bewusst nicht in `scene-index.json` eingetragen.

Automatisierte Tests:

```bash
npm test
npm run validate
npm run typecheck
npm run build
```
