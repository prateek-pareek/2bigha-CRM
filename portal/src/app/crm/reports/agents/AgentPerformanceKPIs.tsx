"use client";

import {
  Building2,
  Clock,
  IndianRupee,
  ListChecks,
  MessageCircle,
  PhoneCall,
  Target,
  UserPlus,
} from "lucide-react";
import { ReportKpiGrid, type ReportKpi } from "../_components/ReportKpiGrid";
import {
  deltaPct,
  formatINR,
  formatMinutes,
  type MetricRow,
  type PerformanceReport,
} from "../lib/performance-report";

interface AgentPerformanceKPIsProps {
  /** Totals for the agents currently shown (after client-side filters). */
  totals: MetricRow | null;
  previous: PerformanceReport["previousTotals"] | null;
  /** Previous-period badges only make sense when the totals are unfiltered. */
  showTrends: boolean;
  compareLabel?: string;
  loading: boolean;
}

export default function AgentPerformanceKPIs({
  totals,
  previous,
  showTrends,
  compareLabel,
  loading,
}: AgentPerformanceKPIsProps) {
  const t = totals;
  const trend = (cur: number, prev?: number) => (showTrends && previous && prev != null ? deltaPct(cur, prev) : null);
  const kpis: ReportKpi[] = t
    ? [
        {
          label: "Calls Made",
          value: t.calls.toLocaleString(),
          sub: `${t.connectedCalls} connected · ${t.connectRate}% connect rate`,
          trend: trend(t.calls, previous?.calls),
          icon: <PhoneCall className="text-[#2563eb]" size={18} />,
        },
        {
          label: "Leads Created",
          value: t.leadsCreated.toLocaleString(),
          sub: `${t.leadsContacted} contacted · ${t.contactRate}%`,
          trend: trend(t.leadsCreated, previous?.leadsCreated),
          icon: <UserPlus className="text-[#10b981]" size={18} />,
        },
        {
          label: "Leads Converted",
          value: t.leadsConverted.toLocaleString(),
          sub: `${t.conversionRate}% conversion rate`,
          trend: trend(t.leadsConverted, previous?.leadsConverted),
          icon: <Target className="text-[#8b5cf6]" size={18} />,
        },
        {
          label: "Follow-up Adherence",
          value: t.followUpAdherence == null ? "—" : `${t.followUpAdherence}%`,
          sub: `${t.followUpsDone}/${t.followUpsDue} done · ${t.followUpsOverdue} overdue`,
          icon: <ListChecks className="text-[#ff9f43]" size={18} />,
        },
        {
          label: "Avg First Response",
          value: formatMinutes(t.avgResponseMins),
          sub: `${t.respondedLeads} contacted · ${t.pendingResponseLeads} waiting`,
          icon: <Clock className="text-[#06b6d4]" size={18} />,
        },
        {
          label: "Properties & Farms",
          value: t.listingsTotal.toLocaleString(),
          sub: `${t.properties} properties · ${t.farms} farms${t.pmListings ? ` · ${t.pmListings} PM` : ""}`,
          trend: trend(t.listingsTotal, previous?.listings),
          icon: <Building2 className="text-[#64748b]" size={18} />,
        },
        {
          label: "WhatsApp Sent",
          value: t.whatsappSent.toLocaleString(),
          sub: `${t.whatsappRead} read · ${t.whatsappReadRate}% read rate`,
          trend: trend(t.whatsappSent, previous?.whatsappSent),
          icon: <MessageCircle className="text-[#22c55e]" size={18} />,
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
