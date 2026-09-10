"use client";

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronDown, Clock, Check } from 'lucide-react';
import { cn } from "@/lib/utils";
import { DatePickerField } from "@/components/ui/date-picker";

interface DateRange {
  from: string;
  to: string;
  label: string;
}

interface CRMDateRangePickerProps {
  onChange: (range: { from: string; to: string } | null) => void;
  className?: string;
  initialLabel?: string;
  /** Icon-only trigger; selected range is in `title` and `aria-label` for accessibility */
  compact?: boolean;
}

const toLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const PREDEFINED_RANGES = [
  { label: 'All Time', getValue: () => null },
  { label: 'Today', getValue: () => {
    const d = toLocalDateString(new Date());
    return { from: d, to: d };
  }},
  { label: 'Yesterday', getValue: () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const s = toLocalDateString(d);
    return { from: s, to: s };
  }},
  { label: 'This Week', getValue: () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(new Date().setDate(diff));
    return { from: toLocalDateString(monday), to: toLocalDateString(new Date()) };
  }},
  { label: 'Last 7 Days', getValue: () => {
    const d = new Date();
    const start = new Date();
    start.setDate(d.getDate() - 7);
    return { from: toLocalDateString(start), to: toLocalDateString(d) };
  }},
  { label: 'This Month', getValue: () => {
    const d = new Date();
    const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
    return { from: toLocalDateString(firstDay), to: toLocalDateString(d) };
  }},
  { label: 'Last 30 Days', getValue: () => {
    const d = new Date();
    const start = new Date();
    start.setDate(d.getDate() - 30);
    return { from: toLocalDateString(start), to: toLocalDateString(d) };
  }},
];

export default function CRMDateRangePicker({
  onChange,
  className,
  initialLabel = 'All Time',
  compact = false,
}: CRMDateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState(initialLabel);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, maxHeight: 520 });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      const el = event.target as Element;
      if (el?.closest?.('[data-radix-popper-content-wrapper]')) return;
      setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const updatePosition = () => {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const pad = 12;
      const menuWidth = 256;
      const spaceBelow = window.innerHeight - r.bottom - pad;
      const spaceAbove = r.top - pad;
      const openUp = spaceBelow < 420 && spaceAbove > spaceBelow;
      const maxHeight = Math.min(560, Math.max(280, openUp ? spaceAbove : spaceBelow));
      const left = Math.min(r.left, Math.max(pad, window.innerWidth - menuWidth - pad));
      const top = openUp ? Math.max(pad, r.top - maxHeight - 8) : r.bottom + 8;
      setMenuPos({ top, left, maxHeight });
    };
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen]);

  const handleSelectRange = (range: typeof PREDEFINED_RANGES[0]) => {
    const val = range.getValue();
    setSelectedLabel(range.label);
    onChange(val);
    setIsOpen(false);
    if (val) {
      setCustomFrom(val.from);
      setCustomTo(val.to);
    } else {
      setCustomFrom('');
      setCustomTo('');
    }
  };

  const handleApplyCustom = () => {
    if (customFrom && customTo) {
      setSelectedLabel(`${customFrom} - ${customTo}`);
      onChange({ from: customFrom, to: customTo });
      setIsOpen(false);
    }
  };

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title={compact ? `Created: ${selectedLabel}` : undefined}
        aria-label={compact ? `Filter leads by created date, ${selectedLabel}` : undefined}
        className={cn(
          "flex items-center rounded-[3px] text-sm font-bold transition-all border shrink-0",
          compact
            ? "h-8 justify-center gap-0.5 px-2"
            : "gap-2 px-4 h-10",
          selectedLabel !== 'All Time'
            ? "bg-primary/10 text-primary border-primary/20 shadow-sm"
            : "bg-surface-dim text-text-muted border-border/60 hover:border-text-muted/30 hover:bg-white dark:hover:bg-[var(--surface-hover)]",
        )}
      >
        <Calendar
          size={compact ? 17 : 16}
          strokeWidth={2.5}
          className={selectedLabel !== 'All Time' ? "text-primary" : "text-text-muted"}
          aria-hidden
        />
        {!compact ? (
          <>
            <span className="truncate max-w-[120px] md:max-w-none">{selectedLabel}</span>
            <ChevronDown size={14} className={cn("transition-transform duration-200", isOpen && "rotate-180")} />
          </>
        ) : (
          <ChevronDown
            size={13}
            className={cn(
              "shrink-0 opacity-70 transition-transform duration-200",
              isOpen && "rotate-180",
            )}
            aria-hidden
          />
        )}
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
        <div
          ref={menuRef}
          className="fixed z-[9999] w-56 sm:w-64 bg-card rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] shadow-[var(--crm-shadow-raised)] overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col"
          style={{ top: menuPos.top, left: menuPos.left, maxHeight: menuPos.maxHeight }}
        >
          <div className="p-3 sm:p-4 border-b border-border/40 bg-surface-dim/30 shrink-0">
            <span className="text-xs font-black text-text-muted pl-1">Filter by Period</span>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
            <div className="py-1 sm:py-2">
              {PREDEFINED_RANGES.map((range) => (
                <button
                  key={range.label}
                  type="button"
                  onClick={() => handleSelectRange(range)}
                  className={cn(
                    "w-full px-3 sm:px-5 py-2 text-left text-xs sm:text-sm font-bold transition-all flex items-center justify-between group",
                    selectedLabel === range.label ? "bg-primary/5 text-primary" : "text-text-main hover:bg-surface-dim"
                  )}
                >
                  {range.label}
                  {selectedLabel === range.label && <Check size={14} strokeWidth={3} className="text-primary" />}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 sm:p-4 border-t border-border/40 bg-surface-dim/30 space-y-2 sm:space-y-3 shrink-0">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={12} className="text-text-muted" />
              <span className="text-xs font-black text-text-muted">Custom Range</span>
            </div>
            <div className="space-y-2 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-3">
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-text-muted uppercase pl-1">From</span>
                <DatePickerField
                  value={customFrom}
                  onChange={setCustomFrom}
                  placeholder="Start"
                  disableFuture
                  buttonClassName="h-8 sm:h-9 w-full justify-start rounded-[3px] border-border/60 bg-white dark:bg-[var(--card-bg)] dark:text-[var(--text-main)] px-2 text-xs font-bold"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-text-muted uppercase pl-1">To</span>
                <DatePickerField
                  value={customTo}
                  onChange={setCustomTo}
                  placeholder="End"
                  disableFuture
                  buttonClassName="h-8 sm:h-9 w-full justify-start rounded-[3px] border-border/60 bg-white dark:bg-[var(--card-bg)] dark:text-[var(--text-main)] px-2 text-xs font-bold"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleApplyCustom}
              disabled={!customFrom || !customTo}
              className="w-full py-2 sm:py-2.5 bg-[var(--hs-link)] text-white text-xs font-semibold rounded-[3px] mt-1 sm:mt-2 disabled:opacity-50 hover:bg-[var(--hs-link-hover)] transition-all shadow-sm"
            >
              Apply Filter
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
