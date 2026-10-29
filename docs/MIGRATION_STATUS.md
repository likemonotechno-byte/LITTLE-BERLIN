# Migrationsstatus — KLEIN BERLIN Engine V1.1

## Bewahrt

- Unveränderte Produktionsszene-IDs: `CON-01`, `EXT-00`, `RAIL-02`, `UG-03`.
- Vier ursprüngliche Bahnhof-Stage-Bilder, zehn CON-01-Slices, Spielerspritesheet, NavMesh-Baselines und die Register mit 17 Connectoren, 23 Asset-Datensätzen und vier Trace-Szenen.
- CON-01-Tiled-Objekt-Layer bleiben autoritative Navigationsquelle und stimmen mit dem Legacy-Datensatz auf unter 0,01 Stage-Pixel überein.
- Die visuelle QA-Demo liegt in einem separaten `qa-scene-index.json`; sie erweitert nicht den Produktions-Szenenindex.

## V1.1 neu

- `TiledDepthLayer.ts` erkennt Actor-Depth-Layer, validiert Layer-Cutaway-Profile und löst globale Tiled-GIDs über `firstgid` zu Atlas und lokaler Frame-ID auf.
- `GameScene` wandelt belegte Zellen opt-in depth-sortierter Tiled-Tile-Layer in einzelne Phaser-Sprites um. Jedes Tile nimmt mit seinen Screen-Bounds und seiner Fußlinie am `MultiTierDepthSorter` teil. Normale Ground-Layer bleiben native, gebatchte Phaser-Tile-Layer.
- Neuer `KBRadialRoofCutaway`-PostFX-Shader. Er erzeugt in WebGL eine kreisförmige Alpha-Maske um den Spielerfuß, skaliert mit den Cutaway-Profilen des Tiled-Layers/Objekts. Per-Objekt-Uniforms werden im Phaser-PostFX-`postBatch`-Pfad vor dem Draw gesetzt; Canvas nutzt den Alpha-Fallback. UV-Y folgt Phasers PostFX-Quad-Konvention (Bildoberkante = v 1).
- Neue Atlas-Datei `public/assets/tilesets/demo-roof.png`; der 2×2-Roof-Test im Tiled-Demo verwendet GIDs 3–4.
- `?qa=tiled-render` lädt isoliert die Testkarte. Die automatische Browser-QA prüft jetzt drei Fälle: Desktop-Produktion, Mobile-Produktion und Desktop-Tiled-Render-QA.
- Zusätzliche Helper-/Daten-Tests und QA-Index-Validierung.

## Quality Gates

- [x] `npm test`: 46 Tests bestanden, darunter statische API-Vertragstests für den PostFX-Renderpfad und die Pipeline-Registrierung.
- [x] `npm run validate`: Manifest, Assets, Navigationsparität, 9 sichere Interaktionsrouten und Roof-Render-QA bestanden.
- [x] `npm run typecheck:navigation`: bestanden, inklusive Tiled-Depth-Layer-Helper.
- [x] Produktionsindex unverändert auf vier Szenen; separater Render-QA-Index geprüft.
- [x] ZIP-Archiv und enthaltene Daten auf Konsistenz geprüft.
- [ ] Vollständiges `npm run typecheck` mit installierten Phaser-/Vite-Abhängigkeiten.
- [ ] `npm run build` und echter Chromium-Browserlauf mit erfolgreich geladenem Phaser-Canvas.
- [ ] Visuelle Laufzeit-QA für Tile-Positionierung, Dach-Cutaway und Performance auf Desktop und iOS Safari.

## Build-Grenze

Der isolierte Engine-/Tiled-Kern und die Datenvalidierung bestehen. Der vollständige Typecheck zeigt, dass `phaser` und `vite` nicht installiert sind; die daraus folgenden fehlenden Phaser-Basistypen sind keine gültige Bestätigung oder Widerlegung des gesamten GameScene-Typechecks. Der npm-Registry-Zugriff scheitert derzeit mit `EAI_AGAIN`. Deswegen sind Shader- und Browserverhalten noch als unbestätigt markiert, bis der Build in einer Umgebung mit installierten Lockfile-Abhängigkeiten ausgeführt wurde.


### V1.1 (Release-QA-Härtung)

- `always-front` als explizite Actor-Depth-Layer-Rolle integriert.
- Browser-QA löscht alte Screenshot-Artefakte vor einem neuen Lauf und übergibt die aufgelöste URL an Chromium; ein Regressionstest schützt diesen Pfad.
- Importgraph-Validierung in den Projekt-Validator integriert.
- Release-Check bündelt offline ausführbare Tests und meldet fehlende Laufzeit-/Build-Abhängigkeiten mit Status `BLOCKED`.
- Voller Phaser-/Vite-Build und Browserlauf weiterhin offen: fehlende lokale npm-Pakete; Registry DNS nicht erreichbar.
- `package-lock.json` ist im Projektarchiv vorhanden; `npm ci` und die Laufzeitinstallation sind bis zu einer erneuten Ausführung mit erreichbarer Registry unbestätigt.
