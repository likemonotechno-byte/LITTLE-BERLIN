import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readSource = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');

test('radial PostFX applies object uniforms in postBatch after binding and before drawing', async () => {
  const source = await readSource('../src/rendering/RadialCutawayPostFXPipeline.ts');
  const start = source.indexOf('postBatch(gameObject?');
  const end = source.indexOf('private applyObjectUniforms', start);
  assert.ok(start >= 0 && end > start, 'PostFX postBatch override must be present');
  const hook = source.slice(start, end);
  const bindIndex = hook.indexOf('this.bind(this.currentShader)');
  const uniformsIndex = hook.indexOf('this.applyObjectUniforms(gameObject ?? this.gameObject)');
  const drawIndex = hook.indexOf('return super.postBatch(gameObject)');
  assert.ok(bindIndex >= 0 && uniformsIndex > bindIndex && drawIndex > uniformsIndex,
    'shader bind -> per-object uniforms -> base PostFX draw ordering must be preserved');
  assert.match(source, /actorPositionToTextureUv\(binding\.actorX, binding\.actorY, bounds\)/);
});

test('custom PostFX is registered through Phaser 3.90 postPipelineClasses map', async () => {
  const source = await readSource('../src/scenes/GameScene.ts');
  assert.match(source, /pipelines\.postPipelineClasses\.has\(RADIAL_CUTAWAY_PIPELINE_KEY\)/);
  assert.match(source, /pipelines\.addPostPipeline\(RADIAL_CUTAWAY_PIPELINE_KEY, RadialCutawayPostFXPipeline\)/);
  assert.doesNotMatch(source, /pipelines\.hasPostPipeline\(/,
    'hasPostPipeline is a Game Object property, not a PipelineManager method');
});
