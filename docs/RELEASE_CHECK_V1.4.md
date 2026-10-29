# Release-Check — KLEIN BERLIN Hybrid Engine V1.4

**Datum:** 28. Oktober 2026

## Prüfergebnisse

| Quality Gate | Ergebnis | Beleg |
|---|---|---|
| Automatisierte Tests | PASS | `node --experimental-strip-types --test tests/*.test.mjs` — 72/72 (auch im frisch entpackten Release-ZIP erneut ausgeführt) |
| Bestandsprojekt-Validierung | PASS | `node --experimental-strip-types scripts/validate-project.mjs` |
| Importgraph-Validierung | PASS | `node scripts/validate-source-graph.mjs` |
| World-Model-Validierung | PASS | 2 Module, 5 Bestandsgeometrien, 2 Anschluss-Endpunkte; auch im frisch entpackten Release-ZIP erneut validiert |
| WorldModel/WorldDraft/WorldEditorModel Strict TypeScript | PASS | Direkter isolierter `tsc`-Aufruf mit leerem `typeRoots` |
| WorldPreviewRuntime/WorldPreviewScene Integrationstypen | PASS WITH SHIM | Temporärer minimaler Phaser-API-Stub für Struktur-/Typfehler; offizielle Phaser-Typen waren nicht verfügbar |
| Visual-QA-Vorschauen | PASS | Drei PNGs reproduzierbar aus dem World-Model-Testdatensatz erzeugt |
| Vollständiger Phaser/Vite-Build | BLOCKED | `npm ci` scheitert am DNS-Zugriff auf `registry.npmjs.org` (`EAI_AGAIN`) |
| Release-ZIP | PASS | Archivtest ohne beschädigte Einträge; Tests, Projekt-, Source-Graph- und World-Model-Prüfung aus entpacktem Archiv bestanden |
| Tatsächlicher Phaser-Browser-Smoke | NOT RUN | Kein verifizierter Vite-/Phaser-Browserlauf vorhanden |

## Bewertung

V1.4 erweitert das World Model um erste bearbeitbare Straßen- und Flächengeometrie, einen Gebäudegrundriss-Platzhalter, Undo, Browser-Draft-Persistenz und JSON-Export. Die neuen Datenoperationen und die Projektintegrität werden automatisiert geprüft. Das Paket ist ein **Engineering-Checkpoint, kein vollständig visuell freigegebener Produktionsbuild**, weil offizielle Laufzeitabhängigkeiten und ein echter Browser-Test in dieser Umgebung nicht verfügbar waren.

## Nächster Test nach erfolgreicher Installation

```bash
npm ci
npm run release-check
npm run qa:browser
```

Danach insbesondere prüfen, dass Klickkoordinaten auf beiden Modulen korrekt in lokale Meter umgerechnet werden, neu gezeichnete Geometrien sofort erscheinen, Undo den vorherigen Zustand wiederherstellt und der JSON-Export nach erneutem Laden wieder eingelesen werden kann.
