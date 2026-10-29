import './styles.css';
import { SceneRuntime } from './core/SceneRuntime';
import { WorldPreviewRuntime } from './world/WorldPreviewRuntime';

function configureWorldPreviewChrome(): void {
  document.body.classList.add('world-preview-mode');
  document.title = 'KLEIN BERLIN — Hybrid Engine V1.6 Editor';
  const version = document.querySelector<HTMLElement>('.version-chip');
  if (version) version.textContent = 'WORLD V1.6';
  const brand = document.querySelector<HTMLElement>('.brand-title');
  if (brand) brand.innerHTML = 'KLEIN BERLIN <span>· City Builder</span>';
  const sceneButtons = document.getElementById('scene-buttons');
  if (sceneButtons) sceneButtons.replaceChildren();
  const grid = document.getElementById('btn-debug');
  const geometry = document.getElementById('btn-hotspots');
  const connectors = document.getElementById('btn-cutaway');
  const center = document.getElementById('btn-center-camera');
  const switchView = document.getElementById('btn-open-world-preview') as HTMLAnchorElement | null;
  if (grid) grid.textContent = 'Raster AN';
  if (geometry) geometry.textContent = 'Geometrien AN';
  if (connectors) connectors.textContent = 'Anschlüsse AN';
  if (center) center.textContent = 'Zentrieren';
  if (switchView) { switchView.textContent = 'Bahnhof-Runtime'; switchView.href = window.location.pathname; switchView.title = 'Zur vorhandenen Bahnhof-Runtime wechseln'; }
  const topActions = document.querySelector<HTMLElement>('.top-actions');
  if (topActions && !document.getElementById('btn-world-zoom-in')) {
    const makeButton = (id: string, text: string, title: string): HTMLButtonElement => {
      const button = document.createElement('button');
      button.id = id;
      button.type = 'button';
      button.className = 'tool-button';
      button.textContent = text;
      button.title = title;
      return button;
    };
    const zoomIn = makeButton('btn-world-zoom-in', 'Zoom +', 'Vergrößern');
    const zoomOut = makeButton('btn-world-zoom-out', 'Zoom −', 'Verkleinern');
    topActions.insertBefore(zoomIn, center ?? null);
    topActions.insertBefore(zoomOut, center ?? null);
  }
  if (topActions && !document.getElementById('btn-world-edit')) {
    const editButton = document.createElement('button');
    editButton.id = 'btn-world-edit';
    editButton.type = 'button';
    editButton.className = 'tool-button';
    editButton.textContent = 'Bearbeiten';
    editButton.setAttribute('aria-pressed', 'false');
    editButton.title = 'Stadtgeometrien bearbeiten';
    topActions.insertBefore(editButton, center ?? null);
  }
  const title = document.getElementById('active-scene-label');
  if (title) title.textContent = 'World Model Preview · Innenstadt';
  const status = document.getElementById('status-line');
  if (status) status.textContent = 'Lade validierte Stadtmodule …';
  const position = document.getElementById('position-line');
  if (position) position.textContent = 'Weltposition: —';
  const engineMode = document.getElementById('engine-mode');
  if (engineMode) engineMode.textContent = 'Modus: World-Model / Meter → Isometrie';
  const footer = document.querySelector<HTMLElement>('.footer-note');
  if (footer) footer.textContent = 'Ziehen: Karte verschieben · Scrollen: zoomen · Klick: Weltkoordinate anzeigen · Zentrieren: gesamte Welt';
  document.getElementById('interaction-modal')?.classList.add('hidden');
}

async function bootstrap(): Promise<void> {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'world') {
      configureWorldPreviewChrome();
      const runtime = new WorldPreviewRuntime();
      await runtime.start(params.get('project') ?? 'data/worlds/klein-berlin/project.json');
      window.addEventListener('beforeunload', () => runtime.destroy(), { once: true });
      return;
    }
    const runtime = new SceneRuntime();
    await runtime.start();
  } catch (error) {
    const panel = document.getElementById('loading-error');
    if (panel) {
      panel.textContent = `KLEIN BERLIN Engine konnte nicht starten.\n\n${error instanceof Error ? error.message : String(error)}\n\nPrüfe, ob die Anwendung über npm run dev bzw. einen lokalen Webserver gestartet wurde.`;
      panel.classList.remove('hidden');
    }
    console.error(error);
  }
}

void bootstrap();
