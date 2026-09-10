"use client";

import { useEffect, useState, useMemo } from "react";
import {
  CreditCard,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  MapPin,
  UserCheck,
  FileText,
  ArrowUpCircle,
  AlertOctagon,
  Loader2,
  Calendar,
  Layers,
  Building,
  RefreshCw,
  PlusCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchLeadPmOverview,
  fetchPMPlans,
  fetchSubscriptionPlans,
  fetchPmPayments,
} from "@/lib/crm/subscriptions/backend-api";
import type {
  LeadPmOverview,
  PMPlanCatalogItem,
  SubscriptionPlan,
  PmPaymentRecord,
  PlanFeature,
} from "@/lib/crm/subscriptions/types";
import { CrmStatusBadge } from "@/components/crm/ui";
import UpgradePlanModal from "@/components/crm/subscriptions/UpgradePlanModal";
import CancelPlanModal from "@/components/crm/subscriptions/CancelPlanModal";

interface LeadSubscriptionDetailsTabProps {
  leadId: string;
  refreshKey?: number;
  onRefresh?: () => void;
}

/** Standard default features associated with 2Bigha PM plans when dynamic catalog features are empty */
const DEFAULT_PM_FEATURES: Record<string, { title: string; desc: string; icon: any }[]> = {
  default: [
    {
      title: "Verified Land Title Audit",
      desc: "Full legal verification of revenue records, Encumbrance Certificate (EC), and title history.",
      icon: ShieldCheck,
    },
    {
      title: "Geo-Tagged Physical Site Visits",
      desc: "Scheduled on-site inspections with high-resolution photo and video status reporting.",
      icon: MapPin,
    },
    {
      title: "Dedicated Relationship & Legal Manager",
      desc: "Single point of contact for field visits, documentation, and client coordination.",
      icon: UserCheck,
    },
    {
      title: "Boundary & Encroachment Monitoring",
      desc: "Periodic physical checks and boundary verification to guard against unauthorized access.",
      icon: Layers,
    },
    {
      title: "Priority Buyer & Tenant Broadcast",
      desc: "Featured marketing placement across 2Bigha investor and buyer network.",
      icon: Sparkles,
    },
    {
      title: "Digital Vault & Legal Document Access",
      desc: "Secure 24/7 cloud storage for mutation records, site plans, and legal opinion letters.",
      icon: FileText,
    },
  ],
};

export default function LeadSubscriptionDetailsTab({
  leadId,
  refreshKey = 0,
  onRefresh,
}: LeadSubscriptionDetailsTabProps) {
  const [overview, setOverview] = useState<LeadPmOverview | null>(null);
  const [pmPlans, setPmPlans] = useState<PMPlanCatalogItem[]>([]);
  const [marketplacePlans, setMarketplacePlans] = useState<SubscriptionPlan[]>([]);
  const [payments, setPayments] = useState<PmPaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentRefresh, setPaymentRefresh] = useState(0);

  // Upgrade / Cancel Modals state
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [targetUserPropId, setTargetUserPropId] = useState<string | null>(null);
  const [targetPlanName, setTargetPlanName] = useState<string | undefined>(undefined);

  const loadData = async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const [overviewData, pmCatalog, marketCatalog, paymentData] = await Promise.all([
        fetchLeadPmOverview(leadId),
        fetchPMPlans(),
        fetchSubscriptionPlans(),
        fetchPmPayments(leadId),
      ]);
      setOverview(overviewData);
      setPmPlans(pmCatalog || []);
      setMarketplacePlans(marketCatalog || []);
      setPayments(paymentData || []);
    } catch (err) {
      console.error("Failed loading lead subscription details:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [leadId, refreshKey, paymentRefresh]);

  const handleRefresh = () => {
    setPaymentRefresh((n) => n + 1);
    if (onRefresh) onRefresh();
  };

  // Derive subscription items taken by lead
  const unboundSubs = overview?.unboundSubscriptions || [];
  const activePlans = overview?.activePlans || [];
  const activeSubs = overview?.activeSubscriptions || [];
  const pmProperties = overview?.properties || [];
  const paymentHistory = overview?.paymentHistory?.length ? overview.paymentHistory : payments;

  // Derive bound plans
  const boundPlans = useMemo(() => {
    if (activePlans.length > 0) {
      return activePlans.map((p) => {
        const prop = pmProperties.find((prop) => prop.userPropertyId === p.userPropertyId);
        return {
          id: p.userPropertyId,
          planName: p.planName,
          status: p.status || "ACTIVE",
          price: p.price,
          billingCycle: p.billingCycle,
          startDate: p.startDate,
          endDate: p.endDate,
          visitsAllowed: (p.visitsRemaining || 0) + (p.visitsUsed || 0),
          visitsRemaining: p.visitsRemaining,
          visitsUsed: p.visitsUsed,
          propertyTitle: prop?.title || (p.propertyId ? `Property ${p.propertyId}` : undefined),
          isUnbound: false,
        };
      });
    }

    const boundActiveSubs = activeSubs.filter((s) => s.status === "ACTIVE" && Boolean(s.propertyTitle));
    if (boundActiveSubs.length > 0) {
      return boundActiveSubs.map((s) => ({
        id: s.id,
        planName: s.planName || "Property Subscription",
        status: s.status || "ACTIVE",
        price: 0,
        billingCycle: s.billingCycle || "Monthly",
        startDate: s.startDate,
        endDate: s.endDate,
        propertyTitle: s.propertyTitle,
        isUnbound: false,
      }));
    }

    const boundProps = pmProperties.filter((p) => p.subscriptionStatus === "ACTIVE" && p.userPropertyId);
    if (boundProps.length > 0) {
      return boundProps.map((p) => ({
        id: p.userPropertyId!,
        planName: "Active PM Plan",
        status: "ACTIVE",
        price: 0,
        billingCycle: "Monthly",
        propertyTitle: p.title,
        visitsRemaining: p.visitsRemaining,
        visitsUsed: p.visitsUsed,
        isUnbound: false,
      }));
    }

    return [];
  }, [activePlans, activeSubs, pmProperties]);

  // Determine active subscription item
  const activeItem = useMemo(() => {
    // 1. If there's a bound plan with an attached property, present it as bound
    if (boundPlans.length > 0) {
      return boundPlans[0];
    }

    // 2. If there are unbound subscriptions (paid credit, no property attached yet)
    if (unboundSubs.length > 0) {
      const sub = unboundSubs[0];
      return {
        id: String(sub.subscriptionId),
        planName: sub.planName,
        status: "ACTIVE · unbound",
        price: sub.price,
        billingCycle: `${sub.durationMonths || 1} Month${(sub.durationMonths || 1) > 1 ? "s" : ""}`,
        purchasedAt: sub.purchasedAt,
        visitsAllowed: sub.visitsPerCycle,
        isUnbound: true,
      };
    }

    // 3. Raw active subscriptions without property -> treat as unbound
    if (activeSubs.length > 0) {
      const sub = activeSubs[0];
      return {
        id: sub.id,
        planName: sub.planName || "Subscription Plan",
        status: "ACTIVE · unbound",
        price: 0,
        billingCycle: sub.billingCycle || "Monthly",
        startDate: sub.startDate,
        endDate: sub.endDate,
        isUnbound: true,
      };
    }

    // 4. Successful payment fallback
    if (paymentHistory.length > 0) {
      const latestSuccess = paymentHistory.find((p) => p.status === "SUCCESS") || paymentHistory[0];
      if (latestSuccess.status === "SUCCESS") {
        return {
          id: String(latestSuccess.id),
          planName: latestSuccess.planName || "Subscription Plan",
          status: "PAID · Pending Property Bind",
          price: latestSuccess.totalAmount || 0,
          billingCycle: latestSuccess.billingCycle || "Monthly",
          purchasedAt: latestSuccess.completedAt || latestSuccess.initiatedAt,
          orderId: latestSuccess.razorpayOrderId,
          isUnbound: true,
        };
      }
    }

    return null;
  }, [boundPlans, unboundSubs, activeSubs, paymentHistory]);

  // Find features for this specific plan from catalog
  const currentPlanFeatures = useMemo(() => {
    if (!activeItem?.planName) return DEFAULT_PM_FEATURES.default;

    const planNameLower = activeItem.planName.toLowerCase();

    // Check Marketplace Catalog first
    const marketMatch = marketplacePlans.find(
      (p) => p.name.toLowerCase() === planNameLower || p.displayLabel?.toLowerCase() === planNameLower
    );
    if (marketMatch && marketMatch.features && marketMatch.features.length > 0) {
      return marketMatch.features.map((f: PlanFeature) => ({
        title: f.displayText || f.featureKey,
        desc: f.featureValue || "Included in your active subscription tier.",
        icon: CheckCircle2,
      }));
    }

    // Check PM Catalog
    const pmMatch = pmPlans.find((p) => p.planName.toLowerCase() === planNameLower);
    if (pmMatch) {
      const variant = pmMatch.variants.find(
        (v) => v.planName.toLowerCase() === planNameLower || String(v.price) === String(activeItem.price)
      );
      const features = [
        {
          title: `${pmMatch.planName} Tier Access`,
          desc: pmMatch.description || `Base catalog plan #${pmMatch.planId}`,
          icon: ShieldCheck,
        },
      ];
      if (variant?.visitsAllowed || variant?.visitsPerCycle) {
        features.push({
          title: `${variant.visitsAllowed || variant.visitsPerCycle} Site Visits Included`,
          desc: "Dedicated physical property inspections with status update reports.",
          icon: MapPin,
        });
      }
      if (variant?.preVerificationIncluded) {
        features.push({
          title: "Pre-Verification Land Audit Included",
          desc: "Initial legal checks & property title validation prior to onboarding.",
          icon: CheckCircle2,
        });
      }
      return [...features, ...DEFAULT_PM_FEATURES.default];
    }

    return DEFAULT_PM_FEATURES.default;
  }, [activeItem, marketplacePlans, pmPlans]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-text-muted gap-2 animate-in fade-in duration-300">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-xs font-medium">Loading subscription details & features…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner & Overview Card */}
      {activeItem ? (
        <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-emerald-500/5 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  <CreditCard size={13} />
                  Active Subscription
                </span>
                <CrmStatusBadge tone={activeItem.isUnbound ? "warning" : "success"}>
                  {activeItem.status}
                </CrmStatusBadge>
              </div>
              <h2 className="text-xl font-bold text-text-main flex items-center gap-2 pt-1">
                {activeItem.planName}
                {activeItem.billingCycle && (
                  <span className="text-xs font-medium text-text-muted bg-surface-dim border border-border px-2 py-0.5 rounded-md">
                    {activeItem.billingCycle}
                  </span>
                )}
              </h2>
              {activeItem.propertyTitle ? (
                <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                  <Building size={13} />
                  Bound Property: {activeItem.propertyTitle}
                </p>
              ) : activeItem.isUnbound ? (
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300 flex items-center gap-1">
                  <Layers size={13} />
                  Unbound Credit — Create or sync a PM property to bind this plan
                </p>
              ) : null}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {!activeItem.isUnbound && activeItem.id && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetUserPropId(activeItem.id);
                      setTargetPlanName(activeItem.planName);
                      setUpgradeOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-xs hover:bg-indigo-100 transition-colors"
                  >
                    <ArrowUpCircle size={14} /> Upgrade Plan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetUserPropId(activeItem.id);
                      setTargetPlanName(activeItem.planName);
                      setCancelOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 shadow-xs hover:bg-red-100 transition-colors"
                  >
                    <AlertOctagon size={14} /> Cancel
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={handleRefresh}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-text-muted hover:bg-surface-dim transition-colors"
                title="Refresh Status"
              >
                <RefreshCw size={13} />
              </button>
            </div>
          </div>

          {/* Key Subscription Details Grid */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-border/60 text-xs">
            <div className="space-y-0.5">
              <span className="text-[11px] text-text-muted flex items-center gap-1">
                Price Paid
              </span>
              <span className="font-semibold text-text-main text-sm">
                ₹{activeItem.price ? activeItem.price.toLocaleString("en-IN") : "Included"}
              </span>
            </div>

            <div className="space-y-0.5">
              <span className="text-[11px] text-text-muted flex items-center gap-1">
                <Calendar size={12} /> Start / Purchased Date
              </span>
              <span className="font-medium text-text-main">
                {activeItem.startDate
                  ? new Date(activeItem.startDate).toLocaleDateString()
                  : activeItem.purchasedAt
                  ? new Date(activeItem.purchasedAt).toLocaleDateString()
                  : "N/A"}
              </span>
            </div>

            <div className="space-y-0.5">
              <span className="text-[11px] text-text-muted flex items-center gap-1">
                <Calendar size={12} /> Valid Until
              </span>
              <span className="font-medium text-text-main">
                {activeItem.endDate
                  ? new Date(activeItem.endDate).toLocaleDateString()
                  : "Active Cycle"}
              </span>
            </div>

            <div className="space-y-0.5">
              <span className="text-[11px] text-text-muted flex items-center gap-1">
                <MapPin size={12} /> Visits Allowance
              </span>
              <span className="font-medium text-text-main">
                {activeItem.visitsAllowed != null ? `${activeItem.visitsAllowed} Visits` : "Included"}
              </span>
            </div>
          </div>

          {/* Progress bar for Visits if bound */}
          {activeItem.visitsRemaining != null && activeItem.visitsAllowed ? (
            <div className="mt-4 pt-3 border-t border-border/40">
              <div className="flex justify-between items-center text-[11px] text-text-muted mb-1 font-medium">
                <span>Site Visits Usage</span>
                <span>
                  {activeItem.visitsUsed || 0} of {activeItem.visitsAllowed} visits used ({activeItem.visitsRemaining} remaining)
                </span>
              </div>
              <div className="h-2 w-full bg-surface-dim rounded-full overflow-hidden border border-border/50">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        0,
                        (((activeItem.visitsUsed || 0) / activeItem.visitsAllowed) * 100)
                      )
                    )}%`,
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        /* Empty State — No Active Subscription */
        <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-dim text-text-muted">
            <CreditCard size={24} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-main">No Active Subscription Logged</h3>
            <p className="text-xs text-text-muted max-w-md mx-auto mt-1">
              No active PM subscription plan or payment record is logged for this lead yet.
            </p>
          </div>
        </div>
      )}

      {/* Plan Features & Benefits Section */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
              <Sparkles size={16} className="text-amber-500" />
              Subscription Features & Included Coverage
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              Specific feature entitlements provided under {activeItem ? `the ${activeItem.planName} plan` : "2Bigha Property Management"}.
            </p>
          </div>
          <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full flex items-center gap-1">
            <CheckCircle2 size={12} />
            {currentPlanFeatures.length} Active Features
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {currentPlanFeatures.map((feat, idx) => {
            const Icon = feat.icon || CheckCircle2;
            return (
              <div
                key={idx}
                className="flex items-start gap-3 rounded-lg border border-border/80 bg-surface-dim/50 p-3.5 hover:border-primary/30 transition-all"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                  <Icon size={16} />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <h4 className="text-xs font-semibold text-text-main flex items-center gap-1.5">
                    {feat.title}
                  </h4>
                  <p className="text-[11px] text-text-muted leading-relaxed">{feat.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment History & Invoice Logs */}
      {paymentHistory.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-text-main flex items-center gap-2 border-b border-border pb-3">
            <CreditCard size={16} className="text-text-muted" />
            Payment History & Transactions
          </h3>
          <div className="space-y-2.5">
            {paymentHistory.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 bg-surface-dim/30 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 font-medium text-text-main">
                    <span>{p.planName || "Subscription Payment"}</span>
                    {p.billingCycle && (
                      <span className="text-[10px] text-text-muted bg-card border border-border px-1.5 py-0.5 rounded">
                        {p.billingCycle}
                      </span>
                    )}
                    <CrmStatusBadge tone={p.status === "SUCCESS" ? "success" : "warning"}>
                      {p.status}
                    </CrmStatusBadge>
                  </div>
                  <div className="text-[11px] text-text-muted flex items-center gap-3">
                    {p.completedAt || p.initiatedAt ? (
                      <span>
                        Date: {new Date(p.completedAt || p.initiatedAt!).toLocaleString()}
                      </span>
                    ) : null}
                    {p.razorpayOrderId && (
                      <span className="font-mono text-[10px] text-text-muted">
                        Order: {p.razorpayOrderId}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right font-semibold text-text-main">
                  ₹{(p.totalAmount || 0).toLocaleString("en-IN")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals for Upgrade and Cancel */}
      {upgradeOpen && targetUserPropId && (
        <UpgradePlanModal
          isOpen={upgradeOpen}
          onClose={() => setUpgradeOpen(false)}
          leadId={leadId}
          userPropertyId={targetUserPropId}
          currentPlanName={targetPlanName}
          onSuccess={handleRefresh}
        />
      )}

      {cancelOpen && targetUserPropId && (
        <CancelPlanModal
          isOpen={cancelOpen}
          onClose={() => setCancelOpen(false)}
          userPropertyId={targetUserPropId}
          planName={targetPlanName}
          onSuccess={handleRefresh}
        />
      )}
    </div>
  );
}
