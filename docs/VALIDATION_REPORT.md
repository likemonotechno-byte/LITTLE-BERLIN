# Validierungsbericht — KLEIN BERLIN Engine V1.1

**Datum:** 28.10.2026  
**Stand:** Datengetriebener Tiled-Tile-Depth-/Roof-Cutaway-Pfad implementiert; voller Phaser-Browserbuild bleibt offen, bis die npm-Abhängigkeiten installiert werden können.

## Bestätigte Prüfungen

| Prüfung | Ergebnis | Umfang |
|---|---|---|
| `npm test` | BESTANDEN | 46/46 Tests für Manifeste, 2:1-Mathematik, Tiled-Import, Clearance, Swept Collision, A*-Umwege, Szenenrouten, Depth-DAG, Cutaway-Profile, UV-Orientierung, PostFX-API-Verträge und Datenparität |
| `npm run validate` | BESTANDEN | Vier Produktionsszenen, vorhandene Assets/Register, Tiled-Demo, Roof-Atlas, 9 sichere Interaktionsrouten, CON-01-Geometrieparität und 2:1-Transformations-Roundtrip |
| `npm run typecheck:navigation` | BESTANDEN | Isolierter strikter TypeScript-Check des Manifest-/Koordinaten-/Tiled-/Navigationskerns inklusive `TiledDepthLayer.ts` |
| `node --check scripts/browser-smoke.mjs` | BESTANDEN | Syntax des dreiteiligen Browser-Smoke-Runners geprüft |
| ZIP-Integrität | BESTANDEN | Finales Release-Archiv mit `unzip -t` geprüft; keine Fehler im komprimierten Archiv. |

## Noch nicht bestätigt

- `npm run typecheck` ist durch fehlende Abhängigkeiten blockiert. `phaser` ist nicht installiert; dadurch meldet TypeScript auch Folgefehler bei Phaser-Basisklassen und deren Methoden. Das ist kein vollständiger Typecheck des Spiels.
- `npm install --fetch-retries=0 --fetch-timeout=10000 --prefer-online` scheiterte mit `EAI_AGAIN` bei der DNS-Auflösung von `registry.npmjs.org` (Phaser). Es liegt daher kein vollständiges `node_modules` vor. Das Projektarchiv enthält ein `package-lock.json`, dessen saubere Neuinstallation durch `npm ci` noch nicht bestätigt wurde.
- `npm run qa:browser` beendet sich erwartungsgemäß mit Status 2 und meldet die fehlenden Pakete `phaser` und `vite`. Es gab keinen bestätigten Phaser-Browserlauf und keine echten Desktop-/iOS-Safari-Tests.
- `npm run build` wird beim Typecheck blockiert, weil Phaser-Typen nicht installiert sind; es wurde kein Produktionsbundle erzeugt.
- Shader-Draw und tatsächliche Phaser-Positionierung der Einzel-Sprites sind in Code und isolierten Daten-/Mathetests vorbereitet, aber erst durch einen erfolgreichen Browser-Smoke-Lauf freigegeben.

## Reproduzierbare Prüfung auf dem Entwicklungsgerät

Mit Node.js 22.6+ und Netzwerkzugriff:

```bash
npm install
npm test
npm run validate
npm run typecheck:navigation
npm run typecheck
npm run build
npm run qa:browser
```

Die vier Bahnhofsebenen, vorhandenen Assetregister, NavMesh-Baselines und das ursprüngliche V0.3-Referenz-HTML bleiben im Paket. Die Render-QA-Demo steht in einem separaten Index und gelangt nicht in die Produktions-Szenenliste.


## V1.1 Release-QA-Härtung

- Lokale Import-/Export-Spezifizierer werden auf vorhandene Dateien geprüft; externe Imports müssen in `dependencies` oder `devDependencies` deklariert sein.
- `renderRole=always-front` wird vom Tiled-Layer-Erkenner akzeptiert.
- Browser-Smoke entfernt vorige Screenshots vor einem neuen Versuch.
- `npm run release-check` trennt bestandene Offline-Tests vom blockierten Produktionsbuild.
- Das Lockfile ist im Archiv vorhanden; die Registry-Erreichbarkeit blockiert derzeit die Installation der Abhängigkeiten.
