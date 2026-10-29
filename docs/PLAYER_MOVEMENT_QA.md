# Spielerbewegung und Kollisions-Quality-Gate — V0.8

## Geprüfter Vertrag

Der NavMesh-Adapter interpretiert `agent_radius_px` als Clearance-Radius der Spielfigur. Der Mittelpunkt der Figur muss in einer begehbaren Fläche liegen; zusätzlich müssen die verteilten Perimeterproben um den Radius herum weiterhin in der Vereinigung begehbarer Flächen liegen. Kollisionspolygone blockieren sowohl ihren Innenraum als auch den Radiusbereich an ihrer Grenze.

`resolveStep` testet die Bewegungsstrecke in Zwischenproben. Eine Bewegung darf daher nicht von einem sicheren Punkt auf eine sichere Position hinter einer dünnen Wand springen, ohne den dazwischenliegenden Hindernisbereich zu prüfen. Bei einer Kollision werden sichere Achsenbewegungen bevorzugt; falls keine volle Teilbewegung möglich ist, sucht eine binäre Suche den letzten sicheren Punkt.

## Pfadfindung

Der Suchraum wird beim ersten Pfadbedarf als fein aufgelöstes Grid aus den Grenzen der begehbaren Polygone aufgebaut und für weitere Ziele der aktuellen `PolygonNavMesh`-Instanz wiederverwendet. A* verwendet acht Nachbarrichtungen, sperrt Diagonalschritte durch blockierte orthogonale Zellen und prüft die Kanten gegen die laufende Clearance-Regel. Pfadglättung ist nur akzeptabel, wenn `isPathSafe` den gesamten Weg erneut bestätigt.

## Regressionsfälle

- Ein synthetischer dünner Wandstreifen kann nicht durch einen großen Bewegungsschritt überquert werden.
- Der Abstand der Agent-Mitte zu einer Kante bzw. einem Hindernis wird geprüft.
- Ein Weg durch ein Hindernis wird über einen begehbaren Umweg geführt.
- Alle fünf Interaktionsziele von CON-01 sind vom Spawn aus erreichbar, ohne registrierte Hindernisse oder verbotene Randzonen zu kreuzen.
- Alle Interaktionsziele in EXT-00, RAIL-02 und UG-03 erfüllen denselben Weg-Sicherheitsvertrag.

## Reproduzierbare Befehle

```bash
npm test
npm run validate
npm run typecheck:navigation
npm run qa:movement
```

Der deterministische Routen-Snapshot ist `docs/qa/CON01_MOVEMENT_ROUTE_TRACE.json`. Die zugehörige Overlay-Vorschau ist `docs/qa/CON01_MOVEMENT_QA_PREVIEW.jpg`.

## Einschränkungen

Diese Prüfungen belegen geometrische Laufwegsicherheit anhand der vorhandenen Polygonregister. Sie ersetzen keinen echten Desktop-/iOS-Safari-Test und bestätigen nicht die noch offene vollständige visuelle Verdeckung mit Stencil-/Cutaway-Effekten. Die vermessungsbezogenen Herkunfts-/Sicherheitsstatus vorhandener Geometrien bleiben unverändert.
