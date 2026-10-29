import Phaser from 'phaser';
import { actorPositionToTextureUv, type RadialCutawayBinding } from '../tiled/TiledDepthLayer';

export const RADIAL_CUTAWAY_PIPELINE_KEY = 'KBRadialRoofCutaway';

const FRAGMENT_SHADER = `
#define SHADER_NAME KLEIN_BERLIN_RADIAL_ROOF_CUTAWAY
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uActorUV;
uniform vec2 uObjectSize;
uniform float uFadeStartPx;
uniform float uFadeEndPx;
uniform float uMinAlpha;
uniform float uEnabled;
varying vec2 outTexCoord;
void main () {
    vec4 color = texture2D(uMainSampler, outTexCoord);
    float distancePx = length((outTexCoord - uActorUV) * uObjectSize);
    float edge = smoothstep(uFadeStartPx, uFadeEndPx, distancePx);
    float radialAlpha = mix(uMinAlpha, 1.0, edge);
    float visibility = mix(1.0, radialAlpha, uEnabled);
    color *= visibility;
    gl_FragColor = color;
}
`;

type GameObjectWithBounds = Phaser.GameObjects.GameObject & {
  getBounds?: () => Phaser.Geom.Rectangle;
  getData?: (key: string) => unknown;
};

/**
 * WebGL-only radial roof cutaway. Each sprite carries its actor/profile data so
 * Phaser can bind different uniforms for every sprite while sharing this shader.
 * Canvas renderers deliberately use the alpha-fade fallback from GameScene.
 */
export class RadialCutawayPostFXPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game: Phaser.Game) {
    super({ game, name: RADIAL_CUTAWAY_PIPELINE_KEY, fragShader: FRAGMENT_SHADER });
  }

  /**
   * PostFX pipelines are invoked through postBatch, not the ordinary game-object
   * PipelineManager.onBind hook. Bind the shader first, then write per-object
   * uniforms before the base postBatch draws the effect.
   */
  postBatch(gameObject?: Phaser.GameObjects.GameObject | Phaser.Cameras.Scene2D.Camera): this {
    if (!this.hasBooted) {
      this.bootFX();
      if (this.currentRenderTarget) this.currentRenderTarget.bind();
    }

    this.bind(this.currentShader);
    this.applyObjectUniforms(gameObject ?? this.gameObject);
    return super.postBatch(gameObject);
  }

  private applyObjectUniforms(gameObject?: Phaser.GameObjects.GameObject | Phaser.Cameras.Scene2D.Camera): void {
    const object = gameObject as GameObjectWithBounds | undefined;
    const binding = object?.getData?.('kbRadialCutaway') as RadialCutawayBinding | undefined;
    const bounds = object?.getBounds?.();
    if (!binding || !bounds || bounds.width <= 0 || bounds.height <= 0) {
      this.set2f('uActorUV', -1000, -1000);
      this.set2f('uObjectSize', 1, 1);
      this.set1f('uFadeStartPx', 0);
      this.set1f('uFadeEndPx', 1);
      this.set1f('uMinAlpha', 1);
      this.set1f('uEnabled', 0);
      return;
    }
    const actorUv = actorPositionToTextureUv(binding.actorX, binding.actorY, bounds);
    this.set2f('uActorUV', actorUv.u, actorUv.v);
    this.set2f('uObjectSize', bounds.width, bounds.height);
    this.set1f('uFadeStartPx', binding.fadeStartPx);
    this.set1f('uFadeEndPx', binding.fadeEndPx);
    this.set1f('uMinAlpha', binding.minAlpha);
    this.set1f('uEnabled', binding.enabled ? 1 : 0);
  }
}
