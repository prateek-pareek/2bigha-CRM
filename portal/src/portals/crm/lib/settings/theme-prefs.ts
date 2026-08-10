/** CRM-local theme prefs (Theme Customizer) — scoped to 2Bigha CRM. */

export const CRM_THEME_PREFS_KEY = "crm-theme-prefs";

export type CrmAccentId = "crimson" | "teal" | "orange" | "indigo";

/** Expanded CRM sidebar width in rem (Theme Customizer). */
export const CRM_SIDEBAR_WIDTH_DEFAULT = 15;
export const CRM_SIDEBAR_WIDTH_MIN = 14;
export const CRM_SIDEBAR_WIDTH_MAX = 22;
export const CRM_SIDEBAR_WIDTH_STEP = 1;

export type CrmThemePrefs = {
  accent: CrmAccentId;
  /** Expanded sidebar width in rem when CRM is active. */
  sidebarWidthRem: number;
};

export const CRM_ACCENT_PRESETS: {
  id: CrmAccentId;
  label: string;
  /** Swatch shown in the customizer */
  swatch: string;
}[] = [
  { id: "crimson", label: "Crimson", swatch: "#e41f07" },
  { id: "teal", label: "Teal", swatch: "#0e9384" },
  { id: "orange", label: "Orange", swatch: "#ff9f43" },
  { id: "indigo", label: "Indigo", swatch: "#4f46e5" },
];

export const CRM_THEME_PREFS_DEFAULT: CrmThemePrefs = {
  accent: "crimson",
  sidebarWidthRem: CRM_SIDEBAR_WIDTH_DEFAULT,
};

export function clampCrmSidebarWidthRem(value: number): number {
  if (!Number.isFinite(value)) return CRM_SIDEBAR_WIDTH_DEFAULT;
  const stepped = Math.round(value / CRM_SIDEBAR_WIDTH_STEP) * CRM_SIDEBAR_WIDTH_STEP;
  return Math.min(CRM_SIDEBAR_WIDTH_MAX, Math.max(CRM_SIDEBAR_WIDTH_MIN, stepped));
}

export function readCrmThemePrefs(): CrmThemePrefs {
  if (typeof window === "undefined") return CRM_THEME_PREFS_DEFAULT;
  try {
    const raw = localStorage.getItem(CRM_THEME_PREFS_KEY);
    if (!raw) return CRM_THEME_PREFS_DEFAULT;
    const parsed = JSON.parse(raw) as Partial<CrmThemePrefs>;
    const accent = CRM_ACCENT_PRESETS.some((p) => p.id === parsed.accent)
      ? (parsed.accent as CrmAccentId)
      : CRM_THEME_PREFS_DEFAULT.accent;
    const sidebarWidthRem = clampCrmSidebarWidthRem(
      typeof parsed.sidebarWidthRem === "number"
        ? parsed.sidebarWidthRem
        : CRM_SIDEBAR_WIDTH_DEFAULT,
    );
    return { accent, sidebarWidthRem };
  } catch {
    return CRM_THEME_PREFS_DEFAULT;
  }
}

export function writeCrmThemePrefs(prefs: CrmThemePrefs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CRM_THEME_PREFS_KEY, JSON.stringify(prefs));
}

/** Persist and broadcast CRM sidebar width so the rail updates live. */
export function setCrmSidebarWidthRem(widthRem: number) {
  if (typeof window === "undefined") return;
  const next = clampCrmSidebarWidthRem(widthRem);
  const prefs = { ...readCrmThemePrefs(), sidebarWidthRem: next };
  writeCrmThemePrefs(prefs);
  window.dispatchEvent(
    new CustomEvent("suite-sidebar:width", {
      detail: { widthRem: next },
    }),
  );
}

/** Apply accent to the CRM root (`[data-crm-app]`). */
export function applyCrmAccent(accent: CrmAccentId) {
  if (typeof document === "undefined") return;
  const root = document.querySelector<HTMLElement>("[data-crm-app]");
  if (!root) return;
  if (accent === "crimson") {
    root.removeAttribute("data-crm-accent");
  } else {
    root.setAttribute("data-crm-accent", accent);
  }
}

export function setSuiteSidebarPinned(pinned: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem("suiteSidebarPinned", String(pinned));
  localStorage.setItem("suiteSidebarCollapsed", String(!pinned));
  window.dispatchEvent(
    new CustomEvent("suite-sidebar:state", {
      detail: { collapsed: !pinned, pinned },
    }),
  );
}

export function readSuiteSidebarPinned(): boolean {
  if (typeof window === "undefined") return true;
  const pinned = localStorage.getItem("suiteSidebarPinned");
  if (pinned !== null) return pinned === "true";
  const legacy = localStorage.getItem("suiteSidebarCollapsed");
  if (legacy !== null) return legacy === "false";
  return true;
}
