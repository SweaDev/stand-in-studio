import { CHARACTER_IDS, MODES } from './types';
import type { BlendLayout, CharacterId, Mode } from './types';

/** Capture resolutions offered for the physical camera (frame rate is always 30). */
export type CaptureProfile = '1280x720' | '960x540' | '640x360';
export const CAPTURE_PROFILES: readonly CaptureProfile[] = ['1280x720', '960x540', '640x360'];

export interface MeetingPreset {
  name: string;
  mode: Mode;
  blendOpacity: number;
  autoMax: number;
  autoListening: number;
}

/**
 * Everything Stand-In Studio persists. Deliberately limited to character and mode
 * settings: no signals, calibration values or API keys ever go here.
 */
export interface Settings {
  character: CharacterId;
  background: string;
  mode: Mode;
  blend: { opacity: number; layout: BlendLayout };
  auto: { max: number; listening: number; comfortShield: boolean };
  camera: { badge: boolean; deviceId: string | null; profile: CaptureProfile };
  accessibility: { reducedMotion: boolean; highContrast: boolean };
  presets: MeetingPreset[];
}

export const BACKGROUNDS = ['#2b2d42', '#264653', '#3d405b', '#f4f1de', '#e9edc9', '#1d1b22'] as const;

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  character: 'lantern',
  background: '#2b2d42',
  mode: 'auto',
  blend: { opacity: 0.5, layout: 'over' },
  auto: { max: 1, listening: 0.4, comfortShield: false },
  camera: { badge: false, deviceId: null, profile: '960x540' },
  accessibility: { reducedMotion: false, highContrast: false },
  presets: [],
}) as Settings;

const HEX = /^#[0-9a-f]{6}$/i;
const MAX_PRESETS = 12;

function num01(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function sanitizePreset(raw: unknown): MeetingPreset | null {
  const p = obj(raw);
  if (typeof p.name !== 'string' || p.name.trim() === '') return null;
  const d = DEFAULT_SETTINGS;
  return {
    name: p.name.trim().slice(0, 40),
    mode: oneOf(p.mode, MODES, d.mode),
    blendOpacity: num01(p.blendOpacity, d.blend.opacity),
    autoMax: num01(p.autoMax, d.auto.max),
    autoListening: num01(p.autoListening, d.auto.listening),
  };
}

/**
 * Turns anything (e.g. a JSON file from disk) into valid Settings: unknown keys are dropped,
 * out-of-range values clamped, and missing values filled from the defaults.
 */
export function sanitizeSettings(raw: unknown): Settings {
  const r = obj(raw);
  const d = DEFAULT_SETTINGS;
  const blend = obj(r.blend);
  const auto = obj(r.auto);
  const camera = obj(r.camera);
  const a11y = obj(r.accessibility);
  const max = num01(auto.max, d.auto.max);
  const presets = Array.isArray(r.presets)
    ? r.presets
        .map(sanitizePreset)
        .filter((p): p is MeetingPreset => p !== null)
        .slice(0, MAX_PRESETS)
    : [];
  return {
    character: oneOf(r.character, CHARACTER_IDS, d.character),
    background: typeof r.background === 'string' && HEX.test(r.background) ? r.background : d.background,
    mode: oneOf(r.mode, MODES, d.mode),
    blend: {
      opacity: num01(blend.opacity, d.blend.opacity),
      layout: oneOf(blend.layout, ['over', 'beside'] as const, d.blend.layout),
    },
    auto: {
      max,
      // The listening level can never exceed the user's max.
      listening: Math.min(max, num01(auto.listening, d.auto.listening)),
      comfortShield: bool(auto.comfortShield, d.auto.comfortShield),
    },
    camera: {
      badge: bool(camera.badge, d.camera.badge),
      deviceId: typeof camera.deviceId === 'string' && camera.deviceId.length < 512 ? camera.deviceId : null,
      profile: oneOf(camera.profile, CAPTURE_PROFILES, d.camera.profile),
    },
    accessibility: {
      reducedMotion: bool(a11y.reducedMotion, d.accessibility.reducedMotion),
      highContrast: bool(a11y.highContrast, d.accessibility.highContrast),
    },
    presets,
  };
}

/** Deep-merges a partial update into settings and re-validates the result. */
export function updateSettings(current: Settings, patch: DeepPartial<Settings>): Settings {
  const merged: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    const cur = (current as unknown as Record<string, unknown>)[k];
    merged[k] =
      v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object'
        ? { ...(cur as object), ...(v as object) }
        : v;
  }
  return sanitizeSettings(merged);
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (infer U)[] ? U[] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export function parseCaptureProfile(p: CaptureProfile): { width: number; height: number } {
  const [w, h] = p.split('x').map(Number);
  return { width: w as number, height: h as number };
}

/** Next lower capture profile (used when the SDK reports a sustained low frame rate). */
export function lowerProfile(p: CaptureProfile): CaptureProfile | null {
  const i = CAPTURE_PROFILES.indexOf(p);
  return i >= 0 && i < CAPTURE_PROFILES.length - 1 ? (CAPTURE_PROFILES[i + 1] as CaptureProfile) : null;
}
