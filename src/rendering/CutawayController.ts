import type { ScreenBounds } from './MultiTierDepthSorter';

/** Manifest/Tiled-controlled soft-fade profile for an occluder. Distances use the scene's render coordinate space. */
export interface CutawayProfile {
  /** Below this distance the occluder is at minAlpha. */
  fadeStartPx: number;
  /** At/above this distance the occluder is fully opaque. */
  fadeEndPx: number;
  /** Lower alpha bound in [0, 1]. */
  minAlpha: number;
}

export interface CutawayOccluder {
  bounds: ScreenBounds;
  footSy: number;
}

export interface CutawayActor {
  x: number;
  footSy: number;
}

const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));

function validateProfile(profile: CutawayProfile): void {
  if (![profile.fadeStartPx, profile.fadeEndPx, profile.minAlpha].every(Number.isFinite)) {
    throw new Error('Cutaway-Profil benötigt ausschließlich endliche Zahlen.');
  }
  if (profile.fadeStartPx < 0 || profile.fadeEndPx <= profile.fadeStartPx) {
    throw new Error('Cutaway-Distanzen müssen 0 <= fadeStartPx < fadeEndPx erfüllen.');
  }
  if (profile.minAlpha < 0 || profile.minAlpha > 1) {
    throw new Error('Cutaway minAlpha muss zwischen 0 und 1 liegen.');
  }
}

/**
 * Compute target alpha only when the actor is behind the occluder's ground-contact line.
 * Horizontal distance is measured to the occluder's bounding interval, not its center,
 * so wide walls and compact pillars both behave predictably.
 */
export function targetCutawayAlpha(
  profile: CutawayProfile,
  occluder: CutawayOccluder,
  actor: CutawayActor,
): number {
  validateProfile(profile);
  if (![occluder.footSy, occluder.bounds.left, occluder.bounds.top, occluder.bounds.right, occluder.bounds.bottom, actor.x, actor.footSy].every(Number.isFinite)) {
    throw new Error('Cutaway-Positionen müssen endliche Zahlen sein.');
  }
  if (occluder.bounds.right < occluder.bounds.left) throw new Error('Cutaway-Bounding-Box ist ungültig.');

  // Actors on the front side of the object's footline must not fade that object.
  if (actor.footSy >= occluder.footSy) return 1;

  const horizontalGap = actor.x < occluder.bounds.left
    ? occluder.bounds.left - actor.x
    : actor.x > occluder.bounds.right ? actor.x - occluder.bounds.right : 0;
  const behindGap = occluder.footSy - actor.footSy;
  const distance = Math.hypot(horizontalGap, behindGap);
  if (distance <= profile.fadeStartPx) return profile.minAlpha;
  if (distance >= profile.fadeEndPx) return 1;

  const t = (distance - profile.fadeStartPx) / (profile.fadeEndPx - profile.fadeStartPx);
  // Smoothstep avoids an abrupt visible alpha step at either distance threshold.
  const eased = t * t * (3 - 2 * t);
  return clamp(profile.minAlpha + ((1 - profile.minAlpha) * eased), profile.minAlpha, 1);
}

/** Frame-rate-independent alpha easing. Uses distinct rates to fade out decisively and restore gently. */
export function approachCutawayAlpha(
  currentAlpha: number,
  targetAlpha: number,
  deltaSeconds: number,
  fadeOutRate = 8,
  fadeInRate = 3.5,
): number {
  if (![currentAlpha, targetAlpha, deltaSeconds, fadeOutRate, fadeInRate].every(Number.isFinite)) {
    throw new Error('Cutaway-Interpolation benötigt endliche Zahlen.');
  }
  if (deltaSeconds < 0 || fadeOutRate <= 0 || fadeInRate <= 0) {
    throw new Error('Cutaway-Interpolation benötigt deltaSeconds >= 0 und positive Fade-Raten.');
  }
  const current = clamp(currentAlpha, 0, 1);
  const target = clamp(targetAlpha, 0, 1);
  const rate = target < current ? fadeOutRate : fadeInRate;
  const blend = 1 - Math.exp(-rate * deltaSeconds);
  return clamp(current + (target - current) * blend, 0, 1);
}
