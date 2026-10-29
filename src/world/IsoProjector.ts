import {
  moduleLocalToWorld,
  type ProjectManifest,
  type WorldModuleReference,
  type WorldPoint3,
} from './WorldModel.ts';

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ProjectedBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

/**
 * Projection adapter for editable world-model data.
 *
 * World coordinates are expressed in meters. Projected coordinates are in
 * Phaser world pixels. Keeping this transform separate from the legacy
 * stage-pixel coordinate system prevents accidental mixing of the two.
 */
export class IsoProjector {
  private readonly projection: ProjectManifest['projection'];

  constructor(projection: ProjectManifest['projection']) {
    this.projection = projection;
    const values = [
      projection.tileWidthPx,
      projection.tileHeightPx,
      projection.referenceCellMeters,
      projection.elevationPxPerMeter,
    ];
    if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
      throw new Error('IsoProjector benötigt positive und endliche Projektionsparameter.');
    }
  }

  worldToScreen(point: WorldPoint3): ScreenPoint {
    const halfWidthPerMeter = this.projection.tileWidthPx / (2 * this.projection.referenceCellMeters);
    const halfHeightPerMeter = this.projection.tileHeightPx / (2 * this.projection.referenceCellMeters);
    return {
      x: (point.x - point.y) * halfWidthPerMeter,
      y: (point.x + point.y) * halfHeightPerMeter - point.z * this.projection.elevationPxPerMeter,
    };
  }

  /** Inverse of worldToScreen for a known elevation. */
  screenToWorld(x: number, y: number, z = 0): WorldPoint3 {
    if (![x, y, z].every(Number.isFinite)) throw new Error('Bildschirmkoordinaten müssen endlich sein.');
    const halfWidthPerMeter = this.projection.tileWidthPx / (2 * this.projection.referenceCellMeters);
    const halfHeightPerMeter = this.projection.tileHeightPx / (2 * this.projection.referenceCellMeters);
    const projectedX = x / halfWidthPerMeter;
    const projectedY = (y + z * this.projection.elevationPxPerMeter) / halfHeightPerMeter;
    return {
      x: (projectedX + projectedY) / 2,
      y: (projectedY - projectedX) / 2,
      z,
    };
  }

  moduleLocalToWorld(local: WorldPoint3, module: WorldModuleReference): WorldPoint3 {
    return moduleLocalToWorld(local, module.originMeters, module.rotationDegrees);
  }

  moduleLocalToScreen(local: WorldPoint3, module: WorldModuleReference): ScreenPoint {
    return this.worldToScreen(this.moduleLocalToWorld(local, module));
  }

  moduleScreenCorners(module: WorldModuleReference): ScreenPoint[] {
    const { width, depth } = module.boundsMeters;
    return [
      this.moduleLocalToScreen({ x: 0, y: 0, z: 0 }, module),
      this.moduleLocalToScreen({ x: width, y: 0, z: 0 }, module),
      this.moduleLocalToScreen({ x: width, y: depth, z: 0 }, module),
      this.moduleLocalToScreen({ x: 0, y: depth, z: 0 }, module),
    ];
  }

  boundsOf(points: ScreenPoint[]): ProjectedBounds {
    if (points.length === 0) throw new Error('Mindestens ein projizierter Punkt ist für boundsOf erforderlich.');
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    };
  }

  metersToScreenStrokeWidth(meters: number): number {
    if (!Number.isFinite(meters) || meters < 0) throw new Error('Strichbreite muss endlich und nicht negativ sein.');
    return meters * this.projection.tileHeightPx / this.projection.referenceCellMeters;
  }

  /** Convert a compass-like world heading (0=east, 90=south) to screen radians. */
  worldHeadingToScreenRadians(headingDegrees: number): number {
    if (!Number.isFinite(headingDegrees)) throw new Error('Richtung muss endlich sein.');
    const radians = headingDegrees * Math.PI / 180;
    const dx = Math.cos(radians) - Math.sin(radians);
    const dy = (Math.cos(radians) + Math.sin(radians)) * this.projection.tileHeightPx / this.projection.tileWidthPx;
    return Math.atan2(dy, dx);
  }
}
