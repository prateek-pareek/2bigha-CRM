"use client";

import type { ReactNode } from "react";
import { cn } from "../utils";

export type StatusTone = "success" | "danger" | "warning" | "info" | "neutral" | "primary";

/** @deprecated Prefer `StatusTone` */
export type CrmStatusTone = StatusTone;

const TONE_SOFT: Record<StatusTone, string> = {
  success:
    "bg-[var(--success-light)] text-[var(--success)] border-[color-mix(in_srgb,var(--success)_25%,transparent)]",
  danger:
    "bg-[var(--error-light)] text-[var(--error)] border-[color-mix(in_srgb,var(--error)_25%,transparent)]",
  warning:
    "bg-[var(--warning-light)] text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_25%,transparent)]",
  info: "bg-[var(--info-light)] text-[var(--info)] border-[color-mix(in_srgb,var(--info)_25%,transparent)]",
  primary:
    "bg-[var(--primary-light)] text-[var(--primary)] border-[color-mix(in_srgb,var(--primary)_25%,transparent)]",
  neutral: "bg-[var(--surface-dim)] text-[var(--text-muted)] border-[var(--border-color)]",
};

const TONE_SOLID: Record<StatusTone, string> = {
  success: "bg-[#1abe17] text-white border-transparent",
  danger: "bg-[#ef1e1e] text-white border-transparent",
  warning: "bg-[#f9b801] text-white border-transparent",
  info: "bg-[#2f80ed] text-white border-transparent",
  primary: "bg-[var(--primary)] text-white border-transparent",
  neutral: "bg-[#707070] text-white border-transparent",
};

export function statusToneFromLabel(label: string): StatusTone {
  const s = (label || "").trim().toLowerCase();
  if (!s) return "neutral";
  if (/lost|reject|dead|fail|churn|inactive/.test(s)) return "danger";
  if (/won|closed|done|complete|success|active/.test(s)) return "success";
  if (/not\s*contacted|new|open|prospect|unassigned|inbox/.test(s)) return "info";
  if (/contacted|qualified|warm|pending/.test(s)) return "warning";
  if (/negotiat|proposal|demo|meeting|pilot/.test(s)) return "primary";
  return "neutral";
}

/** @deprecated Prefer `statusToneFromLabel` */
export const crmStatusToneFromLabel = statusToneFromLabel;

export type StatusBadgeProps = {
  children: ReactNode;
  tone?: StatusTone;
  /** soft = tinted chip; solid = saturated list status pill */
  variant?: "soft" | "solid";
  className?: string;
};

/** Status / tag pill — soft tint or solid fill */
export function StatusBadge({
  children,
  tone = "neutral",
  variant = "soft",
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center border capitalize leading-none",
        variant === "solid"
          ? "rounded-md px-1.5 py-[5px] text-xs font-medium"
          : "rounded-[var(--radius-sm)] px-2 py-0.5 text-[11px] font-semibold",
        variant === "solid" ? TONE_SOLID[tone] : TONE_SOFT[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** @deprecated Prefer `StatusBadge` */
export const CrmStatusBadge = StatusBadge;
export type CrmStatusBadgeProps = StatusBadgeProps;
