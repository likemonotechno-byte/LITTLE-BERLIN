import type { CutawayProfile } from '../rendering/CutawayController';
import type { ImportedTileset, TiledProperty } from './TiledJsonImporter';

const normalizeToken = (value: unknown): string => String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');

export function readTiledProperty(properties: TiledProperty[] | undefined, name: string): unknown {
  return properties?.find((property) => property.name === name)?.value;
}

export function readTiledBoolean(properties: TiledProperty[] | undefined, name: string, fallback = false): boolean {
  const value = readTiledProperty(properties, name);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    if (/^(true|1|yes|on)$/i.test(value.trim())) return true;
    if (/^(false|0|no|off)$/i.test(value.trim())) return false;
  }
  return fallback;
}

export function isActorDepthTileLayer(
  layerName: string,
  properties: TiledProperty[] | undefined,
): boolean {
  const role = normalizeToken(readTiledProperty(properties, 'renderRole'));
  if (readTiledBoolean(properties, 'depthSortTiles', false)) return true;
  if (['foreground', 'roof', 'canopy', 'upperfront', 'actorsort', 'occluder', 'alwaysfront'].includes(role)) return true;
  return /(^|\/)(foreground|foregroundroof|roof|canopy|upperfront|actorsort|always[-_]?front)([-_\/]|$)/i.test(layerName);
}

export function cutawayProfileFromTiledProperties(
  properties: TiledProperty[] | undefined,
): CutawayProfile | undefined {
  if (!readTiledBoolean(properties, 'cutawayEnabled', false)) return undefined;
  const readNumber = (names: string[], fallback: number): number => {
    for (const name of names) {
      const value = readTiledProperty(properties, name);
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
    }
    return fallback;
  };
  const profile = {
    fadeStartPx: readNumber(['cutawayFadeStartPx', 'fadeStartPx'], 32),
    fadeEndPx: readNumber(['cutawayFadeEndPx', 'fadeEndPx'], 160),
    minAlpha: readNumber(['cutawayMinAlpha', 'minAlpha'], 0.22),
  };
  if (profile.fadeStartPx < 0 || profile.fadeEndPx <= profile.fadeStartPx || profile.minAlpha < 0 || profile.minAlpha > 1) {
    throw new Error(`Ungültiges Cutaway-Profil: ${JSON.stringify(profile)}`);
  }
  return profile;
}

/**
 * Resolves a global Tiled GID to a zero-based atlas frame. Input GIDs must have
 * Tiled's flip bits stripped; Phaser Tile.index provides the normalized index.
 */
export function resolveTilesetFrame(
  gid: number,
  tilesets: ImportedTileset[],
): { tileset: ImportedTileset; tilesetIndex: number; frame: number } | null {
  if (!Number.isInteger(gid) || gid <= 0) return null;
  let bestIndex = -1;
  for (let index = 0; index < tilesets.length; index++) {
    if (tilesets[index].firstgid <= gid) bestIndex = index;
    else break;
  }
  if (bestIndex < 0) return null;
  const tileset = tilesets[bestIndex];
  const frame = gid - tileset.firstgid;
  if (tileset.tilecount !== undefined && frame >= tileset.tilecount) return null;
  return { tileset, tilesetIndex: bestIndex, frame };
}

export interface RadialCutawayBinding {
  enabled: boolean;
  actorX: number;
  actorY: number;
  fadeStartPx: number;
  fadeEndPx: number;
  minAlpha: number;
}

export function buildRadialCutawayBinding(
  enabled: boolean,
  actorX: number,
  actorY: number,
  profile: CutawayProfile,
): RadialCutawayBinding {
  if (![actorX, actorY].every(Number.isFinite)) throw new Error('Cutaway-Aktorposition muss endlich sein.');
  if (![profile.fadeStartPx, profile.fadeEndPx, profile.minAlpha].every(Number.isFinite)
    || profile.fadeStartPx < 0 || profile.fadeEndPx <= profile.fadeStartPx
    || profile.minAlpha < 0 || profile.minAlpha > 1) {
    throw new Error('Ungültiges radiales Cutaway-Profil.');
  }
  return {
    enabled,
    actorX,
    actorY,
    fadeStartPx: profile.fadeStartPx,
    fadeEndPx: profile.fadeEndPx,
    minAlpha: profile.minAlpha,
  };
}


export interface SpritePixelBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Converts a world/screen-style actor point into the texture UV convention used
 * by Phaser's PostFX quad. Phaser's PostFX quad maps screen-top to v=1, so the
 * vertical coordinate must be inverted relative to a top-left sprite bounds.
 */
export function actorPositionToTextureUv(
  actorX: number,
  actorY: number,
  bounds: SpritePixelBounds,
): { u: number; v: number } {
  if (![actorX, actorY, bounds.left, bounds.top, bounds.width, bounds.height].every(Number.isFinite)
    || bounds.width <= 0 || bounds.height <= 0) {
    throw new Error('UV-Umrechnung benötigt endliche Positionen und positive Sprite-Abmessungen.');
  }
  return {
    u: (actorX - bounds.left) / bounds.width,
    v: 1 - (actorY - bounds.top) / bounds.height,
  };
}
