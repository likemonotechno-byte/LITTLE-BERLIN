import type { GridMetrics } from './SceneManifest';

export interface ScreenPoint { sx: number; sy: number }
export interface WorldPoint { xMeters: number; yMeters: number }

/**
 * Unit-safe 2:1-dimetrische Transformation für NEU projizierte Szenen.
 *
 * V0.3-Szenen nutzen weiterhin ihre empirisch kalibrierten stage-pixel. Der
 * SceneManifestLoader verhindert, dass dieser Rechner versehentlich auf solche
 * vorgerenderten Bilder angewendet wird. Diese Trennung erhält die Referenztreue.
 */
export class UniversalIsoMath {
  private readonly metrics: GridMetrics;

  constructor(metrics: GridMetrics) {
    this.metrics = metrics;
    if (metrics.projection !== 'dimetric-2-to-1') {
      throw new Error('UniversalIsoMath benötigt projection="dimetric-2-to-1"; Legacy-Stages verwenden Stage-Pixel.');
    }
    const positive = [metrics.macroTileMeters, metrics.tilePixelWidth, metrics.tilePixelHeight];
    if (positive.some((n) => !Number.isFinite(n) || n <= 0)) throw new Error('Ungültige Isometrie-Metriken.');
    if (!Number.isFinite(metrics.elevationPxPerTier)) throw new Error('elevationPxPerTier muss endlich sein.');
  }

  /** World in real meters + discrete tier -> screen pixels. */
  worldToScreen(xMeters: number, yMeters: number, tier = 0): ScreenPoint {
    const u = xMeters / this.metrics.macroTileMeters;
    const v = yMeters / this.metrics.macroTileMeters;
    const halfW = this.metrics.tilePixelWidth * 0.5;
    const halfH = this.metrics.tilePixelHeight * 0.5;
    return {
      sx: this.metrics.originX + (u - v) * halfW,
      sy: this.metrics.originY + (u + v) * halfH - tier * this.metrics.elevationPxPerTier,
    };
  }

  /** Screen pixel -> world meters on the requested tier. */
  screenToWorld(sx: number, sy: number, tier = 0): WorldPoint {
    const halfW = this.metrics.tilePixelWidth * 0.5;
    const halfH = this.metrics.tilePixelHeight * 0.5;
    const dx = sx - this.metrics.originX;
    const dy = sy - this.metrics.originY + tier * this.metrics.elevationPxPerTier;
    const u = (dx / halfW + dy / halfH) * 0.5;
    const v = (dy / halfH - dx / halfW) * 0.5;
    return { xMeters: u * this.metrics.macroTileMeters, yMeters: v * this.metrics.macroTileMeters };
  }
}
