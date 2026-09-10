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

/** Compact person picker for Admin / Team Lead dashboard drill-down. */
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
    <label
      className={cn(
        "inline-flex h-[38px] items-center gap-2 rounded-[5px] border border-[var(--border-color)] bg-white px-2.5 shadow-[var(--crm-shadow-input)] dark:bg-black dark:border-white/10",
        className,
      )}
    >
      <span className="shrink-0 text-xs font-medium text-[var(--text-muted)]">{label}</span>
      <select
        value={value}
        disabled={disabled || options.length === 0}
        onChange={(e) => onChange(e.target.value)}
        className="h-[34px] min-w-[160px] max-w-[240px] cursor-pointer appearance-none border-0 bg-transparent pr-1 text-sm font-medium text-[var(--text-main)] outline-none disabled:opacity-60"
        aria-label={label}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.sublabel ? `${o.label} (${o.sublabel})` : o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
