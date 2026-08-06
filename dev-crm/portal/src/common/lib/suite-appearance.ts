import { HRMS_API_URL } from '@/lib/api/config';

export const SUITE_APPEARANCE_DEFAULT_ACCENT = '#8b5cf6';

const FONT_MIN = 10;
const FONT_MAX = 32;

export type SuiteAppearancePayload = {
  portalAccentColor: string | null;
  /** Legacy body size when `portalFontBodyPx` is unset */
  portalFontSizePx: number | null;
  portalFontH1Px: number | null;
  portalFontH2Px: number | null;
  portalFontH3Px: number | null;
  portalFontBodyPx: number | null;
  portalFontSmallPx: number | null;
  portalFontCaptionPx: number | null;
  /** Admin toggle — PM/CRM board cartoon effects & sounds */
  boardEffectsEnabled: boolean;
};

let suiteBoardEffectsEnabled = false;

/** Sync read for sound helpers and non-React code (updated by applySuiteAppearance). */
export function isSuiteBoardEffectsEnabled(): boolean {
  return suiteBoardEffectsEnabled;
}

function clampFontPx(px: unknown): number | null {
  if (typeof px !== 'number' || !Number.isFinite(px)) return null;
  const n = Math.round(px);
  return n >= FONT_MIN && n <= FONT_MAX ? n : null;
}

function darkenHex(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * (1 - amount))));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * (1 - amount))));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * (1 - amount))));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function setRootFontVar(name: string, px: number | null) {
  if (typeof document === 'undefined') return;
  if (px != null) {
    document.documentElement.style.setProperty(name, `${px}px`);
  } else {
    document.documentElement.style.removeProperty(name);
  }
}

export function applySuiteAppearance(payload: SuiteAppearancePayload | null) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  suiteBoardEffectsEnabled = payload?.boardEffectsEnabled !== false;
  root.dataset.suiteBoardEffects = suiteBoardEffectsEnabled ? 'on' : 'off';
  const accent =
    payload?.portalAccentColor &&
    /^#[0-9a-fA-F]{6}$/.test(payload.portalAccentColor)
      ? payload.portalAccentColor
      : SUITE_APPEARANCE_DEFAULT_ACCENT;
  root.style.setProperty('--hs-link', accent);
  root.style.setProperty('--hs-link-hover', darkenHex(accent, 0.12));

  const p = payload;
  setRootFontVar('--suite-font-h1', clampFontPx(p?.portalFontH1Px));
  setRootFontVar('--suite-font-h2', clampFontPx(p?.portalFontH2Px));
  setRootFontVar('--suite-font-h3', clampFontPx(p?.portalFontH3Px));
  setRootFontVar(
    '--suite-font-body',
    clampFontPx(p?.portalFontBodyPx) ?? clampFontPx(p?.portalFontSizePx),
  );
  setRootFontVar('--suite-font-small', clampFontPx(p?.portalFontSmallPx));
  setRootFontVar('--suite-font-caption', clampFontPx(p?.portalFontCaptionPx));

  /* No longer scale the whole document root; tiers drive :root variables. */
  root.style.removeProperty('font-size');
}

export async function fetchSuiteAppearance(): Promise<SuiteAppearancePayload> {
  const empty: SuiteAppearancePayload = {
    portalAccentColor: null,
    portalFontSizePx: null,
    portalFontH1Px: null,
    portalFontH2Px: null,
    portalFontH3Px: null,
    portalFontBodyPx: null,
    portalFontSmallPx: null,
    portalFontCaptionPx: null,
    boardEffectsEnabled: true,
  };
  try {
    const res = await fetch(`${HRMS_API_URL}/hr-settings/appearance`, {
      cache: 'no-store',
    });
    if (!res.ok) return empty;
    const json = await res.json();
    return {
      ...empty,
      ...json,
      boardEffectsEnabled: json?.boardEffectsEnabled !== false,
    };
  } catch {
    return empty;
  }
}

export const SUITE_APPEARANCE_REFRESH_EVENT = 'suite-appearance:refresh';

export function dispatchSuiteAppearanceRefresh() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SUITE_APPEARANCE_REFRESH_EVENT));
  }
}
