# Tiled Object-Layer Navigation & Occlusion — V0.8

## Two supported coordinate contracts

### Projected-world Tiled scene

A new modular scene declares `renderSpace.mode: "projected-world"`, `coordinateSpace: "world-meter"` and `grid.projection: "dimetric-2-to-1"`. The canonical macro tile is 10×10 m with a 256×128 px 2:1-dimetric tile metric. `UniversalIsoMath` maps meter coordinates and tier elevation into rendered pixels.

### Legacy-stage Tiled navigation overlay

`CON-01` is the first scene migrated to a Tiled object-layer source without rewriting its reference artwork. The map uses the original 1024×765 background image as a Tiled image layer. Object positions/polygons are written in those source-image pixels. The manifest's `renderSpace.imageScaleX/Y` transforms geometry into the 2048×1529 Phaser stage-pixel space used by the existing renderer and player movement.

This is a transitional overlay contract, **not** a newly surveyed or fully re-tiled world. The overlay's 64×32 Tiled editor grid is native-image-scaled and must not be confused with the canonical 256×128 px tile metric used for new projected-world scenes. Its map `width/height` is an editor viewport extent including vertical architecture; `kbMacroCols`, `kbMacroRows` and `kbMacroTileMeters` record the retained 22×8 / 10 m legacy macro-grid metadata.

`CON-01.manifest.json` declares `navmeshData: null` and `navigationSource: "tiled-object-layers"`. The runtime derives its six walkable polygons, seven collision polygons, seven connectors and five interactions from `public/data/maps/CON-01.tiled.json`. `public/data/navmeshes/CON-01.json` remains as a non-authoritative comparison/baseline snapshot for regression checks.

See [`CON01_TILED_NAV_OVERLAY_PREVIEW.jpg`](CON01_TILED_NAV_OVERLAY_PREVIEW.jpg) for a generated overlay rendering the Tiled geometry on top of the source artwork.

## Layer naming convention

Recommended names are `walkable_tier_0`, `collision_tier_0`, `connectors_tier_0`, `interactions_tier_0` and `occluders_tier_0`. Nested group names are retained as `Group/Layer`. Layer properties `navigationRole`, `navRole` or `role` can declare a semantic role. An object's `navigationRole`, `navRole`, `kbRole`, `role`, `kind`, `class` or `type` can override the layer role.

| Role | Geometry | Runtime output |
|---|---|---|
| `walkable` | Closed polygon, ellipse or rectangle | `walkable_polygons[]` |
| `collision` / `obstacle` | Closed polygon, ellipse or rectangle | `collision_polygons[]` |
| `connector` / `portal` / `elevator` / `stairs` | Polygon, ellipse, rectangle or point with trigger geometry | `connector_zones[]` |
| `interaction` / `hotspot` | Point or shape; optional `radiusPx` | `interaction_zones[]` |
| `occluder` | Geometry and/or Tiled tile-object | Depth descriptor for the DAG |
| Tiled tile-object with `gid` | Tile-object bounds | Separate Phaser sprite and depth descriptor |

## Object properties

- Walkable: `allowed` (boolean), `floorZ` (number), `speedModifier` (number), optional `polygonId`.
- Collision: `obstacleId`, `floorZ`, `heightMeters`.
- Connector: `connectorId`, `zoneId`, `connectorType`, `targetMap`, `targetLevel`, `label`, `zFrom`, `zTo`.
- Interaction: `interactionId`, `interactionType`, `title`, `description`, `radiusPx`.
- Depth/occlusion: `tier`, `footSy`, `depthBefore`, `depthAfter`, `renderRole`.

`depthBefore` and `depthAfter` accept a string such as `"51, 52"` or a numeric value. Numeric IDs are normalized to `tiled-{SCENE_ID}-obj-{OBJECT_ID}`. A cycle is broken deterministically and reports the actual cycle members.

## Geometry processing

Tiled polygon vertices are local to the object origin. The extractor applies object and layer offsets, object rotation, and then optional `coordinateScaleX/Y`. Rectangles and ellipses are converted to closed polygons (ellipses use a 16-point approximation). Non-finite or invalid polygons are rejected by the importer/extractor.

The coordinate scaling is explicit manifest data, not a hidden scene-ID branch. It keeps the stage-pixel map, object overlay and runtime navmesh aligned while preserving the canonical projected-world system for new scenes.

## Runtime behavior

- Walkable/collision/connector polygons load into `PolygonNavMesh` for movement, click-to-move and debug overlays.
- Interactions feed the existing interaction system.
- Tiled tile-objects with visual GIDs are individual Phaser sprites and can be depth-sorted with the player.
- Explicit `before`/`after` edges override the same-tier footline heuristic.
- Ordinary tile layers currently use layer depth as a whole. They are not yet split into individual depth-sorted tiles.

## Limitations / quality gates

- Infinite/chunk maps and Base64/compressed tile layers are not supported.
- The CON-01 overlay is sourced from existing V0.6 geometry; it does not upgrade approximate metadata into verified measurements.
- It uses the existing pre-rendered backdrop. A fully modular ground/tile reconstruction is not finished.
- Full cutaway/stencil and shader-based roof removal are not finished.
- Full Phaser browser build and visual interaction tests remain pending until dependencies can be installed and a browser run verified.


## V0.8 — Bewegungssicherheit

Die abgeleiteten NavMesh-Daten werden jetzt mit `PolygonNavMesh` ausgeführt, das `agent_radius_px` respektiert, Swept Collision in `resolveStep` ausführt und sichere Wege über ein gecachtes Grid mit A* findet. `npm run validate` testet sichere Wege zu den Interaktionszielen. Die komplette Browser-/Stencil-Verdeckung bleibt ein separates, noch offenes Quality Gate.
