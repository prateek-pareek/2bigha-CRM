"use client";

import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TwoBighaSyncStatus } from "@/lib/crm/twobigha-client-api";

export function TwoBighaSyncStatusBadge({
  status,
  error,
  className,
}: {
  status?: TwoBighaSyncStatus | string;
  error?: string;
  className?: string;
}) {
  const normalized = status || "not_synced";

  switch (normalized) {
    case "synced":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700",
            className,
          )}
          title={error}
        >
          <CheckCircle2 size={12} /> Synced
        </span>
      );
    case "mock":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700",
            className,
          )}
          title="2bigha mock mode — credentials not configured"
        >
          <AlertCircle size={12} /> Mock
        </span>
      );
    case "failed":
      return (
        <span
          className={cn(
            "inline-flex cursor-help items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700",
            className,
          )}
          title={error || "Sync failed"}
        >
          <XCircle size={12} /> Failed
        </span>
      );
    case "skipped":
      return (
        <span
          className={cn(
            "inline-flex cursor-help items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700",
            className,
          )}
          title={error || "Sync skipped"}
        >
          <AlertCircle size={12} /> Skipped
        </span>
      );
    default:
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500",
            className,
          )}
        >
          <AlertCircle size={12} /> Not synced
        </span>
      );
  }
}
