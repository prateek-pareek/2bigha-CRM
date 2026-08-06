"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  Check,
  Columns3,
  GitBranch,
  LayoutTemplate,
  Minus,
  Moon,
  PanelLeft,
  PanelLeftClose,
  Plus,
  RotateCcw,
  Settings,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CrmIcon } from "@/lib/crm/shared/icons";
import {
  applyCrmAccent,
  CRM_ACCENT_PRESETS,
  CRM_SIDEBAR_WIDTH_DEFAULT,
  CRM_SIDEBAR_WIDTH_MAX,
  CRM_SIDEBAR_WIDTH_MIN,
  CRM_SIDEBAR_WIDTH_STEP,
  CRM_THEME_PREFS_DEFAULT,
  readCrmThemePrefs,
  readSuiteSidebarPinned,
  setCrmSidebarWidthRem,
  setSuiteSidebarPinned,
  writeCrmThemePrefs,
  type CrmAccentId,
  type CrmThemePrefs,
} from "@/lib/crm/settings/theme-prefs";

const QUICK_LINKS = [
  {
    href: "/crm/settings/pipelines",
    label: "Pipelines & stages",
    icon: GitBranch,
  },
  {
    href: "/crm/settings/columns",
    label: "List columns",
    icon: Columns3,
  },
  {
    href: "/crm/settings/card-customization",
    label: "Board card fields",
    icon: LayoutTemplate,
  },
  {
    href: "/crm/settings/custom-fields",
    label: "Custom fields",
    icon: Sparkles,
  },
] as const;

/**
 * CRMS-style Theme Customizer — red gear FAB + right drawer.
 * Scoped to Mathionix CRM needs (mode, sidebar layout, accent, setup links).
 * Reference: https://crms.dreamstechnologies.com/html/leads.html `#theme-settings-offcanvas`
 */
export function CrmThemeCustomizer() {
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [prefs, setPrefs] = useState<CrmThemePrefs>(CRM_THEME_PREFS_DEFAULT);
  const [sidebarPinned, setSidebarPinned] = useState(true);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setMounted(true);
      const next = readCrmThemePrefs();
      setPrefs(next);
      applyCrmAccent(next.accent);
      setSidebarPinned(readSuiteSidebarPinned());
    });
    const onSidebar = (e: Event) => {
      const detail = (e as CustomEvent<{ pinned?: boolean }>).detail;
      if (typeof detail?.pinned === "boolean") {
        const isPinned = detail.pinned;
        queueMicrotask(() => {
          setSidebarPinned(isPinned);
        });
      }
    };
    window.addEventListener("suite-sidebar:state", onSidebar);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("suite-sidebar:state", onSidebar);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const updateAccent = (accent: CrmAccentId) => {
    const next = { ...prefs, accent };
    setPrefs(next);
    writeCrmThemePrefs(next);
    applyCrmAccent(accent);
  };

  const setLayout = (pinned: boolean) => {
    setSidebarPinned(pinned);
    setSuiteSidebarPinned(pinned);
  };

  const adjustSidebarWidth = (delta: number) => {
    const next = Math.min(
      CRM_SIDEBAR_WIDTH_MAX,
      Math.max(CRM_SIDEBAR_WIDTH_MIN, prefs.sidebarWidthRem + delta),
    );
    if (next === prefs.sidebarWidthRem) return;
    const updated = { ...prefs, sidebarWidthRem: next };
    setPrefs(updated);
    setCrmSidebarWidthRem(next);
  };

  const resetAll = () => {
    setPrefs(CRM_THEME_PREFS_DEFAULT);
    writeCrmThemePrefs(CRM_THEME_PREFS_DEFAULT);
    applyCrmAccent(CRM_THEME_PREFS_DEFAULT.accent);
    setCrmSidebarWidthRem(CRM_SIDEBAR_WIDTH_DEFAULT);
    setTheme("light");
    setLayout(true);
  };

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <>
      {/* CRMS `.toggle-theme` — fixed gear on the right edge */}
      <button
        type="button"
        className={cn(
          "crm-theme-toggle fixed right-0 top-1/2 z-[80] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-l-[8px] bg-[var(--primary,#e41f07)] text-white shadow-[0_4px_14px_rgba(228,31,7,0.35)] transition-transform hover:brightness-110",
          open && "translate-x-full opacity-0 pointer-events-none",
        )}
        aria-label="Open theme customizer"
        title="Theme customizer"
        onClick={() => setOpen(true)}
      >
        <CrmIcon.Settings size={22} aria-hidden />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[90] overflow-hidden" role="dialog" aria-modal aria-labelledby="crm-theme-customizer-title">
          <button
            type="button"
            className="absolute inset-0 bg-[#202c4b]/45 animate-in fade-in duration-200"
            aria-label="Close theme customizer"
            onClick={() => setOpen(false)}
          />

          <div className="absolute inset-y-0 right-0 flex w-full max-w-[400px] flex-col bg-[var(--card-bg,#fff)] shadow-[var(--crm-shadow-raised)] animate-in slide-in-from-right duration-200">
            <div className="flex shrink-0 items-center gap-2 bg-[var(--primary,#e41f07)] px-4 py-3.5 text-white">
              <h2 id="crm-theme-customizer-title" className="flex-1 text-base font-semibold leading-none">
                Theme Customizer
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-[5px] text-white/90 hover:bg-white/15"
                aria-label="Close"
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5 custom-scrollbar">
              {/* Color mode */}
              <section className="rounded-[8px] border border-[var(--border-color)] bg-white p-3 shadow-sm dark:bg-[var(--card-bg)]">
                <h3 className="mb-2.5 text-sm font-semibold text-[var(--text-main)]">Color Mode</h3>
                <div className="grid grid-cols-2 gap-2.5">
                  <ModeCard
                    active={mounted && !isDark}
                    label="Light"
                    icon={<Sun size={18} />}
                    onClick={() => setTheme("light")}
                  />
                  <ModeCard
                    active={mounted && isDark}
                    label="Dark"
                    icon={<Moon size={18} />}
                    onClick={() => setTheme("dark")}
                  />
                </div>
              </section>

              {/* Layout */}
              <section className="rounded-[8px] border border-[var(--border-color)] bg-white p-3 shadow-sm dark:bg-[var(--card-bg)]">
                <h3 className="mb-2.5 text-sm font-semibold text-[var(--text-main)]">Sidebar Layout</h3>
                <div className="grid grid-cols-2 gap-2.5">
                  <LayoutCard
                    active={sidebarPinned}
                    label="Default"
                    icon={<PanelLeft size={18} />}
                    onClick={() => setLayout(true)}
                  />
                  <LayoutCard
                    active={!sidebarPinned}
                    label="Mini"
                    icon={<PanelLeftClose size={18} />}
                    onClick={() => setLayout(false)}
                  />
                </div>
                <div className="mt-3 border-t border-[var(--border-color)] pt-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-[var(--text-main)]">Sidebar width</h4>
                    <span className="text-xs tabular-nums text-[var(--text-muted)]">
                      {prefs.sidebarWidthRem}rem
                    </span>
                  </div>
                  <p className="mb-2.5 text-xs text-[var(--text-muted)]">
                    Widen the CRM rail so nested labels stay readable.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => adjustSidebarWidth(-CRM_SIDEBAR_WIDTH_STEP)}
                      disabled={prefs.sidebarWidthRem <= CRM_SIDEBAR_WIDTH_MIN}
                      aria-label="Decrease sidebar width"
                      className={cn(
                        "inline-flex h-9 w-9 items-center justify-center rounded-[6px] border border-[var(--border-color)] bg-[var(--surface-dim)] text-[var(--text-main)] transition-colors hover:border-[var(--primary)]/40 hover:text-[var(--primary)]",
                        prefs.sidebarWidthRem <= CRM_SIDEBAR_WIDTH_MIN &&
                          "cursor-not-allowed opacity-40 hover:border-[var(--border-color)] hover:text-[var(--text-main)]",
                      )}
                    >
                      <Minus size={16} strokeWidth={2.25} />
                    </button>
                    <div className="flex h-9 flex-1 items-center justify-center rounded-[6px] border border-[var(--border-color)] bg-white text-sm font-medium tabular-nums text-[var(--text-main)] dark:bg-[var(--card-bg)]">
                      {prefs.sidebarWidthRem}rem
                    </div>
                    <button
                      type="button"
                      onClick={() => adjustSidebarWidth(CRM_SIDEBAR_WIDTH_STEP)}
                      disabled={prefs.sidebarWidthRem >= CRM_SIDEBAR_WIDTH_MAX}
                      aria-label="Increase sidebar width"
                      className={cn(
                        "inline-flex h-9 w-9 items-center justify-center rounded-[6px] border border-[var(--border-color)] bg-[var(--surface-dim)] text-[var(--text-main)] transition-colors hover:border-[var(--primary)]/40 hover:text-[var(--primary)]",
                        prefs.sidebarWidthRem >= CRM_SIDEBAR_WIDTH_MAX &&
                          "cursor-not-allowed opacity-40 hover:border-[var(--border-color)] hover:text-[var(--text-main)]",
                      )}
                    >
                      <Plus size={16} strokeWidth={2.25} />
                    </button>
                  </div>
                </div>
              </section>

              {/* Accent */}
              <section className="rounded-[8px] border border-[var(--border-color)] bg-white p-3 shadow-sm dark:bg-[var(--card-bg)]">
                <h3 className="mb-1 text-sm font-semibold text-[var(--text-main)]">Accent Color</h3>
                <p className="mb-2.5 text-xs text-[var(--text-muted)]">
                  Buttons, links, and active nav — CRM only.
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {CRM_ACCENT_PRESETS.map((preset) => {
                    const active = prefs.accent === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        title={preset.label}
                        aria-label={preset.label}
                        aria-pressed={active}
                        onClick={() => updateAccent(preset.id)}
                        className={cn(
                          "relative h-9 w-9 rounded-full border-2 transition-transform hover:scale-105",
                          active ? "border-[var(--text-main)]" : "border-transparent",
                        )}
                        style={{ background: preset.swatch }}
                      >
                        {active ? (
                          <Check
                            size={14}
                            strokeWidth={3}
                            className="absolute inset-0 m-auto text-white drop-shadow"
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Mathionix setup shortcuts */}
              <section className="rounded-[8px] border border-[var(--border-color)] bg-white p-3 shadow-sm dark:bg-[var(--card-bg)]">
                <h3 className="mb-1 text-sm font-semibold text-[var(--text-main)]">CRM Setup</h3>
                <p className="mb-2.5 text-xs text-[var(--text-muted)]">
                  Shortcuts for how your team works leads and deals.
                </p>
                <ul className="space-y-1">
                  {QUICK_LINKS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-sm font-medium text-[var(--text-main)] transition-colors hover:bg-[var(--surface-dim)] hover:text-[var(--primary)]"
                        >
                          <Icon size={16} className="shrink-0 text-[var(--text-muted)]" />
                          <span className="flex-1 truncate">{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>

            <div className="flex shrink-0 gap-2 border-t border-[var(--border-color)] bg-[var(--card-bg)] p-3.5">
              <button
                type="button"
                onClick={resetAll}
                className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[5px] border border-[var(--border-color)] bg-white text-sm font-medium text-[var(--text-main)] shadow-[var(--crm-shadow-input)] hover:bg-[var(--surface-dim)] dark:bg-[var(--surface-dim)]"
              >
                <RotateCcw size={15} />
                Reset
              </button>
              <Link
                href="/crm/settings"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 flex-[1.4] items-center justify-center gap-1.5 rounded-[5px] bg-[var(--primary)] text-sm font-medium text-white shadow-[var(--crm-shadow-button-hover)] hover:bg-[var(--primary-dark)]"
              >
                <Settings size={15} />
                All settings
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ModeCard({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative flex flex-col items-center gap-1.5 rounded-[8px] border-2 px-2 py-3 text-sm font-medium transition-colors",
        active
          ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)]"
          : "border-[var(--border-color)] bg-[var(--surface-dim)] text-[var(--text-main)] hover:border-[var(--primary)]/40",
      )}
    >
      {active ? (
        <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--primary)] text-white">
          <Check size={10} strokeWidth={3} />
        </span>
      ) : null}
      {icon}
      {label}
    </button>
  );
}

function LayoutCard({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative flex flex-col items-center gap-1.5 rounded-[8px] border-2 px-2 py-3 text-sm font-medium transition-colors",
        active
          ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)]"
          : "border-[var(--border-color)] bg-[var(--surface-dim)] text-[var(--text-main)] hover:border-[var(--primary)]/40",
      )}
    >
      {active ? (
        <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--success,#28c76f)] text-white">
          <Check size={10} strokeWidth={3} />
        </span>
      ) : null}
      <span className="text-[var(--text-muted)]">{icon}</span>
      {label}
    </button>
  );
}
