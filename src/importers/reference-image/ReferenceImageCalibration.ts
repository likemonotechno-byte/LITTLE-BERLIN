import type { Point2, ReferenceImageSource } from '../../world/WorldModel.ts';

export interface CalibrationAnchor {
  imagePx: Point2;
  localMeters: Point2;
}

export interface CalibratedReferenceImage extends ReferenceImageSource {
  nominalScaleMetersPerPx: number;
  rotationDegrees: number;
  calibrated: boolean;
  calibrationAnchors?: [CalibrationAnchor, CalibrationAnchor];
}

/**
 * Service for 2-point reference image calibration and scale mapping.
 * Allows historical Berlin maps or aerial blueprints to be used as scale-accurate templates.
 */
export class ReferenceImageCalibrator {
  /**
   * Calibrates image scale (`metersPerPixel`) and position from two known reference points
   * and a known real-world distance in meters.
   */
  static calibrateFromTwoPoints(
    source: ReferenceImageSource,
    pointAImagePx: Point2,
    pointBImagePx: Point2,
    knownDistanceMeters: number,
    pointALocalMeters: Point2 = { x: 0, y: 0 },
    naturalWidthPx = 1024,
  ): CalibratedReferenceImage {
    if (!Number.isFinite(knownDistanceMeters) || knownDistanceMeters <= 0) {
      throw new Error('Bekannte Kalibrierdistanz muss positiv und endlich sein.');
    }
    const dxPx = pointBImagePx.x - pointAImagePx.x;
    const dyPx = pointBImagePx.y - pointAImagePx.y;
    const distPx = Math.hypot(dxPx, dyPx);
    if (distPx < 1e-3) {
      throw new Error('Kalibrierpunkte im Referenzbild dürfen nicht identisch sein.');
    }

    const nominalScaleMetersPerPx = knownDistanceMeters / distPx;
    const widthMeters = naturalWidthPx * nominalScaleMetersPerPx;

    const originX = pointALocalMeters.x - pointAImagePx.x * nominalScaleMetersPerPx;
    const originY = pointALocalMeters.y - pointAImagePx.y * nominalScaleMetersPerPx;

    const pointBLocalMeters: Point2 = {
      x: pointALocalMeters.x + dxPx * nominalScaleMetersPerPx,
      y: pointALocalMeters.y + dyPx * nominalScaleMetersPerPx,
    };

    return {
      ...source,
      positionMeters: { x: originX, y: originY },
      widthMeters,
      nominalScaleMetersPerPx,
      rotationDegrees: 0,
      calibrated: true,
      calibrationAnchors: [
        { imagePx: { ...pointAImagePx }, localMeters: { ...pointALocalMeters } },
        { imagePx: { ...pointBImagePx }, localMeters: pointBLocalMeters },
      ],
    };
  }

  /** Converts an image pixel coordinate (px, py) on the calibrated image into module-local meters. */
  static imagePixelToLocalMeters(image: CalibratedReferenceImage, imagePx: Point2): Point2 {
    if (!image.calibrated || image.nominalScaleMetersPerPx <= 0) {
      throw new Error(`Referenzbild ${image.id} ist noch nicht kalibriert.`);
    }
    return {
      x: image.positionMeters.x + imagePx.x * image.nominalScaleMetersPerPx,
      y: image.positionMeters.y + imagePx.y * image.nominalScaleMetersPerPx,
    };
  }

  /** Converts module-local meters into image pixel coordinates (px, py). */
  static localMetersToImagePixel(image: CalibratedReferenceImage, localMeters: Point2): Point2 {
    if (!image.calibrated || image.nominalScaleMetersPerPx <= 0) {
      throw new Error(`Referenzbild ${image.id} ist noch nicht kalibriert.`);
    }
    return {
      x: (localMeters.x - image.positionMeters.x) / image.nominalScaleMetersPerPx,
      y: (localMeters.y - image.positionMeters.y) / image.nominalScaleMetersPerPx,
    };
  }
}
