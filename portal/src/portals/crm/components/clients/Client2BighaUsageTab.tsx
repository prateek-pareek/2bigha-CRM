"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Gauge,
  Layers,
  Sparkles,
  Share2,
  Eye,
  Calendar,
  ShieldCheck,
  Loader2,
  RefreshCw,
  Clock,
} from "lucide-react";
import { CrmButton } from "@/components/crm/ui";
import {
  fetchTwoBighaClientUsage,
  type UsageSummary,
} from "@/portals/crm/lib/twobigha-client-api";

interface Props {
  clientId: string;
}

export default function Client2BighaUsageTab({ clientId }: Props) {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchTwoBighaClientUsage(clientId);
      setUsage(data);
    } catch (err) {
      console.error("Failed to load client usage summary:", err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const renderQuotaCard = (
    title: string,
    icon: React.ReactNode,
    used: number = 0,
    allowed: number = 0,
    remaining: number = 0,
    unit: string = "units",
  ) => {
    const percent = allowed > 0 ? Math.min(100, Math.round((used / allowed) * 100)) : 0;
    return (
      <div className="bg-card rounded-[var(--crm-radius-ui)] border border-border p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">{icon}</div>
            <span className="text-xs font-bold text-text">{title}</span>
          </div>
          <span className="text-[11px] font-mono font-bold text-text">
            {used} / {allowed} <span className="font-normal text-text-muted">{unit}</span>
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              percent >= 90 ? "bg-rose-500" : percent >= 75 ? "bg-amber-500" : "bg-primary"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-text-muted">
          <span>{percent}% used</span>
          <span className="font-semibold text-text">{remaining} remaining</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header & Plan Summary */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-gradient-to-r from-primary/10 via-background to-muted/40 rounded-[var(--crm-radius-ui)] border border-primary/20">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-primary" />
            <h3 className="text-sm font-bold text-text">
              {usage?.planName || "Active 2Bigha Plan"}
            </h3>
            {usage?.planTier !== undefined && (
              <span className="text-[10px] font-bold bg-primary text-primary-foreground px-2 py-0.5 rounded-full uppercase">
                Tier {usage.planTier}
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-1">
            Real-time feature quota allocation, usage statistics, and first-page visibility status.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {usage?.expiresAt && (
            <div className="text-right text-xs bg-background/80 px-3 py-1.5 rounded-md border border-border">
              <span className="text-text-muted text-[10px] block">Plan Expires</span>
              <span className="font-semibold text-text">
                {new Date(usage.expiresAt).toLocaleDateString("en-IN", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          )}
          <CrmButton variant="ghost" className="!h-8 !px-2.5" onClick={loadData} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </CrmButton>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12 text-text-muted gap-2">
          <Loader2 size={18} className="animate-spin text-primary" />
          <span className="text-xs">Loading quota usage from 2bigha...</span>
        </div>
      ) : !usage ? (
        <div className="text-center p-12 bg-card rounded-[var(--crm-radius-ui)] border border-dashed border-border">
          <Gauge size={36} className="mx-auto text-text-muted mb-2 opacity-50" />
          <h4 className="text-sm font-semibold text-text">No usage data found</h4>
          <p className="text-xs text-text-muted mt-1 max-w-sm mx-auto">
            This client does not have an active subscription quota breakdown.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1. Listings */}
          {renderQuotaCard(
            "Regular Listings",
            <Layers size={16} />,
            usage.listings?.used,
            usage.listings?.allowed,
            usage.listings?.remaining,
            "listings",
          )}

          {/* 2. Featured Listings */}
          {renderQuotaCard(
            "Featured Slots",
            <Sparkles size={16} />,
            usage.featuredListings?.used,
            usage.featuredListings?.allowed,
            usage.featuredListings?.remaining,
            "slots",
          )}

          {/* 3. Social Marketing Posts */}
          {renderQuotaCard(
            "Social Marketing",
            <Share2 size={16} />,
            usage.socialMarketingPosts?.used,
            usage.socialMarketingPosts?.allowed,
            usage.socialMarketingPosts?.remaining,
            "posts",
          )}

          {/* 4. Total Property Count */}
          {renderQuotaCard(
            "Total Property Limit",
            <Layers size={16} />,
            usage.propertyCount?.used,
            usage.propertyCount?.allowed,
            usage.propertyCount?.remaining,
            "props",
          )}

          {/* 5. First Page Visibility */}
          <div className="bg-card rounded-[var(--crm-radius-ui)] border border-border p-4 shadow-xs space-y-3 sm:col-span-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600">
                  <Eye size={16} />
                </div>
                <div>
                  <span className="text-xs font-bold text-text">First Page Visibility</span>
                  <p className="text-[10px] text-text-muted">Top position display on search and category feeds</p>
                </div>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                  usage.firstPageVisibility?.included
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-muted text-text-muted"
                }`}
              >
                {usage.firstPageVisibility?.included ? "Enabled" : "Not Included"}
              </span>
            </div>

            {usage.firstPageVisibility?.included && (
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border text-xs">
                <div>
                  <span className="text-text-muted text-[10px] block">Duration Type</span>
                  <span className="font-semibold text-text capitalize">
                    {usage.firstPageVisibility?.durationType || "Days"}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted text-[10px] block">Quota</span>
                  <span className="font-semibold text-text">
                    {usage.firstPageVisibility?.used} / {usage.firstPageVisibility?.allowed}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted text-[10px] block">Active Now</span>
                  <span className="font-semibold text-purple-600">
                    {usage.firstPageVisibility?.activeCount || 0} active
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
