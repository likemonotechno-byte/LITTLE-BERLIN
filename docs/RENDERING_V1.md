# V1.0 Rendering: per-tile depth and radial roof cutaway

## Actor-depth Tile-Layer contract

A Tiled `tilelayer` is normally a single Phaser `TilemapLayer`, so it has one depth value and cannot move behind/in front of a player independently at each occupied cell. V1.0 adds an opt-in conversion path for layers that declare any of:

- `renderRole: foreground | roof | canopy | upper-front | actor-sort | occluder`
- `depthSortTiles: true`
- one of the conventional names `foreground`, `foreground_roof`, `roof`, `canopy`, `upper-front`, `actor-sort`

The runtime still creates the native TilemapLayer and asks Phaser to resolve the isometric cell positions. The layer is hidden and each occupied tile cell is promoted to an individual Sprite. Its bounds and bottom footline then enter `MultiTierDepthSorter` alongside foreground slices, tile-objects and the player. The native TilemapLayer remains visible for ordinary base/ground layers so camera culling and rendering batching are preserved there.

Atlas selection uses the global GID from Phaser's normalized `Tile.index`, resolves it against sorted `firstgid` values, and sets the Sprite frame to `gid - firstgid`. Tileset `tileoffset`, layer origin, cell flip flags and rotation are carried over.

## Radial roof shader

For a foreground layer or object with `cutawayEnabled: true`, the following optional Tiled properties configure the shader:

- `cutawayFadeStartPx` (default 32)
- `cutawayFadeEndPx` (default 160)
- `cutawayMinAlpha` (default 0.22, range 0–1)

In WebGL, the `KBRadialRoofCutaway` PostFX pipeline applies a radial alpha mask centered at the player foot point, with pixel-distance smoothstep interpolation. It only activates while the player is behind the tile/object footline and within the configured fade end distance. The per-object binding is refreshed each frame to avoid global-uniform conflicts across independently rendered cells. Uniforms are applied in the PostFX `postBatch` path before the postprocess draw (not the ordinary renderer `onBind` hook). The actor Y coordinate is inverted when converted to UV because the Phaser PostFX quad maps the top edge to `v = 1`. When Phaser runs with Canvas instead of WebGL, the engine intentionally falls back to the existing whole-object smooth alpha fade; shader behavior is not claimed on Canvas.

## Isolated QA scene

The production index still lists only `CON-01`, `EXT-00`, `RAIL-02` and `UG-03`. Open the development runtime with `?qa=tiled-render` to load `public/data/qa-scene-index.json`; it contains only `TILED-NAV-DEMO`. That map contains a base tile layer and four roof-atlas cells set to actor-depth sorting plus cutaway. Browser QA expects the active-scene label to read `TILED-NAV-DEMO` and writes `docs/qa/browser-smoke-tiled-render.png` when dependencies and Chromium are available.

## Performance and known limits

Promoting every non-empty tile in an actor-depth layer creates one Sprite per occupied cell. This is appropriate for relatively small foreground roofs, canopies, parapets, bridges and other occluders, not a full-city ground layer. Large decorative tile layers should remain batched ground layers or be chunked into smaller actor-depth sections. Standard background tile layers still render as Phaser TilemapLayers. The QA atlas is illustrative engineering art and is not a production Bahnhof asset.

The current workspace has not installed Phaser/Vite because npm registry resolution is currently failing; therefore the shader class and browser rendering still need the full production build and browser-smoke pass before the feature can be called runtime-verified.

## Phaser API references

- [Phaser 3.90 PipelineManager](https://docs.phaser.io/api-documentation/3.90.0/class/renderer-webgl-pipelinemanager): custom PostFX classes are registered with `addPostPipeline` and stored in `postPipelineClasses`; the object-level `hasPostPipeline` flag is not a PipelineManager method.
- [Phaser 3.90 WebGLPipeline](https://docs.phaser.io/api-documentation/3.90.0/class/renderer-webgl-webglpipeline): `onBind` is the standard game-object pipeline hook, while PostFX pipelines are processed through `postBatch`.
