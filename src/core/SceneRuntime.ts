import Phaser from 'phaser';
import { SceneManifestLoader } from './SceneManifestLoader';
import { GameScene } from '../scenes/GameScene';
import { installHud } from '../ui/HudController';

/** Bootstrap and lifecycle owner for the manifest-driven Phaser runtime. */
export class SceneRuntime {
  private readonly bus = new Phaser.Events.EventEmitter();
  private game?: Phaser.Game;

  async start(): Promise<Phaser.Game> {
    const params = new URLSearchParams(window.location.search);
    const indexPath = params.get('qa') === 'tiled-render' ? 'data/qa-scene-index.json' : 'data/scene-index.json';
    const loader = new SceneManifestLoader(undefined, indexPath);
    const project = await loader.loadAll();
    installHud(project.scenes, this.bus);
    const gameScene = new GameScene(project, this.bus);
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game-root',
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: '#050a14',
      transparent: false,
      antialias: true,
      roundPixels: true,
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: window.innerWidth,
        height: window.innerHeight,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      render: { pixelArt: false, antialias: true, roundPixels: true },
      input: { activePointers: 3 },
      scene: [gameScene],
    });
    return this.game;
  }

  destroy(): void {
    this.game?.destroy(true);
    this.game = undefined;
    this.bus.removeAllListeners();
  }
}
