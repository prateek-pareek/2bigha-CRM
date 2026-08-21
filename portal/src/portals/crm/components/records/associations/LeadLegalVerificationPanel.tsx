"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Gavel, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CrmButton, CrmStatusBadge } from "@/components/crm/ui";
import {
  fetchLeadSubscriptionMock,
  fetchThirdPartyPropertyListings,
  requestPropertyLegalVerificationBatch,
} from "@/lib/crm/property-listings/third-party-api";
import {
  formatAddress,
  legalStatusBadgeTone,
  type LeadSubscriptionMock,
  type PropertyListingRecord,
} from "@/lib/crm/property-listings/types";

/**
 * Lead-side Legal Verification (doc §§1–2): entitlement + multi-select request.
 */
export default function LeadLegalVerificationPanel({
  leadId,
  refreshKey,
  onRequested,
}: {
  leadId: string;
  refreshKey?: number;
  onRequested?: () => void;
}) {
  const [props, setProps] = useState<PropertyListingRecord[]>([]);
  const [sub, setSub] = useState<LeadSubscriptionMock | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const [list, subscription] = await Promise.all([
        fetchThirdPartyPropertyListings({ leadId, pageSize: 100 }),
        fetchLeadSubscriptionMock(leadId),
      ]);
      setProps((list.data || []).filter((p) => p.listingBucket !== "pm"));
      setSub(subscription);
    } catch {
      setProps([]);
      setSub(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, refreshKey]);

  const entitlementLabel = useMemo(() => {
    if (!sub) return "No subscription";
    if (!sub.includesLegalVerification) return "Not included in plan";
    if (sub.legalVerificationAllowance == null) {
      return `${sub.legalVerificationUsed} used · unlimited`;
    }
    const left = Math.max(0, sub.legalVerificationAllowance - sub.legalVerificationUsed);
    return `${sub.legalVerificationUsed} / ${sub.legalVerificationAllowance} used · ${left} left`;
  }, [sub]);

  const eligibleIds = useMemo(() => {
    return new Set(
      props
        .filter((p) => {
          if (p.propertyLegal?.status === "Pending") return false;
          if (p.propertyLegal) return true; // re-request allowed
          if (!sub?.includesLegalVerification) return false;
          if (sub.legalVerificationAllowance == null) return true;
          return sub.legalVerificationUsed < sub.legalVerificationAllowance;
        })
        .map((p) => p._id),
    );
  }, [props, sub]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      if (!eligibleIds.has(id)) return prev;
      const p = props.find((x) => x._id === id);
      if (
        p &&
        !p.propertyLegal &&
        sub?.legalVerificationAllowance != null
      ) {
        const newSelects = [...next].filter(
          (sid) => !props.find((x) => x._id === sid)?.propertyLegal,
        ).length;
        if (sub.legalVerificationUsed + newSelects >= sub.legalVerificationAllowance) {
          toast.error("No Legal Verification allowance left on this plan");
          return prev;
        }
      }
      next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (!selected.size) return;
    setBusy(true);
    try {
      const res = await requestPropertyLegalVerificationBatch([...selected]);
      if (res.ok.length) {
        toast.success(
          res.ok.length === 1
            ? "Legal Verification requested"
            : `${res.ok.length} Legal Verification requests submitted`,
        );
      }
      for (const err of res.errors) {
        toast.error(`${err.id}: ${err.message}`);
      }
      setSelected(new Set());
      await reload();
      onRequested?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-[var(--crm-radius-ui)] p-6 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold text-text-muted">Legal Verification</h3>
          <p className="mt-1 text-[11px] text-text-muted">{entitlementLabel}</p>
        </div>
        {sub?.includesLegalVerification ? (
          <CrmButton
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => void submit()}
            className="h-8"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Gavel size={14} />}
            Request ({selected.size})
          </CrmButton>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : !sub?.includesLegalVerification ? (
        <p className="text-xs italic text-text-muted">
          This plan does not include Legal Verification — upgrade to Standard or higher to
          request reviews.
        </p>
      ) : props.length === 0 ? (
        <p className="text-xs italic text-text-muted">
          No marketplace properties on this lead to verify.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-text-muted">
            Select properties to submit (doc §2). Pending items stay in the legal queue.
          </p>
          {props.map((p) => {
            const pending = p.propertyLegal?.status === "Pending";
            const selectable = eligibleIds.has(p._id);
            const checked = selected.has(p._id);
            return (
              <div
                key={p._id}
                className={cn(
                  "flex items-center gap-2 rounded-[var(--radius-md)] border border-border px-2.5 py-2",
                  checked && "border-sky-300 bg-sky-50/50",
                )}
              >
                <input
                  type="checkbox"
                  className="shrink-0"
                  checked={checked}
                  disabled={!selectable || busy || pending}
                  onChange={() => toggle(p._id)}
                  aria-label={`Select ${p.title}`}
                />
                <Link
                  href={`/crm/property-listings/${p._id}`}
                  className="min-w-0 flex-1 no-underline"
                >
                  <p className="truncate text-sm font-semibold text-text-main">{p.title}</p>
                  <p className="truncate text-[11px] text-text-muted">{formatAddress(p)}</p>
                </Link>
                {p.propertyLegal ? (
                  <CrmStatusBadge tone={legalStatusBadgeTone(p.propertyLegal.status)}>
                    {p.propertyLegal.status}
                  </CrmStatusBadge>
                ) : (
                  <span className="shrink-0 text-[10px] font-semibold uppercase text-text-muted">
                    Not requested
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
