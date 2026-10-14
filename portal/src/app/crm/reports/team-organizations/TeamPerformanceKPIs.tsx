"use client";

import { Building2, IndianRupee, MessageCircle, PhoneCall, PhoneMissed, Target, UserPlus, Users } from "lucide-react";
import { ReportKpiGrid, type ReportKpi } from "../_components/ReportKpiGrid";
import { deltaPct, formatINR, formatMinutes, type MetricRow, type PerformanceReport } from "../lib/performance-report";

interface TeamPerformanceKPIsProps {
  totals: MetricRow | null;
  previous: PerformanceReport["previousTotals"] | null;
  showTrends: boolean;
  teamCount: number;
  memberCount: number;
  compareLabel?: string;
  loading: boolean;
}

export default function TeamPerformanceKPIs({
  totals: t,
  previous,
  showTrends,
  teamCount,
  memberCount,
  compareLabel,
  loading,
}: TeamPerformanceKPIsProps) {
  const trend = (cur: number, prev?: number) => (showTrends && previous && prev != null ? deltaPct(cur, prev) : null);
  const kpis: ReportKpi[] = t
    ? [
        {
          label: "Teams",
          value: teamCount,
          sub: `${memberCount} team members`,
          icon: <Users className="text-[#2563eb]" size={18} />,
        },
        {
          label: "Calls",
          value: t.calls.toLocaleString(),
          sub: `${t.connectedCalls} connected · ${t.connectRate}%`,
          trend: trend(t.calls, previous?.calls),
          icon: <PhoneCall className="text-[#8b5cf6]" size={18} />,
        },
        {
          label: "Leads Created",
          value: t.leadsCreated.toLocaleString(),
          sub: `${t.leadsConverted} converted · ${t.conversionRate}%`,
          trend: trend(t.leadsCreated, previous?.leadsCreated),
          icon: <UserPlus className="text-[#10b981]" size={18} />,
        },
        {
          label: "Conversions",
          value: t.leadsConverted.toLocaleString(),
          sub: `Follow-up adherence ${t.followUpAdherence == null ? "—" : `${t.followUpAdherence}%`}`,
          trend: trend(t.leadsConverted, previous?.leadsConverted),
          icon: <Target className="text-[#ff9f43]" size={18} />,
        },
        {
          label: "WhatsApp Sent",
          value: t.whatsappSent.toLocaleString(),
          sub: `${t.whatsappReadRate}% read · avg reply ${formatMinutes(t.whatsappAvgReplyMins)}`,
          trend: trend(t.whatsappSent, previous?.whatsappSent),
          icon: <MessageCircle className="text-[#22c55e]" size={18} />,
        },
        {
          label: "Missed Calls",
          value: t.missedCalls.toLocaleString(),
          sub: `${t.incomingCalls} incoming · ${t.missedRate}% missed`,
          icon: <PhoneMissed className="text-[#ef4444]" size={18} />,
        },
        {
          label: "Listings",
          value: t.listingsTotal.toLocaleString(),
          sub: `${t.properties} properties · ${t.farms} farms`,
          trend: trend(t.listingsTotal, previous?.listings),
          icon: <Building2 className="text-[#64748b]" size={18} />,
        },
        {
          label: "Revenue",
          value: formatINR(t.revenue),
          sub: `${t.subscriptionSales} subscription sale${t.subscriptionSales === 1 ? "" : "s"}`,
          icon: <IndianRupee className="text-[#10b981]" size={18} />,
        },
      ]
    : [];

  if (!loading && !t) return null;
  return <ReportKpiGrid kpis={kpis} loading={loading} compareLabel={compareLabel} />;
}
