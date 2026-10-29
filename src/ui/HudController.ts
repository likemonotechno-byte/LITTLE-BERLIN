import type Phaser from 'phaser';
import type { InteractionAction, InteractionPayload } from '../scenes/GameScene';
import type { LoadedScene } from '../core/SceneManifest';

type Telemetry = {
  sceneId: string; displayName: string; levelLabel: string;
  xPx: number; yPx: number; xMeters: number; yMeters: number; zMeters: number;
  moneyEur: number; hasTicketAB: boolean;
};

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`HUD-Element #${id} fehlt in index.html.`);
  return element as T;
};

export function installHud(scenes: LoadedScene[], bus: Phaser.Events.EventEmitter): void {
  const buttonsRoot = byId<HTMLDivElement>('scene-buttons');
  for (const scene of scenes) {
    const button = document.createElement('button');
    button.className = 'scene-button';
    button.type = 'button';
    button.dataset.sceneId = scene.id;
    button.textContent = `${scene.id} (${scene.display.levelLabel})`;
    button.title = scene.displayName;
    button.addEventListener('click', () => bus.emit('scene:request', scene.id));
    buttonsRoot.appendChild(button);
  }

  byId('btn-debug').addEventListener('click', () => bus.emit('ui:toggle-debug'));
  byId('btn-hotspots').addEventListener('click', () => bus.emit('ui:toggle-hotspots'));
  byId('btn-cutaway').addEventListener('click', () => bus.emit('ui:toggle-cutaway'));
  byId('btn-center-camera').addEventListener('click', () => bus.emit('ui:center-camera'));
  byId('btn-zoom-in').addEventListener('click', () => bus.emit('ui:zoom', 1));
  byId('btn-zoom-out').addEventListener('click', () => bus.emit('ui:zoom', -1));
  byId('btn-interact').addEventListener('click', () => bus.emit('interaction:button'));

  // The D-pad dispatches a continuous vector while pressed and stops on any pointer release.
  const dpadDirections: Record<string, { dx: number; dy: number }> = {
    NW: { dx: -1, dy: -1 }, N: { dx: 0, dy: -1 }, NE: { dx: 1, dy: -1 },
    W: { dx: -1, dy: 0 }, E: { dx: 1, dy: 0 },
    SW: { dx: -1, dy: 1 }, S: { dx: 0, dy: 1 }, SE: { dx: 1, dy: 1 },
  };
  const stopDpad = () => bus.emit('touch:move', { dx: 0, dy: 0 });
  document.querySelectorAll<HTMLButtonElement>('[data-dir]').forEach((button) => {
    const setDirection = (event: PointerEvent) => {
      event.preventDefault();
      const direction = button.dataset.dir || '';
      const vector = dpadDirections[direction];
      if (vector) bus.emit('touch:move', vector);
      button.setPointerCapture?.(event.pointerId);
    };
    button.addEventListener('pointerdown', setDirection);
    button.addEventListener('pointerup', stopDpad);
    button.addEventListener('pointercancel', stopDpad);
    button.addEventListener('lostpointercapture', stopDpad);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  });
  window.addEventListener('pointerup', stopDpad);
  window.addEventListener('pointercancel', stopDpad);

  const modal = byId<HTMLDivElement>('interaction-modal');
  const closeModal = () => modal.classList.add('hidden');
  byId('btn-close-interaction').addEventListener('click', closeModal);
  modal.addEventListener('pointerdown', (event) => { if (event.target === modal) closeModal(); });
  bus.on('hud:interaction-close', closeModal);
  bus.on('interaction:button', () => {
    // A dedicated bus event is relayed by the scene to the same interaction resolver as E.
    bus.emit('interaction:keyboard');
  });

  bus.on('hud:interaction-open', (payload: InteractionPayload) => {
    byId('interaction-kind').textContent = payload.kind.toUpperCase();
    byId('interaction-title').textContent = payload.title;
    byId('interaction-description').textContent = payload.description;
    const actions = byId<HTMLDivElement>('interaction-actions');
    actions.replaceChildren();
    for (const action of payload.actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      if (action.kind === 'travel' || action.kind === 'buy-ticket') button.classList.add('primary');
      button.addEventListener('click', () => bus.emit('interaction:action', action as InteractionAction));
      actions.appendChild(button);
    }
    modal.classList.remove('hidden');
  });

  bus.on('hud:status', (message: string) => { byId('status-line').textContent = message; });
  bus.on('hud:scene-changed', (payload: { id: string; name: string; level: string }) => {
    byId('active-scene-label').textContent = `${payload.id} · ${payload.level} — ${payload.name}`;
    document.querySelectorAll<HTMLButtonElement>('[data-scene-id]').forEach((button) => {
      const active = button.dataset.sceneId === payload.id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
  });
  bus.on('hud:telemetry', (data: Telemetry) => {
    byId('position-line').textContent = `Welt ${data.xMeters.toFixed(1)}, ${data.yMeters.toFixed(1)}, z ${data.zMeters >= 0 ? '+' : ''}${data.zMeters.toFixed(2)} m · Stage ${data.xPx}, ${data.yPx} px`;
    byId('engine-mode').textContent = `Guthaben ${data.moneyEur.toFixed(2).replace('.', ',')} € · Ticket AB ${data.hasTicketAB ? 'vorhanden' : 'fehlt'}`;
  });
  bus.on('hud:debug-state', (enabled: boolean) => {
    const button = byId<HTMLButtonElement>('btn-debug');
    button.textContent = `Geometrie ${enabled ? 'AN' : 'AUS'}`;
    button.setAttribute('aria-pressed', String(enabled));
  });
  bus.on('hud:hotspots-state', (enabled: boolean) => {
    const button = byId<HTMLButtonElement>('btn-hotspots');
    button.textContent = `Hotspots ${enabled ? 'AN' : 'AUS'}`;
    button.setAttribute('aria-pressed', String(enabled));
  });
  bus.on('hud:cutaway-state', (enabled: boolean) => {
    const button = byId<HTMLButtonElement>('btn-cutaway');
    button.textContent = `Cutaway ${enabled ? 'AN' : 'AUS'}`;
    button.setAttribute('aria-pressed', String(enabled));
  });
}

