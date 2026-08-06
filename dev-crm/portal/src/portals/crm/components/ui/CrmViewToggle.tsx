"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CrmIcon } from "@/lib/crm/shared/icons";

export type CrmViewMode = "kanban" | "list" | "grid" | "calendar";

type ModeConfig = {
  id: CrmViewMode;
  label: string;
  icon: ReactNode;
};

const DEFAULT_MODES: ModeConfig[] = [
  { id: "list", label: "Table view", icon: <CrmIcon.ListView size={16} aria-hidden /> },
  { id: "grid", label: "Card view", icon: <CrmIcon.CardView size={16} aria-hidden /> },
  { id: "kanban", label: "Board view", icon: <CrmIcon.GridView size={16} aria-hidden /> },
  { id: "calendar", label: "Calendar view", icon: <CrmIcon.Calendar size={16} aria-hidden /> },
];

type CrmViewToggleProps = {
  value: CrmViewMode | string;
  onChange: (mode: CrmViewMode) => void;
  /** Subset of modes to show — default list + kanban (CRMS) */
  modes?: CrmViewMode[];
  className?: string;
};

/**
 * CRMS `.view-icons` — ti-list-tree · ti-grid-dots
 * Reference: https://crms.dreamstechnologies.com/html/leads.html
 */
export function CrmViewToggle({
  value,
  onChange,
  modes = ["list", "kanban"],
  className,
}: CrmViewToggleProps) {
  const items = DEFAULT_MODES.filter((m) => modes.includes(m.id));
  return (
    <div
      className={cn(
        "view-icons inline-flex items-center gap-1 rounded-[5px] border border-[#e8e8e8] bg-white p-1 shadow-[var(--crm-shadow-input)]",
        className,
      )}
      role="group"
      aria-label="View mode"
    >
      {items.map((mode) => {
        const active = value === mode.id;
        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => onChange(mode.id)}
            title={mode.label}
            aria-label={mode.label}
            aria-pressed={active}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-[4px] border-0 text-sm transition-colors",
              active
                ? "bg-[var(--teal,#0e9384)] text-white"
                : "bg-transparent text-[#1f2020] hover:bg-[#f7f8f9]",
            )}
          >
            {mode.icon}
          </button>
        );
      })}
    </div>
  );
}
