"use client";

import { cn } from "@/lib/utils";

export type DashboardPersonOption = {
  id: string;
  label: string;
  sublabel?: string;
};

type Props = {
  label: string;
  value: string;
  options: DashboardPersonOption[];
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

/**
 * Compact person picker for Admin / Team Lead dashboard drill-down.
 * Label sits beside the control — never inside the same bordered box —
 * so native select text cannot overlap the label (Windows Chrome issue).
 */
export function DashboardPersonSelect({
  label,
  value,
  options,
  onChange,
  placeholder = "Select…",
  className,
  disabled,
}: Props) {
  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <span className="shrink-0 text-xs font-medium text-[var(--text-muted)] whitespace-nowrap">
        {label}
      </span>
      <select
        value={value}
        disabled={disabled || options.length === 0}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-[38px] min-w-[170px] max-w-[260px] cursor-pointer appearance-none rounded-[5px] border border-[var(--border-color)] bg-white px-3 pr-8 text-sm font-medium text-[var(--text-main)] shadow-[var(--crm-shadow-input)] outline-none disabled:opacity-60 dark:bg-black dark:border-white/10"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.sublabel ? `${o.label} (${o.sublabel})` : o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
