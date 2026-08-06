"use client";

import { MessageSquareReply, ShieldAlert, TrendingUp, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DELIVERABILITY_BIGGEST_SECRET_HEADLINE,
  DELIVERABILITY_BIGGEST_SECRET_LEDE,
  DELIVERABILITY_PROVIDER_PILLARS,
} from "@/lib/crm/deliverability-pillars";

const PILLAR_ICONS = {
  "reply-rate": MessageSquareReply,
  "spam-complaints": ShieldAlert,
  "domain-reputation": TrendingUp,
  "recipient-engagement": Users,
} as const;

type DeliverabilityPillarsCalloutProps = {
  className?: string;
  /** Single-column stack for narrow panels (composer). */
  compact?: boolean;
};

export default function DeliverabilityPillarsCallout({
  className,
  compact = false,
}: DeliverabilityPillarsCalloutProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-sky-200/80 bg-gradient-to-br from-sky-50/90 to-white px-4 py-3.5",
        className,
      )}
    >
      <p className="text-[11px] font-semibold text-sky-800">
        {DELIVERABILITY_BIGGEST_SECRET_HEADLINE}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">
        {DELIVERABILITY_BIGGEST_SECRET_LEDE}
      </p>
      <ul
        className={cn(
          "mt-3 grid gap-2.5",
          compact ? "grid-cols-1" : "sm:grid-cols-2",
        )}
      >
        {DELIVERABILITY_PROVIDER_PILLARS.map((pillar) => {
          const Icon =
            PILLAR_ICONS[pillar.id as keyof typeof PILLAR_ICONS] ?? TrendingUp;
          return (
            <li
              key={pillar.id}
              className="rounded-md border border-sky-100/80 bg-white/80 px-3 py-2.5"
            >
              <div className="flex items-start gap-2">
                <Icon size={14} className="mt-0.5 shrink-0 text-sky-700" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--text-main)]">
                    {pillar.title}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-[var(--text-muted)]">
                    {pillar.why}
                  </p>
                  {!compact ? (
                    <p className="mt-1 text-[11px] leading-snug text-sky-900/80">
                      <span className="font-semibold">In Mathionix: </span>
                      {pillar.inMathionix}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
