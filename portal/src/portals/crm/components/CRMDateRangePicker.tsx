"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, Check, ChevronDown, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { DatePickerField } from "@/components/ui/date-picker";
import {
  CRM_DATE_RANGE_PRESETS,
  concreteRangeForWindow,
  formatDateWindowLabel,
  windowFromPresetLabel,
} from "@/lib/crm/shared/date-range-window";

interface CRMDateRangePickerProps {
  /**
   * Preset key (`this_month`, `last_7_days`, …) or `YYYY-MM-DD,YYYY-MM-DD`.
   * Omit to keep the picker uncontrolled.
   */
  value?: string;
  /** Date pair for list filters. `null` means all time / no bound. */
  onChange?: (range: { from: string; to: string } | null) => void;
  /** API window string. Use this on dashboards and reports. */
  onWindowChange?: (window: string) => void;
  className?: string;
  initialLabel?: string;
  /** Icon-only trigger; the selected range is in `title` and `aria-label`. */
  compact?: boolean;
}

const MENU_WIDTH = 340;

const FIELD_BUTTON =
  "h-9 w-full min-w-0 justify-start gap-1 overflow-hidden rounded-md border-[var(--border-color)] bg-white px-2 text-xs font-semibold text-[var(--text-main)] shadow-none hover:bg-[var(--background)] dark:bg-[var(--card-bg)] [&_svg]:mr-0 [&_svg]:h-3.5 [&_svg]:w-3.5";

export default function CRMDateRangePicker({
  value,
  onChange,
  onWindowChange,
  className,
  initialLabel = "All Time",
  compact = false,
}: CRMDateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [internalWindow, setInternalWindow] = useState(() => windowFromPresetLabel(initialLabel));
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  const activeWindow = value ?? internalWindow;
  const activeLabel = formatDateWindowLabel(activeWindow);
  const orderInvalid = Boolean(customFrom && customTo && customFrom > customTo);

  useEffect(() => {
    if (!value) return;
    if (!value.includes(",")) {
      setCustomFrom("");
      setCustomTo("");
      return;
    }
    const [from, to] = value.split(",", 2);
    setCustomFrom(String(from || "").trim().slice(0, 10));
    setCustomTo(String(to || "").trim().slice(0, 10));
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      const el = event.target as Element;
      if (el?.closest?.("[data-radix-popper-content-wrapper]")) return;
      setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuPos(null);
      return;
    }
    const updatePosition = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pad = 12;
      const width = Math.min(MENU_WIDTH, window.innerWidth - pad * 2);
      const spaceBelow = window.innerHeight - rect.bottom - pad;
      const spaceAbove = rect.top - pad;
      const openUp = spaceBelow < 420 && spaceAbove > spaceBelow;
      const maxHeight = Math.min(560, Math.max(320, openUp ? spaceAbove : spaceBelow));
      const left = Math.min(Math.max(pad, rect.left), Math.max(pad, window.innerWidth - width - pad));
      const top = openUp ? Math.max(pad, rect.top - maxHeight - 8) : rect.bottom + 8;
      setMenuPos({ top, left, maxHeight });
    };
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen]);

  const emit = (windowKey: string) => {
    setInternalWindow(windowKey);
    onWindowChange?.(windowKey);
    onChange?.(concreteRangeForWindow(windowKey));
  };

  const selectPreset = (preset: string) => {
    setCustomFrom("");
    setCustomTo("");
    emit(preset);
    setIsOpen(false);
  };

  const applyCustom = () => {
    if (!customFrom || !customTo || orderInvalid) return;
    emit(`${customFrom},${customTo}`);
    setIsOpen(false);
  };

  const presetActive = !activeWindow.includes(",") && activeWindow.toLowerCase();

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title={compact ? `Date range: ${activeLabel}` : activeLabel}
        aria-label={compact ? `Filter by date range, ${activeLabel}` : `Date range, ${activeLabel}`}
        className={cn(
          "flex items-center rounded-md border text-sm font-semibold transition-colors",
          compact ? "h-8 justify-center gap-0.5 px-2" : "h-10 gap-2 px-3",
          presetActive !== "all_time"
            ? "border-primary/25 bg-primary/10 text-primary shadow-sm"
            : "border-[var(--border-color)] bg-[var(--surface-dim)] text-[var(--text-main)] hover:border-[var(--text-muted)]",
        )}
      >
        <Calendar size={compact ? 16 : 15} strokeWidth={2.25} className="shrink-0" aria-hidden />
        {!compact ? (
          <span className="max-w-[11rem] truncate">{activeLabel}</span>
        ) : null}
        <ChevronDown
          size={14}
          className={cn("shrink-0 opacity-70 transition-transform duration-200", isOpen && "rotate-180")}
          aria-hidden
        />
      </button>

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="dialog"
            aria-label="Filter by period"
            className="fixed z-[9999] flex w-[340px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] shadow-[var(--crm-shadow-raised)]"
            style={
              menuPos
                ? { top: menuPos.top, left: menuPos.left, maxHeight: menuPos.maxHeight }
                : { top: 0, left: 0, visibility: "hidden" }
            }
          >
            <div className="shrink-0 border-b border-[var(--border-color)] bg-[var(--background)] px-3 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Filter by period
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {CRM_DATE_RANGE_PRESETS.map((preset) => {
                const selected = presetActive === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => selectPreset(preset.value)}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium transition-colors",
                      selected
                        ? "bg-primary/10 font-semibold text-primary"
                        : "text-[var(--text-main)] hover:bg-[var(--background)]",
                    )}
                  >
                    {preset.label}
                    {selected ? <Check size={14} strokeWidth={2.5} className="shrink-0 text-primary" /> : null}
                  </button>
                );
              })}
            </div>

            <div className="shrink-0 space-y-2.5 border-t border-[var(--border-color)] bg-[var(--background)] p-3">
              <div className="flex items-center gap-1.5">
                <Clock size={12} className="text-[var(--text-muted)]" aria-hidden />
                <span className="text-xs font-semibold text-[var(--text-muted)]">Custom range</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0 space-y-1 overflow-hidden">
                  <span className="block px-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    From
                  </span>
                  <DatePickerField
                    value={customFrom}
                    onChange={setCustomFrom}
                    placeholder="Start"
                    disableFuture
                    buttonClassName={FIELD_BUTTON}
                  />
                </div>
                <div className="min-w-0 space-y-1 overflow-hidden">
                  <span className="block px-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    To
                  </span>
                  <DatePickerField
                    value={customTo}
                    onChange={setCustomTo}
                    placeholder="End"
                    disableFuture
                    buttonClassName={FIELD_BUTTON}
                  />
                </div>
              </div>
              {orderInvalid ? (
                <p className="text-[11px] font-medium text-red-600">From must be on or before To.</p>
              ) : null}
              <button
                type="button"
                onClick={applyCustom}
                disabled={!customFrom || !customTo || orderInvalid}
                className="h-9 w-full rounded-md bg-[var(--hs-link)] text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--hs-link-hover)] disabled:opacity-50"
              >
                Apply filter
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
