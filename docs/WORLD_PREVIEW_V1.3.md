# KLEIN BERLIN Hybrid Engine V1.3 — Implementierungsbericht

**Datum:** 28. Oktober 2026  
**Schwerpunkt:** Erster Renderer für das gemeinsame World Model

## Ergebnis

V1.3 ergänzt eine separate Vorschau-Runtime, die ein validiertes World-Model-Projekt lädt und direkt aus den gespeicherten Moduldaten eine dimetrische/isometrische Ansicht erzeugt. Die vorhandenen Bahnhof-Szenen und die bisherige SceneRuntime bleiben erhalten.

## Neu implementiert

- `src/world/IsoProjector.ts`: Meter-zu-Bildschirm-Projektion, inverse Transformation, Modulrotation, Projektion von Modulgrenzen, Bounds und Strichbreiten.
- `src/world/WorldPreviewScene.ts`: Modulflächen und -grenzen, metrisches Raster, Straßenlinien mit Breite, Platz-/Park-/Gebäudegrundriss-Flächen, Anschlussmarker und Asset-Instanzen.
- `src/world/WorldPreviewRuntime.ts`: lädt das Projekt über den bestehenden World-Project-Loader und startet eine separate Phaser-Szene.
- `src/main.ts`: `?view=world` aktiviert die neue Vorschau; ein Link in der Kopfzeile erlaubt den Wechsel zwischen World Model und vorhandener Bahnhof-Runtime.
- `tests/iso-projector.test.mjs`: fünf Tests zur Projektion und Rücktransformation.

## So startest du die Vorschau

```bash
npm ci
npm run dev
```

Öffne danach `http://localhost:5173/?view=world`. Ohne Query-Parameter startet wie bisher die Bahnhof-Runtime. In der Vorschau kannst du die Karte ziehen, mit dem Mausrad zoomen, auf die Karte klicken, um die Weltkoordinate zu sehen, und Raster, Geometrien sowie Anschlüsse ein- und ausschalten.

## Qualitätsprüfung

| Prüfung | Ergebnis |
|---|---|
| Automatisierte Tests | **62/62 bestanden** |
| Projekt-, Importgraph- und World-Model-Validierung | **Bestanden** |
| IsoProjector-Einzeldatei-Typecheck | **Bestanden** |
| Vollständiger Typecheck | **Blockiert** |
| Phaser-/Vite-Build | **Nicht bestätigt** |
| Browser-Smoke / visuelle Browser-QA | **Nicht ausgeführt** |

Der vollständige Typecheck ist durch fehlende Phaser-Abhängigkeiten blockiert. Der Installationsversuch `npm ci` konnte die Pakete nicht von der Registry abrufen (DNS-Fehler `EAI_AGAIN`). Daher wird kein erfolgreicher Gesamtbuild behauptet.

## Noch nicht Teil von V1.3

- Interaktives Zeichnen und Editieren von Straßen und Polygonen
- Referenzbild-Import mit Maßstabskalibrierung
- Drag-and-drop-Asset-Browser und persistente Änderungen aus dem Editor
- Tilemap-Import direkt in den Editor-Workflow
- Navigation/Kollision automatisch aus dem neuen Stadtmodell ableiten
- Browser-Abnahme der tatsächlichen Phaser-Darstellung

Diese Funktionen bleiben die nächsten geplanten Entwicklungsstufen.
