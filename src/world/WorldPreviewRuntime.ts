import Phaser from 'phaser';
import { fetchWorldProject } from './WorldProjectLoader.ts';
import { WorldPreviewScene } from './WorldPreviewScene.ts';
import { applyWorldDraftBundle, type WorldDraftBundle } from './WorldDraft.ts';
import type { WorldEditorTool, RectangleFeatureKind } from './WorldEditorModel.ts';
import type { RoadProfileId } from '../geometry/RoadNetwork.ts';

/** Browser runtime for inspecting and editing World Model geometry without entering the legacy stage runtime. */
export class WorldPreviewRuntime {
  private game?: Phaser.Game;
  private scene?: WorldPreviewScene;
  private cleanupHandlers: Array<() => void> = [];
  private storageKey = 'klein-berlin-world-draft:v1:data/worlds/klein-berlin/project.json';

  async start(projectPath = 'data/worlds/klein-berlin/project.json'): Promise<Phaser.Game> {
    const status = document.getElementById('status-line');
    const position = document.getElementById('position-line');
    const engineMode = document.getElementById('engine-mode');
    if (status) status.textContent = 'World Model wird geladen und validiert …';
    this.storageKey = `klein-berlin-world-draft:v1:${projectPath}`;
    const loaded = await fetchWorldProject(projectPath);
    let draftNote = '';
    try {
      const savedDraft = window.localStorage.getItem(this.storageKey);
      if (savedDraft) {
        const result = applyWorldDraftBundle(loaded, JSON.parse(savedDraft) as unknown);
        draftNote = ` · Browser-Entwurf geladen (${result.appliedModules} Module)`;
      }
    } catch (error) {
      draftNote = ` · gespeicherter Entwurf ignoriert: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (status) status.textContent = `World Model validiert. Modulare Isometrie wird aufgebaut …${draftNote}`;
    if (position) position.textContent = `Module: ${loaded.modules.size} · Stadtteile: ${loaded.world.districts.length} · Assets: ${loaded.assetCatalog.assets.length}`;
    if (engineMode) engineMode.textContent = 'Modus: World-Model / Meter → Isometrie';

    const previewScene = new WorldPreviewScene(loaded, (message) => {
      if (status) status.textContent = message;
      const hint = document.getElementById('world-editor-hint');
      if (hint && document.body.classList.contains('editor-active')) hint.textContent = message;
    }, (draft: WorldDraftBundle) => {
      try {
        window.localStorage.setItem(this.storageKey, JSON.stringify(draft));
        const hint = document.getElementById('world-editor-hint');
        if (hint) hint.textContent = 'Entwurf automatisch im Browser gespeichert.';
      } catch (error) {
        const hint = document.getElementById('world-editor-hint');
        if (hint) hint.textContent = `Lokales Speichern fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}. Bitte JSON exportieren.`;
      }
    });
    this.scene = previewScene;
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game-root',
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: '#101720',
      transparent: false,
      antialias: true,
      roundPixels: false,
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: window.innerWidth,
        height: window.innerHeight,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      render: { pixelArt: false, antialias: true, roundPixels: false },
      input: { activePointers: 2 },
      scene: [previewScene],
    });
    this.bindControls(loaded);
    return this.game;
  }

  destroy(): void {
    for (const remove of this.cleanupHandlers) remove();
    this.cleanupHandlers = [];
    this.game?.destroy(true);
    this.game = undefined;
    this.scene = undefined;
  }

  private bindControls(loaded: Awaited<ReturnType<typeof fetchWorldProject>>): void {
    const gridButton = document.getElementById('btn-debug') as HTMLButtonElement | null;
    const geometryButton = document.getElementById('btn-hotspots') as HTMLButtonElement | null;
    const connectorButton = document.getElementById('btn-cutaway') as HTMLButtonElement | null;
    const centerButton = document.getElementById('btn-center-camera') as HTMLButtonElement | null;
    const zoomInButton = document.getElementById('btn-world-zoom-in') as HTMLButtonElement | null;
    const zoomOutButton = document.getElementById('btn-world-zoom-out') as HTMLButtonElement | null;

    if (gridButton) this.listenToggle(gridButton, 'Raster', (visible) => this.scene?.setGridVisible(visible), true);
    if (geometryButton) this.listenToggle(geometryButton, 'Geometrien', (visible) => this.scene?.setGeometryVisible(visible), true);
    if (connectorButton) this.listenToggle(connectorButton, 'Anschlüsse', (visible) => this.scene?.setConnectorsVisible(visible), true);
    if (centerButton) this.listen(centerButton, 'click', () => this.scene?.frameWorld());
    if (zoomInButton) this.listen(zoomInButton, 'click', () => this.scene?.zoomBy(1.25));
    if (zoomOutButton) this.listen(zoomOutButton, 'click', () => this.scene?.zoomBy(0.8));

    const editButton = document.getElementById('btn-world-edit') as HTMLButtonElement | null;
    const editPanel = document.getElementById('world-editor-panel');
    if (editButton && editPanel) {
      let editing = false;
      this.listen(editButton, 'click', () => {
        editing = !editing;
        editButton.textContent = editing ? 'Bearbeiten AN' : 'Bearbeiten';
        editButton.setAttribute('aria-pressed', String(editing));
        editPanel.classList.toggle('hidden', !editing);
        document.body.classList.toggle('editor-active', editing);
        this.scene?.setEditMode(editing);
        if (!editing) {
          for (const button of document.querySelectorAll<HTMLButtonElement>('[data-editor-tool]')) {
            if (button.dataset.editorTool === 'select') {
              button.classList.add('active');
              button.setAttribute('aria-pressed', 'true');
            } else {
              button.classList.remove('active');
              button.setAttribute('aria-pressed', 'false');
            }
          }
          this.scene?.setEditorTool('select');
        }
      });
    }

    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-editor-tool]')) {
      this.listen(button, 'click', () => {
        const tool = button.dataset.editorTool as WorldEditorTool | undefined;
        if (!tool || !['select', 'road', 'area', 'building', 'asset'].includes(tool)) return;
        this.scene?.setEditorTool(tool);
        for (const candidate of document.querySelectorAll<HTMLButtonElement>('[data-editor-tool]')) {
          const selected = candidate === button;
          candidate.classList.toggle('active', selected);
          candidate.setAttribute('aria-pressed', String(selected));
        }
      });
    }

    const roadProfileSelect = document.getElementById('world-road-profile') as HTMLSelectElement | null;
    if (roadProfileSelect) {
      this.listen(roadProfileSelect, 'change', () => {
        const profile = roadProfileSelect.value as RoadProfileId;
        this.scene?.setRoadProfile(profile);
        // If a road is currently selected in select mode, update its profile immediately
        const selected = this.scene?.getSelectedFeature();
        if (selected && selected.feature.kind === 'road-centerline') {
          this.scene?.updateSelectedFeatureProfile(profile);
        }
      });
    }

    const areaKind = document.getElementById('world-area-kind') as HTMLSelectElement | null;
    if (areaKind) {
      this.listen(areaKind, 'change', () => {
        const kind = areaKind.value as RectangleFeatureKind;
        if (['park', 'plaza', 'parcel', 'walkable-area', 'collision-area'].includes(kind)) {
          this.scene?.setRectangleKind(kind);
          const selected = this.scene?.getSelectedFeature();
          if (selected && selected.feature.geometry.type === 'Polygon') {
            this.scene?.updateSelectedAreaKind(kind);
          }
        }
      });
    }

    const assetKindSelect = document.getElementById('world-asset-kind') as HTMLSelectElement | null;
    if (assetKindSelect) {
      this.listen(assetKindSelect, 'change', () => {
        this.scene?.setActiveAssetId(assetKindSelect.value);
      });
    }

    const badge = document.getElementById('world-selection-badge');
    const deleteButton = document.getElementById('btn-world-delete');
    const rotateButton = document.getElementById('btn-world-rotate') as HTMLButtonElement | null;
    const refButton = document.getElementById('btn-ref-toggle') as HTMLButtonElement | null;

    if (rotateButton) {
      this.listen(rotateButton, 'click', () => this.scene?.rotateSelectedEntity(90));
    }

    if (refButton) {
      this.listenToggle(refButton, 'Vorlage', (visible) => this.scene?.setReferenceImageVisible(visible), true);
    }

    this.scene?.setFeatureSelectedHandler((info) => {
      if (info.entity) {
        if (badge) {
          badge.textContent = `Auswahl: Requisite (${info.entity.assetId} · ${info.entity.id})`;
          badge.classList.remove('hidden');
        }
        if (deleteButton) deleteButton.classList.remove('hidden');
        if (rotateButton) rotateButton.classList.remove('hidden');
        if (assetKindSelect) assetKindSelect.value = info.entity.assetId;
      } else if (info.feature) {
        if (badge) {
          badge.textContent = `Auswahl: ${info.feature.kind} (${info.feature.id})`;
          badge.classList.remove('hidden');
        }
        if (deleteButton) deleteButton.classList.remove('hidden');
        if (rotateButton) rotateButton.classList.add('hidden');

        // Sync dropdowns
        if (info.feature.kind === 'road-centerline' && roadProfileSelect) {
          const prof = String(info.feature.properties?.roadProfile ?? '');
          if (['primary', 'secondary', 'residential', 'pedestrian'].includes(prof)) {
            roadProfileSelect.value = prof as RoadProfileId;
          }
        } else if (info.feature.geometry.type === 'Polygon' && areaKind) {
          if (['park', 'plaza', 'parcel', 'walkable-area', 'collision-area'].includes(info.feature.kind)) {
            areaKind.value = info.feature.kind;
          }
        }
      } else {
        if (badge) badge.classList.add('hidden');
        if (deleteButton) deleteButton.classList.add('hidden');
        if (rotateButton) rotateButton.classList.add('hidden');
      }
    });

    if (deleteButton) {
      this.listen(deleteButton, 'click', () => this.scene?.deleteSelection());
    }

    // Keyboard shortcuts (Delete/Backspace to delete, R to rotate)
    this.listen(window as unknown as HTMLElement, 'keydown', (event: Event) => {
      const keyboardEvent = event as KeyboardEvent;
      const target = keyboardEvent.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;

      if (keyboardEvent.key === 'Delete' || keyboardEvent.key === 'Backspace') {
        if (this.scene?.getSelectedFeature() || this.scene?.getSelectedEntity()) {
          keyboardEvent.preventDefault();
          this.scene?.deleteSelection();
        }
      } else if (keyboardEvent.key === 'r' || keyboardEvent.key === 'R') {
        if (this.scene?.getSelectedEntity()) {
          keyboardEvent.preventDefault();
          this.scene?.rotateSelectedEntity(90);
        }
      }
    });

    const undoButton = document.getElementById('btn-world-undo');
    if (undoButton) this.listen(undoButton, 'click', () => this.scene?.undoLastEdit());

    const exportButton = document.getElementById('btn-world-export');
    if (exportButton) this.listen(exportButton, 'click', () => this.exportDraft());

    // Import Button and file input
    const importButton = document.getElementById('btn-world-import');
    const fileInput = document.getElementById('file-world-import') as HTMLInputElement | null;
    if (importButton && fileInput) {
      this.listen(importButton, 'click', () => fileInput.click());
      this.listen(fileInput, 'change', () => {
        const file = fileInput.files?.[0];
        if (file) {
          this.loadDraftFile(file, loaded);
          fileInput.value = '';
        }
      });
    }

    // Drag and Drop support
    const shell = document.getElementById('app-shell');
    if (shell) {
      this.listen(shell, 'dragover', (e: Event) => {
        const dragEvent = e as DragEvent;
        dragEvent.preventDefault();
        shell.classList.add('drag-over');
      });
      this.listen(shell, 'dragleave', () => {
        shell.classList.remove('drag-over');
      });
      this.listen(shell, 'drop', (e: Event) => {
        const dragEvent = e as DragEvent;
        dragEvent.preventDefault();
        shell.classList.remove('drag-over');
        const file = dragEvent.dataTransfer?.files?.[0];
        if (file && file.name.endsWith('.json')) {
          this.loadDraftFile(file, loaded);
        }
      });
    }
  }

  private loadDraftFile(file: File, loaded: Awaited<ReturnType<typeof fetchWorldProject>>): void {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string) as unknown;
        const result = applyWorldDraftBundle(loaded, json);
        window.localStorage.setItem(this.storageKey, JSON.stringify(json));
        this.scene?.renderWorld();
        const hint = document.getElementById('world-editor-hint');
        if (hint) hint.textContent = `Entwurf erfolgreich geladen (${result.appliedModules} Module aktualisiert).`;
        const status = document.getElementById('status-line');
        if (status) status.textContent = `Entwurf aus ${file.name} erfolgreich importiert.`;
      } catch (err) {
        const msg = `Import fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`;
        const hint = document.getElementById('world-editor-hint');
        if (hint) hint.textContent = msg;
        console.error(msg);
      }
    };
    reader.readAsText(file);
  }

  private exportDraft(): void {
    if (!this.scene) return;
    const bundle = this.scene.getDraftBundle();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'klein-berlin-world-draft.json';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    const hint = document.getElementById('world-editor-hint');
    if (hint) hint.textContent = `JSON exportiert · ${bundle.modules.length} Module im Entwurf.`;
  }

  private listenToggle(button: HTMLButtonElement, label: string, callback: (visible: boolean) => void, initial: boolean): void {
    let visible = initial;
    button.textContent = `${label} ${visible ? 'AN' : 'AUS'}`;
    button.setAttribute('aria-pressed', String(visible));
    this.listen(button, 'click', () => {
      visible = !visible;
      button.textContent = `${label} ${visible ? 'AN' : 'AUS'}`;
      button.setAttribute('aria-pressed', String(visible));
      callback(visible);
    });
  }

  private listen(target: HTMLElement, eventName: string, handler: EventListener): void {
    target.addEventListener(eventName, handler);
    this.cleanupHandlers.push(() => target.removeEventListener(eventName, handler));
  }
}
