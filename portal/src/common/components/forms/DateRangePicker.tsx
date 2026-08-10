"use client";

import { useState, useEffect, useRef } from 'react';
import { Calendar, ChevronDown, Clock, Check } from 'lucide-react';
import { cn } from "@/lib/utils";
import { DatePickerField } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
interface DateRange {
  from: string;
  to: string;
  label: string;
}

interface DateRangePickerProps {
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

export default function DateRangePicker({
  onChange,
  className,
  initialLabel = 'All Time',
  compact = false,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState(initialLabel);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        const target = event.target as Element;
        if (target?.closest?.('[data-radix-popper-content-wrapper]')) {
          return;
        }
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      <Button
        type="button"
        variant={compact ? "ghost" : "secondary"}
        size={compact ? "icon" : "default"}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title={compact ? `Created: ${selectedLabel}` : undefined}
        aria-label={compact ? `Filter leads by created date, ${selectedLabel}` : undefined}
        className={cn(
          "inline-flex items-center gap-1.5",
          compact ? "w-auto min-w-[38px] gap-0.5 px-2.5" : undefined,
          selectedLabel !== 'All Time' &&
            "border-[color-mix(in_srgb,var(--primary)_25%,transparent)] bg-[var(--primary-light)] text-[var(--primary)] hover:bg-[var(--primary-light)]",
        )}
      >
        <Calendar
          size={compact ? 17 : 16}
          strokeWidth={2}
          className={selectedLabel !== 'All Time' ? "text-primary" : undefined}
          aria-hidden
        />
        {!compact ? (
          <span className="max-w-[120px] truncate md:max-w-none">{selectedLabel}</span>
        ) : null}
        <ChevronDown
          size={compact ? 13 : 14}
          className={cn(
            "shrink-0 transition-transform duration-200",
            compact && "opacity-70",
            isOpen && "rotate-180",
          )}
          aria-hidden
        />
      </Button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-[999] w-64 bg-card rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] shadow-[var(--crm-shadow-raised)] overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[500px]">
          <div className="p-3 border-b border-[var(--border-color)] bg-[var(--background)] shrink-0">
            <span className="text-xs font-semibold text-text-muted pl-1">Filter by period</span>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
            <div className="py-1.5">
              {PREDEFINED_RANGES.map((range) => (
                <button
                  key={range.label}
                  onClick={() => handleSelectRange(range)}
                  className={cn(
                    "w-full px-4 py-2.5 text-left text-sm font-medium transition-all flex items-center justify-between group",
                    selectedLabel === range.label
                      ? "bg-[var(--primary-light)] text-primary"
                      : "text-text-main hover:bg-surface-dim"
                  )}
                >
                  {range.label}
                  {selectedLabel === range.label && <Check size={14} strokeWidth={2} className="text-primary" />}
                </button>
              ))}
            </div>

            <div className="p-3 border-t border-[var(--border-color)] bg-[var(--background)] space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock size={12} className="text-text-muted" />
                <span className="text-xs font-semibold text-text-muted">Custom range</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <span className="text-[10px] font-medium text-text-muted uppercase pl-1">From</span>
                  <DatePickerField
                    value={customFrom}
                    onChange={setCustomFrom}
                    placeholder="Start"
                    disableFuture
                    buttonClassName="h-[38px] w-full justify-start rounded-[var(--radius-md)] border-[var(--border-color)] bg-white dark:bg-[var(--card-bg)] dark:text-[var(--text-main)] px-2 text-xs font-medium shadow-[var(--crm-shadow-input)]"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-medium text-text-muted uppercase pl-1">To</span>
                  <DatePickerField
                    value={customTo}
                    onChange={setCustomTo}
                    placeholder="End"
                    disableFuture
                    buttonClassName="h-[38px] w-full justify-start rounded-[var(--radius-md)] border-[var(--border-color)] bg-white dark:bg-[var(--card-bg)] dark:text-[var(--text-main)] px-2 text-xs font-medium shadow-[var(--crm-shadow-input)]"
                  />
                </div>
              </div>
              <button 
                type="button"
                onClick={handleApplyCustom}
                disabled={!customFrom || !customTo}
                className="w-full h-[38px] bg-[var(--primary)] text-white text-sm font-medium rounded-[var(--radius-md)] mt-1 disabled:opacity-50 hover:bg-[var(--primary-dark)] transition-all shadow-sm"
              >
                Apply Filter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
