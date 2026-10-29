# Quellen- und Maßkonflikte — Hinweise bei der Migration

Dieses Dokument ergänzt die im eingebetteten V0.3-Audit dargestellten Konfliktzeilen. Es ändert deren Status nicht.

| Thema | Im Material genannte Werte | Umgang in V0.6 |
|---|---|---|
| Stationsrahmen / Stage-Fenster | 220×80 m im V0.3-Assetregister; 120×60 m im universellen Blueprint; 164×37 m als Hallenmaß | Nicht zusammenwerfen. Die Legacy-Stage nutzt ihre bisherige pro Szene konfigurierte Koordinatenumrechnung. Die drei Maße sind unterschiedliche Bezugsrahmen, bis die Mastergeometrie offiziell als einheitliche Definition bestätigt ist. |
| EXT-00 Offset | V0.3-Audit nennt einen 5-m-Offsetfehler und setzt den Viadukt auf X=70..290 m, Y=50..130 m | Die vorhandene EXT-Abbildung aus dem HTML wird in `EXT-00.manifest.json` deklarativ abgelegt; sie wird nicht im Engine-Code fest verdrahtet. |
| 2048×1529 gegenüber Bilddatei | Backdrop-Dateien in APP_DATA sind 1024×765 px; der alte Renderer zeichnet sie als 2048×1529 Stage | Beide Maße bleiben explizit im Manifest erhalten. Stage-Anker und NavMesh werden nicht auf halbe Pixelkoordinaten umgerechnet. |
| Projektion | Blueprint spezifiziert 2:1-Dimetrie und 256×128 px pro Makrokachel; vorhandene V0.3-Karten sind vorgerenderte Stage-Pixel mit eigener Kalibrierung | Legacy-Stages sind mit `legacy-stage-calibrated` markiert. `UniversalIsoMath` wird nur für Manifeste mit `dimetric-2-to-1` zugelassen. |
| Gebäudemaße und Lage | Asset-/Connector-Register enthalten verschiedene Messstatus, darunter `ESTIMATED`, `DERIVED` und `VERIFIED` | Ursprüngliche Statusfelder werden beibehalten. Dieser Migrationsschritt verifiziert keine externen Bauwerksmaße. |

## Entscheidungsregel

Eine neue Tiled-Map wird erst auf das mathematische Projektraster umgestellt, wenn Referenzpunkte, Rasterursprung, Maßstab, Tierhöhen und Übergangspunkte durch einen visuellen und numerischen Test bestätigt sind. Bis dahin bleiben Backdrop und Stage-Koordinaten ein unveränderter Vergleichsstand.
