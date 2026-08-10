"use client";

import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "../utils";
import { CRM_PANEL_RAISED } from "./tokens";

export type KpiCardProps = {
  label: string;
  value: string | number;
  /** Muted caption under the value (e.g. "From last week") */
  sub?: string;
  icon?: ReactNode;
  /** Direction — colors the trend chip, not the main value */
  trend?: "up" | "down" | "neutral";
  /** Explicit trend text e.g. "+2.5%" — falls back to `sub` when omitted */
  trendValue?: string;
  className?: string;
  onClick?: () => void;
};

/** Dashboard KPI tile — soft panel, icon well, optional trend chip */
export function KpiCard({
  label,
  value,
  sub,
  icon,
  trend,
  trendValue,
  className,
  onClick,
}: KpiCardProps) {
  const Comp = onClick ? "button" : "div";
  const delta = trendValue ?? (trend && sub ? sub : undefined);
  const caption = trendValue ? sub : trend ? undefined : sub;

  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        CRM_PANEL_RAISED,
        "crm-kpi group relative flex flex-col gap-2 overflow-hidden p-4 text-left sm:p-5",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium text-[var(--text-muted)]">{label}</span>
        {icon ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[5px] bg-[var(--primary-light)] text-[var(--primary)] transition-colors">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="text-[1.5rem] font-bold tabular-nums tracking-tight text-[var(--text-main)]">
        {value}
      </p>
      {(delta || caption) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {delta ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-[6px] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                trend === "down"
                  ? "bg-[var(--error-light)] text-[var(--error)]"
                  : trend === "neutral"
                    ? "bg-[var(--surface-dim)] text-[var(--text-muted)]"
                    : "bg-[var(--success-light)] text-[var(--success)]",
              )}
            >
              {trend === "down" ? (
                <ArrowDownRight className="h-3 w-3" aria-hidden />
              ) : trend === "up" ? (
                <ArrowUpRight className="h-3 w-3" aria-hidden />
              ) : null}
              {delta}
            </span>
          ) : null}
          {caption ? (
            <span className="text-xs font-medium leading-snug text-[var(--text-muted)]">{caption}</span>
          ) : null}
        </div>
      )}
    </Comp>
  );
}

/** @deprecated Prefer `KpiCard` */
export const CrmKpiCard = KpiCard;
export type CrmKpiCardProps = KpiCardProps;
