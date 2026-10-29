# Browser-QA — KLEIN BERLIN Engine V1.1

## Voraussetzungen

- Node.js 22 oder kompatibel mit `--experimental-strip-types`
- `npm install` erfolgreich abgeschlossen (Phaser 3.90.0, Vite 6.3.5, TypeScript 5.8.3)
- Chromium oder Google Chrome installiert; optional `CHROMIUM_BIN=/path/to/chromium`

## Befehle

```bash
npm install
npm test
npm run validate
npm run typecheck:navigation
npm run typecheck
npm run build
npm run qa:browser
```

`qa:browser` startet Vite auf einem lokalen Port und öffnet die Anwendung headless über Chromium in drei Fällen: Produktionsszene auf Desktop (1365×900) und Mobil (390×844) sowie die isolierte Tiled-Render-QA-Szene auf Desktop (`?qa=tiled-render`). Der Test verlangt, dass Phaser einen Canvas erzeugt und der sichtbare Ladefehler-Dialog nicht geöffnet ist. Screenshots werden unter `docs/qa/browser-smoke-desktop.png`, `docs/qa/browser-smoke-mobile.png` und `docs/qa/browser-smoke-tiled-render.png` abgelegt.

## Ergebnis der aktuellen Arbeitsumgebung

Der isolierte Core-Typecheck, die Node-Tests und `npm run validate` können lokal laufen. Der vollständige Browser-Smoke-Test wurde noch nicht erfolgreich ausgeführt, da in der Arbeitsumgebung `node_modules/phaser` und `node_modules/vite` fehlen. Der npm-Registry-Zugriff ist zuvor mit `EAI_AGAIN`/Timeout gescheitert. Deshalb sind weder Produktionsbuild noch browserseitige Laufzeit, Renderer, Canvas-Erzeugung und echte Touch-Eingaben als bestanden markiert.

`docs/qa/CUTAWAY_ALPHA_PREVIEW.jpg` ist ein statischer Image-Compositing-Test, kein Chromium-Screenshot.


## Render-QA-Szene

Die Produktionsszene-Liste bleibt unverändert. Für den isolierten Tile-Layer-Depth-/Dach-Cutaway-Test kann die Anwendung mit `?qa=tiled-render` gestartet werden. Dieser Parameter wählt `public/data/qa-scene-index.json` mit genau einer Tiled-Demo. So gelangen Engineering-Testkarten nicht in den eigentlichen Szenenindex.
