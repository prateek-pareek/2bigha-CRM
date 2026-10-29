"use client";

import { useState } from "react";
import { Check, ChevronDown, Flame, Snowflake, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type LeadTemperature = "hot" | "warm" | "cold";

export const LEAD_TEMPERATURES: LeadTemperature[] = ["hot", "warm", "cold"];

const META: Record<
  LeadTemperature,
  { label: string; hint: string; icon: typeof Flame; pill: string; dot: string }
> = {
  hot: {
    label: "Hot",
    hint: "Ready to buy — follow up now",
    icon: Flame,
    pill: "bg-[#fce9e6] text-[#e41f07]",
    dot: "bg-[#e41f07]",
  },
  warm: {
    label: "Warm",
    hint: "Interested — needs nurturing",
    icon: Sun,
    pill: "bg-[#fff0e1] text-[#e8820c]",
    dot: "bg-[#ff9f43]",
  },
  cold: {
    label: "Cold",
    hint: "Low interest or no response",
    icon: Snowflake,
    pill: "bg-[#eaf2fd] text-[#2f80ed]",
    dot: "bg-[#2f80ed]",
  },
};

export function normalizeLeadTemperature(value: unknown): LeadTemperature | null {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "hot" || v === "warm" || v === "cold" ? v : null;
}

/** Read-only pill (also used for CSV/exports and non-editable viewers). */
export function CrmLeadTemperatureBadge({
  value,
  className,
}: {
  value?: string | null;
  className?: string;
}) {
  const t = normalizeLeadTemperature(value);
  if (!t) return <span className="text-[14px] font-normal text-[#707070]">—</span>;
  const m = META[t];
  const Icon = m.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-[4px] text-[12px] font-medium leading-[12px]",
        m.pill,
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {m.label}
    </span>
  );
}

/**
 * Table cell: shows the hot/warm/cold pill; when `editable`, clicking opens a picker that
 * saves through `onChange` (caller does the optimistic update + API call).
 */
export function CrmLeadTemperatureCell({
  value,
  editable,
  onChange,
}: {
  value?: string | null;
  editable: boolean;
  onChange: (next: LeadTemperature | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = normalizeLeadTemperature(value);

  if (!editable) return <CrmLeadTemperatureBadge value={value} />;

  const pick = (next: LeadTemperature | null) => {
    setOpen(false);
    if (next !== current) onChange(next);
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Change lead temperature"
            className="group/temp inline-flex items-center gap-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#e41f07]/40"
          >
            {current ? (
              <CrmLeadTemperatureBadge value={current} />
            ) : (
              <span className="inline-flex items-center rounded-full border border-dashed border-[#c9ccd1] px-2 py-[4px] text-[12px] leading-[12px] text-[#707070] hover:border-[#e41f07] hover:text-[#e41f07]">
                Set
              </span>
            )}
            <ChevronDown className="h-3 w-3 text-[#9aa0a6] opacity-0 transition-opacity group-hover/temp:opacity-100" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[230px] p-1">
          {LEAD_TEMPERATURES.map((t) => {
            const m = META[t];
            const Icon = m.icon;
            return (
              <button
                key={t}
                type="button"
                onClick={() => pick(t)}
                className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-[#f6f7f9]"
              >
                <span className={cn("mt-[3px] h-2 w-2 shrink-0 rounded-full", m.dot)} />
                <span className="flex-1">
                  <span className="flex items-center gap-1 text-[13px] font-medium text-[#1f2328]">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {m.label}
                  </span>
                  <span className="block text-[11px] text-[#707070]">{m.hint}</span>
                </span>
                {current === t && <Check className="mt-[2px] h-4 w-4 text-[#1abe17]" />}
              </button>
            );
          })}
          {current && (
            <button
              type="button"
              onClick={() => pick(null)}
              className="mt-1 w-full rounded-md border-t border-[#eceef1] px-2 py-2 text-left text-[12px] text-[#707070] hover:bg-[#f6f7f9]"
            >
              Clear rating
            </button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
