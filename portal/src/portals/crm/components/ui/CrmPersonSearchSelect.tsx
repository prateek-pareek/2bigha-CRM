"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type CrmPersonSearchOption = {
  value: string;
  label: string;
  /** Extra tokens for search (email, role, etc.) */
  keywords?: string;
  group?: string;
};

function matchesQuery(opt: CrmPersonSearchOption, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = `${opt.label} ${opt.keywords || ""} ${opt.value}`.toLowerCase();
  return hay.includes(needle);
}

export function CrmPersonSearchSelect({
  value,
  onChange,
  options,
  placeholder = "Type a name to search…",
  emptyLabel = "Unassigned",
  allowClear = true,
  disabled,
  className,
  triggerClassName,
  contentClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  options: CrmPersonSearchOption[];
  placeholder?: string;
  /** Shown when value is empty */
  emptyLabel?: string;
  allowClear?: boolean;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuPos, setMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    placement: "bottom" | "top";
  } | null>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  const filtered = useMemo(
    () => options.filter((o) => matchesQuery(o, query)),
    [options, query],
  );

  const groups = useMemo(() => {
    const map = new Map<string, CrmPersonSearchOption[]>();
    for (const opt of filtered) {
      const g = opt.group || "People";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(opt);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const updateMenuPos = () => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const preferred = 260;
    const spaceBelow = Math.max(0, window.innerHeight - r.bottom - 12);
    const spaceAbove = Math.max(0, r.top - 12);
    const placeTop = spaceBelow < 180 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(140, Math.min(preferred, placeTop ? spaceAbove : spaceBelow));
    setMenuPos({
      top: placeTop ? Math.max(8, r.top - gap - maxHeight) : r.bottom + gap,
      left: Math.min(r.left, window.innerWidth - r.width - 8),
      width: r.width,
      maxHeight,
      placement: placeTop ? "top" : "bottom",
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPos();
    const onWin = () => updateMenuPos();
    window.addEventListener("resize", onWin);
    // Capture scroll on any ancestor so the menu stays aligned without nesting scrollbars.
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
      setQuery("");
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    const id = "crm-person-search-input-reset";
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = `
      input.crm-person-search-input,
      input.crm-person-search-input:hover,
      input.crm-person-search-input:focus,
      input.crm-person-search-input:focus-visible,
      input.crm-person-search-input:active,
      .theme-crm-hubspot input.crm-person-search-input,
      .theme-crm-hubspot input.crm-person-search-input:focus,
      .theme-crm-hubspot input.crm-person-search-input:focus-visible,
      [data-crm-app] input.crm-person-search-input,
      [data-crm-app] input.crm-person-search-input:focus,
      [data-crm-app] input.crm-person-search-input:focus-visible,
      .crm-modal input.crm-person-search-input,
      .crm-modal input.crm-person-search-input:focus,
      .crm-modal input.crm-person-search-input:focus-visible {
        border: none !important;
        border-width: 0 !important;
        border-style: none !important;
        border-color: transparent !important;
        border-radius: 0 !important;
        outline: none !important;
        box-shadow: none !important;
        background: transparent !important;
        background-color: transparent !important;
        -webkit-appearance: none !important;
        appearance: none !important;
        --tw-ring-shadow: 0 0 #0000 !important;
        --tw-ring-offset-shadow: 0 0 #0000 !important;
      }
      .crm-person-search-trigger:focus-within,
      .crm-person-search-trigger[data-open="true"] {
        border-color: #64748b !important;
        box-shadow: none !important;
      }
    `;
    document.head.appendChild(el);
  }, []);

  const pick = (next: string) => {
    onChange(next);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const showClearRow =
    allowClear &&
    (!query.trim() || emptyLabel.toLowerCase().includes(query.trim().toLowerCase()));

  const menu =
    open && menuPos && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={listRef}
            className={cn(
              "fixed overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl",
              contentClassName,
            )}
            style={{
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              maxHeight: menuPos.maxHeight,
              zIndex: 2147483000,
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <ul
              className="overflow-y-auto overscroll-contain py-1"
              style={{ maxHeight: menuPos.maxHeight }}
              role="listbox"
            >
              {showClearRow ? (
                <li>
                  <button
                    type="button"
                    role="option"
                    aria-selected={!value}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50",
                      !value && "bg-slate-50",
                    )}
                    onClick={() => pick("")}
                  >
                    <Check
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        !value ? "text-[var(--primary)] opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="text-slate-500">{emptyLabel}</span>
                  </button>
                </li>
              ) : null}

              {filtered.length === 0 ? (
                <li className="px-3 py-3 text-center text-xs text-slate-500">
                  No matching person.
                </li>
              ) : (
                groups.map(([groupName, rows]) => (
                  <li key={groupName}>
                    <p className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {groupName}
                    </p>
                    <ul>
                      {rows.map((opt, idx) => (
                        <li key={`${groupName}-${opt.value || "empty"}-${idx}`}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={value === opt.value}
                            className={cn(
                              "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50",
                              value === opt.value && "bg-slate-50",
                            )}
                            onClick={() => pick(opt.value)}
                          >
                            <Check
                              className={cn(
                                "h-3.5 w-3.5 shrink-0",
                                value === opt.value
                                  ? "text-[var(--primary)] opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            <span className="min-w-0 truncate">{opt.label}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))
              )}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={cn("relative min-w-0 w-full", className)}>
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "crm-person-search-trigger flex h-9 w-full min-w-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5",
          "transition-colors",
          disabled && "pointer-events-none opacity-50",
          open && "border-slate-500",
          triggerClassName,
        )}
        data-open={open ? "true" : undefined}
      >
        <input
          ref={inputRef}
          type="text"
          aria-autocomplete="list"
          disabled={disabled}
          autoComplete="off"
          placeholder={open ? placeholder : selected?.label || emptyLabel}
          value={open ? query : selected?.label || ""}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onClick={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
              inputRef.current?.blur();
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (filtered.length === 1) pick(filtered[0].value);
              else if (!query.trim() && allowClear) pick("");
            }
          }}
          className={cn(
            "crm-person-search-input min-w-0 flex-1 p-0 text-sm leading-none text-[var(--text-main)]",
            "placeholder:text-[var(--text-muted)]",
            !selected && !open && "text-[var(--text-muted)]",
          )}
        />
        {value && !disabled ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Clear"
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)]"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick("")}
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        ) : null}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]/70 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </div>
      {menu}
    </div>
  );
}
