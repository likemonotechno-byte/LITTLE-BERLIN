# Release-Check — KLEIN BERLIN Engine V1.1

**Datum:** 28.10.2026

## Ergebnis

| Gate | Ergebnis | Beleg |
|---|---|---|
| Automatisierte Tests | PASS | `npm test` — 46/46 bestanden |
| Projekt-/Datenvalidierung | PASS | `npm run validate` — alle Szenen-, Asset-, Navigations- und Importgraph-Prüfungen bestanden |
| Isolierter Navigation-Typecheck | PASS | `npm run typecheck:navigation` |
| Skript-Syntax | PASS | `node --check` für `browser-smoke.mjs`, `release-check.mjs` und `validate-source-graph.mjs` |
| Phaser-/Vite-Produktionsbuild | BLOCKED | Lokale `phaser`, `vite`, `typescript`-Pakete fehlen; npm-Registry konnte nicht aufgelöst werden |
| Chromium-Browser-Smoke | BLOCKED | `npm run qa:browser` beendet sich mit Exit-Code 2 und benennt fehlende Pakete |
| Lockfile | VORHANDEN, Installation offen | `package-lock.json` ist im Archiv enthalten; `npm ci` wurde in dieser Umgebung noch nicht neu ausgeführt |

## Netzwerkfehler

Ein Versuch, `phaser@3.90.0` über npm abzurufen, scheiterte mit `EAI_AGAIN` bei `registry.npmjs.org`. Deshalb konnte keine vollständige Installation durchgeführt werden. Ein `package-lock.json` ist im Archiv vorhanden; seine Neuinstallation wurde noch nicht verifiziert. Dieser Release-Check unterscheidet `PASS` der offline ausführbaren Gates strikt vom blockierten Produktionsbuild und gibt in diesem Fall Exit-Code 2 zurück.

## Wiederaufnahme auf einem verbundenen Entwicklungsgerät

```bash
npm install
npm run release-check
```

Der Release ist erst vollständig, wenn `npm run build` und alle drei Chromium-Smoke-Fälle auf Desktop/Mobile/Render-QA erfolgreich laufen.
