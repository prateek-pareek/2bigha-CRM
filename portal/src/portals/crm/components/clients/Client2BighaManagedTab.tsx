"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  Calendar,
  UserCheck,
  Building,
  MapPin,
  Clock,
  Loader2,
  RefreshCw,
  Eye,
  CheckCircle2,
} from "lucide-react";
import { CrmButton } from "@/components/crm/ui";
import {
  fetchTwoBighaClientManagedProperties,
  type PMUserProperty,
} from "@/portals/crm/lib/twobigha-client-api";

interface Props {
  clientId: string;
}

export default function Client2BighaManagedTab({ clientId }: Props) {
  const [items, setItems] = useState<PMUserProperty[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchTwoBighaClientManagedProperties(clientId, { page, limit: 10 });
      setItems(res.data || []);
      setTotalCount(res.meta?.total || 0);
    } catch (err) {
      console.error("Failed to load managed properties:", err);
    } finally {
      setLoading(false);
    }
  }, [clientId, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between p-3.5 bg-card rounded-[var(--crm-radius-ui)] border border-border">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-primary" />
          <span className="text-xs font-bold text-text">Property Management (PM) Subscriptions</span>
          <span className="text-[11px] bg-muted px-2 py-0.5 rounded-full font-semibold text-text-muted">
            {totalCount} managed properties
          </span>
        </div>
        <CrmButton variant="ghost" className="!h-8 !px-2.5" onClick={loadData} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </CrmButton>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12 text-text-muted gap-2">
          <Loader2 size={18} className="animate-spin text-primary" />
          <span className="text-xs">Loading managed properties from PM module...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center p-12 bg-card rounded-[var(--crm-radius-ui)] border border-dashed border-border">
          <Building size={36} className="mx-auto text-text-muted mb-2 opacity-50" />
          <h4 className="text-sm font-semibold text-text">No active PM subscriptions</h4>
          <p className="text-xs text-text-muted mt-1 max-w-sm mx-auto">
            This client does not currently have any properties under active 2Bigha Property Management subscriptions.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item) => {
            const prop = item.property;
            const plan = item.planDetails;
            const remaining = item.visitsRemaining ?? 0;
            const used = item.visitsUsed ?? 0;
            const total = remaining + used;

            return (
              <div
                key={item.userPropertyId}
                className="bg-card rounded-[var(--crm-radius-ui)] border border-border p-4 shadow-xs space-y-3.5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-text line-clamp-1" title={prop?.title || prop?.propertyName}>
                        {prop?.title || prop?.propertyName || `Managed Property #${item.userPropertyId.slice(-6)}`}
                      </h4>
                      <div className="flex items-center gap-1.5 text-[11px] text-text-muted mt-0.5">
                        <MapPin size={11} />
                        <span>{[prop?.city, prop?.district, prop?.state].filter(Boolean).join(", ") || "Location not set"}</span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 uppercase">
                      {item.assignmentStatus || "ACTIVE"}
                    </span>
                  </div>

                  {/* Plan Badge */}
                  {plan && (
                    <div className="p-2.5 bg-muted/40 rounded-[var(--crm-radius-ui)] border border-border space-y-1.5 mt-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-text">{plan.planName || "PM Plan"}</span>
                        <span className="text-[10px] text-text-muted uppercase">{plan.billingCycle || "Annual"}</span>
                      </div>
                      <div className="text-[11px] text-text-muted flex items-center justify-between">
                        <span>Duration: {plan.durationInDays || 365} Days</span>
                        <span>Visits Included: {plan.visitsAllowed || total}</span>
                      </div>
                    </div>
                  )}

                  {/* Visit Quota */}
                  <div className="space-y-1.5 mt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-text-muted">Inspection Visits</span>
                      <span className="font-mono font-bold text-text">
                        {used} used / {remaining} remaining
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-primary h-full transition-all"
                        style={{ width: `${total > 0 ? (used / total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Visit History preview */}
                {item.visits && item.visits.length > 0 && (
                  <div className="pt-2 border-t border-border text-[11px] text-text-muted space-y-1">
                    <span className="font-semibold text-text text-[10px] block">Recent Visits:</span>
                    {item.visits.slice(0, 2).map((v, idx) => (
                      <div key={v.id || idx} className="flex items-center justify-between">
                        <span>{v.visitDate ? new Date(v.visitDate).toLocaleDateString("en-IN") : "Date not set"}</span>
                        <span className="font-medium text-text">{v.agentName || "Agent"} ({v.status || "Completed"})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
