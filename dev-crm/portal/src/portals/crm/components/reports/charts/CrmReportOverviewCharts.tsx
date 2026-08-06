"use client";

import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import {
  Area,
  Funnel,
  FunnelChart,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
} from "recharts";
import {
  Mail,
  TrendingUp,
  Users,
  Activity,
  Briefcase,
  LayoutGrid,
  RotateCcw,
  Check,
  Send,
  FileText,
  AtSign,
  BarChart3,
  LineChart as LineChartIcon,
  AreaChart as AreaChartIcon,
  Hexagon,
} from "lucide-react";
import { CRM_API_URL } from '@/lib/crm/config';
import { getCrmAuthToken } from "@/lib/crm/api";
import type { BoardReportPayload } from "@/components/crm/reports/panels/CrmBoardInsightsPanel";
import CrmVennDiagram from "@/components/crm/reports/charts/CrmVennDiagram";
import CrmDecisionCharts from "@/components/crm/reports/charts/CrmDecisionCharts";
import { CrmChartPanel } from "@/components/crm/ui";
import {
  CRM_CHART_INFO,
  CRM_CHART_PRIMARY,
  CRM_CHART_SECONDARY,
  CRM_CHART_SERIES,
  CRM_CHART_SUCCESS,
  CRM_CHART_TERTIARY,
} from "@/lib/crm/shared/chart-theme";
import { cn } from "@/lib/utils";

const PIE_COLORS = CRM_CHART_SERIES;
const STORAGE_KEY = "crm-report-chart-matrix-v1";
const VIEW_TYPE_STORAGE_KEY = "crm-report-chart-view-types-v1";

export type ChartViewType = "bar" | "line" | "area" | "radar";

const CHART_VIEW_OPTIONS: Array<{
  id: ChartViewType;
  label: string;
  icon: ReactNode;
}> = [
  { id: "bar", label: "Bar", icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { id: "line", label: "Line", icon: <LineChartIcon className="h-3.5 w-3.5" /> },
  { id: "area", label: "Area", icon: <AreaChartIcon className="h-3.5 w-3.5" /> },
  { id: "radar", label: "Radar", icon: <Hexagon className="h-3.5 w-3.5" /> },
];

export const CRM_CHART_CATALOG = [
  {
    id: "leads_over_time",
    category: "Pipeline",
    label: "Leads added by day",
    description: "Daily volume with 7-day average and peak day",
    defaultOn: true,
  },
  {
    id: "deals_by_stage",
    category: "Pipeline",
    label: "Deals by stage",
    description: "Open pipeline mix",
    defaultOn: true,
  },
  {
    id: "leads_by_owner",
    category: "Pipeline",
    label: "Leads by owner",
    description: "Top owners in period",
    defaultOn: false,
  },
  {
    id: "email_opens",
    category: "Outreach",
    label: "Email opens",
    description: "Tracked opens per day",
    defaultOn: true,
  },
  {
    id: "email_sends_vs_opens",
    category: "Outreach",
    label: "Leads vs outreach funnel",
    description: "Leads added, email sends, opens, replies, and touches by day",
    defaultOn: true,
  },
  {
    id: "follow_up_reply_attempts",
    category: "Outreach",
    label: "Reply by follow-up #",
    description: "Which send attempt usually gets the reply",
    defaultOn: true,
  },
  {
    id: "channel_performance",
    category: "Outreach",
    label: "Channel performance",
    description: "Leads, replies, and deals by acquisition channel",
    defaultOn: true,
  },
  {
    id: "email_replies",
    category: "Outreach",
    label: "Email replies",
    description: "Tracked replies per day",
    defaultOn: true,
  },
  {
    id: "top_templates",
    category: "Outreach",
    label: "Template performance",
    description: "Opens vs sends by template",
    defaultOn: false,
  },
  {
    id: "top_senders",
    category: "Outreach",
    label: "Volume & engagement by address",
    description: "Sends, opens, and open rate by from-address",
    defaultOn: false,
  },
  {
    id: "domain_engagement",
    category: "Outreach",
    label: "Engagement by email domain",
    description: "Sending domains — volume, opens, and open rate",
    defaultOn: true,
  },
  {
    id: "recipient_engagement",
    category: "Outreach",
    label: "Recipient engagement",
    description: "Top recipient addresses by opens vs sends",
    defaultOn: true,
  },
  {
    id: "sales_activity",
    category: "Activity",
    label: "Logged touches",
    description: "Calls, tasks, emails per day",
    defaultOn: true,
  },
  {
    id: "activity_mix",
    category: "Activity",
    label: "Activity mix",
    description: "Touch types breakdown",
    defaultOn: false,
  },
  {
    id: "venn_overlap",
    category: "Activity",
    label: "Engagement overlap",
    description: "Venn diagram of touches",
    defaultOn: true,
  },
  {
    id: "funnel_deals",
    category: "Pipeline",
    label: "Deal funnel",
    description: "Pipeline stage drop-off",
    defaultOn: false,
  },
  {
    id: "leads_by_pipeline_stage",
    category: "Pipeline",
    label: "Leads by stage",
    description: "Open leads by stage with share of pipeline",
    defaultOn: true,
  },
  {
    id: "deals_by_pipeline_stage",
    category: "Pipeline",
    label: "Deals by pipeline stage",
    description: "Open deals per stage (all pipelines)",
    defaultOn: true,
  },
  {
    id: "email_engagement_breakdown",
    category: "Outreach",
    label: "Email engagement",
    description: "Opened, clicked, and replied vs not",
    defaultOn: true,
  },
] as const;

export type CrmChartId = (typeof CRM_CHART_CATALOG)[number]["id"];

const CHART_IDS = CRM_CHART_CATALOG.map((c) => c.id) as CrmChartId[];

const SWITCHABLE_CHART_IDS = new Set<CrmChartId>([
  "leads_over_time",
  "email_opens",
  "email_replies",
  "email_sends_vs_opens",
  "follow_up_reply_attempts",
  "channel_performance",
  "top_templates",
  "top_senders",
  "domain_engagement",
  "recipient_engagement",
  "sales_activity",
  "leads_by_owner",
  "leads_by_pipeline_stage",
  "deals_by_pipeline_stage",
]);

const DEFAULT_CHART_VIEWS: Partial<Record<CrmChartId, ChartViewType>> = {
  leads_over_time: "bar",
  email_opens: "area",
  email_replies: "area",
  email_sends_vs_opens: "line",
  follow_up_reply_attempts: "bar",
  channel_performance: "bar",
  top_templates: "bar",
  top_senders: "bar",
  domain_engagement: "bar",
  recipient_engagement: "bar",
  sales_activity: "area",
  leads_by_owner: "bar",
  leads_by_pipeline_stage: "bar",
  deals_by_pipeline_stage: "bar",
};

function loadChartViews(): Partial<Record<CrmChartId, ChartViewType>> {
  const base = { ...DEFAULT_CHART_VIEWS };
  if (typeof window === "undefined") return base;
  try {
    const raw = localStorage.getItem(VIEW_TYPE_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Record<CrmChartId, ChartViewType>>;
    for (const id of Object.keys(parsed) as CrmChartId[]) {
      const v = parsed[id];
      if (v === "bar" || v === "line" || v === "area" || v === "radar") base[id] = v;
    }
    return base;
  } catch {
    return base;
  }
}

function persistChartViews(views: Partial<Record<CrmChartId, ChartViewType>>) {
  try {
    localStorage.setItem(VIEW_TYPE_STORAGE_KEY, JSON.stringify(views));
  } catch {
    /* ignore */
  }
}

const CATEGORIES = ["Pipeline", "Outreach", "Activity"] as const;

function defaultSelection(): Record<CrmChartId, boolean> {
  return Object.fromEntries(
    CRM_CHART_CATALOG.map((c) => [c.id, c.defaultOn]),
  ) as Record<CrmChartId, boolean>;
}

function loadSelection(): Record<CrmChartId, boolean> {
  const base = defaultSelection();
  if (typeof window === "undefined") return base;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Record<CrmChartId, boolean>>;
    for (const id of CHART_IDS) {
      if (typeof parsed[id] === "boolean") base[id] = parsed[id]!;
    }
    return base;
  } catch {
    return base;
  }
}

function persistSelection(sel: Record<CrmChartId, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sel));
  } catch {
    /* ignore quota */
  }
}

function formatChartDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatChartWeekday(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

function mapDates<T extends { date: string }>(rows: T[]) {
  return rows.map((r) => ({
    ...r,
    label: formatChartDate(r.date),
    weekday: formatChartWeekday(r.date),
  }));
}

const STAGE_PALETTE = [
  CRM_CHART_PRIMARY,
  CRM_CHART_SECONDARY,
  CRM_CHART_TERTIARY,
  CRM_CHART_SUCCESS,
  CRM_CHART_INFO,
];

function withRollingAverage<T extends { count: number }>(rows: T[], window = 7) {
  return rows.map((row, index) => {
    const from = Math.max(0, index - window + 1);
    const slice = rows.slice(from, index + 1);
    const avg = slice.reduce((sum, r) => sum + (r.count || 0), 0) / slice.length;
    return {
      ...row,
      rollingAvg: Math.round(avg * 10) / 10,
    };
  });
}

type DealStageRow = { name: string; value: number };

const CHART_ICONS: Record<CrmChartId, ReactNode> = {
  leads_over_time: <Users className="h-4 w-4" />,
  deals_by_stage: <Briefcase className="h-4 w-4" />,
  leads_by_owner: <Users className="h-4 w-4" />,
  email_opens: <Mail className="h-4 w-4" />,
  email_sends_vs_opens: <Send className="h-4 w-4" />,
  follow_up_reply_attempts: <TrendingUp className="h-4 w-4" />,
  channel_performance: <LayoutGrid className="h-4 w-4" />,
  email_replies: <Mail className="h-4 w-4" />,
  top_templates: <FileText className="h-4 w-4" />,
  top_senders: <Send className="h-4 w-4" />,
  domain_engagement: <AtSign className="h-4 w-4" />,
  recipient_engagement: <Mail className="h-4 w-4" />,
  sales_activity: <Activity className="h-4 w-4" />,
  activity_mix: <Activity className="h-4 w-4" />,
  venn_overlap: <Activity className="h-4 w-4" />,
  funnel_deals: <Briefcase className="h-4 w-4" />,
  leads_by_pipeline_stage: <Users className="h-4 w-4" />,
  deals_by_pipeline_stage: <Briefcase className="h-4 w-4" />,
  email_engagement_breakdown: <Mail className="h-4 w-4" />,
};

export default function CrmReportOverviewCharts({
  days,
  owner,
  className,
}: {
  days: string;
  owner: string;
  className?: string;
}) {
  const [board, setBoard] = useState<BoardReportPayload | null>(null);
  const [deals, setDeals] = useState<DealStageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [matrixOpen, setMatrixOpen] = useState(true);
  const [selection, setSelection] = useState<Record<CrmChartId, boolean>>(defaultSelection);
  const [selectionReady, setSelectionReady] = useState(false);
  const [chartViews, setChartViews] = useState<Partial<Record<CrmChartId, ChartViewType>>>(DEFAULT_CHART_VIEWS);

  const leadsGradientId = `crmLeads-${useId().replace(/:/g, "")}`;
  const opensGradientId = `crmOpens-${useId().replace(/:/g, "")}`;
  const repliesGradientId = `crmReplies-${useId().replace(/:/g, "")}`;
  const touchesGradientId = `crmTouches-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    setSelection(loadSelection());
    setChartViews(loadChartViews());
    setSelectionReady(true);
  }, []);

  const setChartView = useCallback((id: CrmChartId, view: ChartViewType) => {
    setChartViews((prev) => {
      const next = { ...prev, [id]: view };
      persistChartViews(next);
      return next;
    });
  }, []);

  const toggleChart = useCallback((id: CrmChartId) => {
    setSelection((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      persistSelection(next);
      return next;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    const next = defaultSelection();
    setSelection(next);
    persistSelection(next);
  }, []);

  const selectAll = useCallback(() => {
    const next = Object.fromEntries(CHART_IDS.map((id) => [id, true])) as Record<CrmChartId, boolean>;
    setSelection(next);
    persistSelection(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const token = getCrmAuthToken();
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const q = new URLSearchParams({ days, owner });
      try {
        const [boardRes, dealsRes] = await Promise.all([
          fetch(`${CRM_API_URL}/crm/reports/board?${q}`, { headers }),
          fetch(`${CRM_API_URL}/crm/reports/deals?${q}`, { headers }),
        ]);
        if (!cancelled) {
          if (boardRes.ok) setBoard(await boardRes.json());
          else setBoard(null);
          if (dealsRes.ok) {
            const j = await dealsRes.json();
            setDeals(Array.isArray(j) ? j : []);
          } else setDeals([]);
        }
      } catch {
        if (!cancelled) {
          setBoard(null);
          setDeals([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [days, owner]);

  const leadsByDay = useMemo(() => {
    const rows = mapDates(board?.leadsCreatedByDay ?? []);
    const enriched = withRollingAverage(rows.map((r) => ({ ...r, count: Number((r as { count?: number }).count) || 0 })));
    const peak = Math.max(0, ...enriched.map((r) => r.count));
    return enriched.map((r) => ({
      ...r,
      isPeak: peak > 0 && r.count === peak,
    }));
  }, [board?.leadsCreatedByDay]);
  const leadsByDayStats = useMemo(() => {
    if (!leadsByDay.length) return { total: 0, avg: 0, peak: 0, peakLabel: "—" };
    const total = leadsByDay.reduce((s, r) => s + r.count, 0);
    const peakRow = [...leadsByDay].sort((a, b) => b.count - a.count)[0];
    return {
      total,
      avg: Math.round((total / leadsByDay.length) * 10) / 10,
      peak: peakRow?.count ?? 0,
      peakLabel: peakRow ? `${peakRow.weekday} ${peakRow.label}` : "—",
    };
  }, [leadsByDay]);
  const opensByDay = useMemo(
    () => mapDates(board?.emailOpensByDay ?? []),
    [board?.emailOpensByDay],
  );
  const funnelByDay = useMemo(() => {
    const byDate = new Map<
      string,
      { date: string; leads: number; sends: number; opens: number; replies: number; touches: number }
    >();
    const ensure = (date: string) => {
      let row = byDate.get(date);
      if (!row) {
        row = { date, leads: 0, sends: 0, opens: 0, replies: 0, touches: 0 };
        byDate.set(date, row);
      }
      return row;
    };
    for (const row of board?.leadsCreatedByDay ?? []) {
      ensure(row.date).leads = row.count ?? 0;
    }
    for (const row of board?.emailSendsByDay ?? []) {
      ensure(row.date).sends = row.sends ?? 0;
    }
    for (const row of board?.emailOpensByDay ?? []) {
      ensure(row.date).opens = row.sendsOpened ?? 0;
    }
    for (const row of board?.emailRepliesByDay ?? []) {
      ensure(row.date).replies = row.repliesReceived ?? 0;
    }
    for (const row of board?.engagementByDay ?? []) {
      ensure(row.date).touches = row.count ?? 0;
    }
    return mapDates([...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)));
  }, [
    board?.leadsCreatedByDay,
    board?.emailSendsByDay,
    board?.emailOpensByDay,
    board?.emailRepliesByDay,
    board?.engagementByDay,
  ]);
  const repliesByDay = useMemo(
    () => mapDates(board?.emailRepliesByDay ?? []),
    [board?.emailRepliesByDay],
  );
  const touchesByDay = useMemo(
    () => mapDates(board?.engagementByDay ?? []),
    [board?.engagementByDay],
  );
  const leadsByOwner = useMemo(
    () =>
      (board?.leadsByOwner ?? []).slice(0, 8).map((r) => ({
        name: r.owner.length > 18 ? `${r.owner.slice(0, 16)}…` : r.owner,
        fullName: r.owner,
        count: r.count,
      })),
    [board?.leadsByOwner],
  );
  const activityMix = useMemo(
    () => (board?.engagementByType ?? []).slice(0, 6).map((r) => ({ name: r.type, value: r.count })),
    [board?.engagementByType],
  );
  const topTemplates = useMemo(
    () =>
      (board?.emailByTemplate ?? [])
        .slice(0, 6)
        .map((r) => ({
          name: r.templateName.length > 22 ? `${r.templateName.slice(0, 20)}…` : r.templateName,
          fullName: r.templateName,
          opens: r.uniqueOpened,
          sends: r.sends,
        })),
    [board?.emailByTemplate],
  );
  const topSenders = useMemo(
    () =>
      (board?.emailByFromAddress ?? [])
        .map((r) => {
          const openRate =
            r.sends > 0 ? Math.round((r.uniqueOpened / r.sends) * 1000) / 10 : 0;
          const local = r.fromEmail.split("@")[0] || r.fromEmail;
          const domain = r.fromEmail.split("@")[1] || "";
          const name =
            domain.length > 0
              ? `${local.length > 10 ? `${local.slice(0, 8)}…` : local}@${domain.length > 12 ? `${domain.slice(0, 10)}…` : domain}`
              : local.slice(0, 16);
          return {
            name,
            fullName: r.fromEmail,
            opens: r.uniqueOpened,
            sends: r.sends,
            notOpened: Math.max(0, r.sends - r.uniqueOpened),
            openRate,
          };
        })
        .sort((a, b) => b.sends - a.sends)
        .slice(0, 10),
    [board?.emailByFromAddress],
  );
  const domainEngagement = useMemo(() => {
    const map = new Map<string, { domain: string; sends: number; opens: number }>();
    for (const row of board?.emailByFromAddress ?? []) {
      const domain = (row.fromEmail.split("@")[1] || "unknown").toLowerCase();
      const existing = map.get(domain) || { domain, sends: 0, opens: 0 };
      existing.sends += row.sends;
      existing.opens += row.uniqueOpened;
      map.set(domain, existing);
    }
    return [...map.values()]
      .map((r) => ({
        name: r.domain.length > 18 ? `${r.domain.slice(0, 16)}…` : r.domain,
        fullName: r.domain,
        sends: r.sends,
        opens: r.opens,
        notOpened: Math.max(0, r.sends - r.opens),
        openRate: r.sends > 0 ? Math.round((r.opens / r.sends) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.sends - a.sends)
      .slice(0, 8);
  }, [board?.emailByFromAddress]);
  const recipientEngagement = useMemo(
    () =>
      (board?.emailByRecipient ?? [])
        .map((r) => {
          const local = r.recipient.split("@")[0] || r.recipient;
          const domain = r.recipient.split("@")[1] || "";
          return {
            name:
              domain.length > 0
                ? `${local.length > 10 ? `${local.slice(0, 8)}…` : local}@${domain.length > 12 ? `${domain.slice(0, 10)}…` : domain}`
                : local.slice(0, 16),
            fullName: r.recipient,
            sends: r.sends,
            opens: r.uniqueOpened,
            totalOpens: r.totalOpens,
            openRate: r.sends > 0 ? Math.round((r.uniqueOpened / r.sends) * 1000) / 10 : 0,
          };
        })
        .sort((a, b) => b.opens - a.opens || b.sends - a.sends)
        .slice(0, 10),
    [board?.emailByRecipient],
  );
  const channelPerformance = useMemo(
    () =>
      (board?.channelPerformance ?? [])
        .filter((r) => r && typeof r.channel === "string")
        .slice(0, 8)
        .map((r) => {
          const channel = r.channel || "Unknown";
          return {
            name: channel.length > 16 ? `${channel.slice(0, 14)}…` : channel,
            fullName: channel,
            leads: Number(r.leads) || 0,
            replies: Number(r.replies) || 0,
            deals: Number(r.deals) || 0,
            conversionRate: Number(r.conversionRate) || 0,
            replyRate: Number(r.replyRate) || 0,
          };
        }),
    [board?.channelPerformance],
  );
  const topReplyChannel = useMemo(() => {
    const rows = board?.channelPerformance ?? [];
    if (!rows.length) return null;
    return [...rows].sort((a, b) => b.replies - a.replies || b.deals - a.deals)[0] ?? null;
  }, [board?.channelPerformance]);

  const emailTotals = useMemo(() => {
    const summary = board?.emailEngagementSummary;
    if (summary) {
      return {
        sends: summary.sends,
        opened: summary.opened,
        rate: summary.openRatePercent,
      };
    }
    const sends = board?.outreachTrackedSends ?? 0;
    const opened = (board?.emailByFromAddress ?? []).reduce((s, r) => s + (r.uniqueOpened ?? 0), 0);
    const rate = sends > 0 ? Math.round((opened / sends) * 1000) / 10 : 0;
    return { sends, opened, rate };
  }, [board]);

  const leadsByPipelineStage = useMemo(() => {
    const stageMap = new Map<string, number>();
    for (const p of board?.openLeadsByPipeline ?? []) {
      for (const s of p.stages) {
        stageMap.set(s.stage, (stageMap.get(s.stage) || 0) + s.count);
      }
    }
    const total = [...stageMap.values()].reduce((s, n) => s + n, 0);
    return [...stageMap.entries()]
      .map(([stage, count]) => ({
        name: stage.length > 18 ? `${stage.slice(0, 16)}…` : stage,
        fullStage: stage,
        count,
        percent: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .map((row, index) => ({
        ...row,
        color: STAGE_PALETTE[index % STAGE_PALETTE.length],
        label: `${row.count} (${row.percent}%)`,
      }))
      .slice(0, 12);
  }, [board?.openLeadsByPipeline]);
  const leadsByStageTotal = useMemo(
    () => leadsByPipelineStage.reduce((s, r) => s + r.count, 0),
    [leadsByPipelineStage],
  );

  const dealsByPipelineStage = useMemo(() => {
    const stageMap = new Map<string, number>();
    for (const p of board?.openDealsByPipeline ?? []) {
      for (const s of p.stages) {
        stageMap.set(s.stage, (stageMap.get(s.stage) || 0) + s.count);
      }
    }
    return [...stageMap.entries()]
      .map(([stage, count]) => ({
        name: stage.length > 18 ? `${stage.slice(0, 16)}…` : stage,
        fullStage: stage,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [board?.openDealsByPipeline]);

  const emailEngagementSlices = useMemo(() => {
    const s = board?.emailEngagementSummary;
    if (!s || s.sends <= 0) return [];
    return [
      { name: "Opened", value: s.opened },
      { name: "Not opened", value: s.notOpened },
      { name: "Clicked", value: s.clicked },
      { name: "Replied", value: s.replies },
    ].filter((r) => r.value > 0);
  }, [board?.emailEngagementSummary]);

  if (!selectionReady) {
    return (
      <div className={cn("h-24 rounded-[var(--crm-radius-ui)] bg-surface-dim border border-[var(--border-color)] animate-pulse", className)} />
    );
  }

  // ALL CHARTS SHOWN BY DEFAULT
  const enabledCharts = CRM_CHART_CATALOG;
  const enabledCount = enabledCharts.length;

  return (
    <div className={cn("space-y-4", className)}>
      {loading ? (
        <div className="grid animate-pulse gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[300px] rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-surface-dim" />
          ))}
        </div>
      ) : !board ? (
        <p className="rounded-[var(--radius-md)] border border-[var(--warning-light)] bg-[var(--warning-light)] px-4 py-3 text-sm text-[var(--text-main)]">
          Could not load chart data. Check your connection and dashboard permissions.
        </p>
      ) : (
        <>
          <CrmDecisionCharts board={board} />

          <div>
            <h3 className="mb-3 flex items-center gap-2.5 text-sm font-semibold text-[var(--text-main)]">
              <span className="h-4 w-1 shrink-0 rounded-sm bg-[var(--warning,#ff9f43)]" aria-hidden />
              Cross-section comparison
            </h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <MiniKpi
                icon={<Users size={14} />}
                label="Leads created (Pipeline)"
                value={board.leadConversion.createdInPeriod}
              />
              <MiniKpi
                icon={<TrendingUp size={14} />}
                label="Conversion rate (Pipeline)"
                value={`${board.leadConversion.conversionRate}%`}
              />
              <MiniKpi
                icon={<Mail size={14} />}
                label="Tracked sends (Outreach)"
                value={emailTotals.sends}
                sub={emailTotals.sends > 0 ? `${emailTotals.rate}% unique open rate` : undefined}
              />
              <MiniKpi
                icon={<Send size={14} />}
                label="Avg sends at reply"
                value={board.followUpReplyAnalytics?.avgSendsAtReply ?? 0}
                sub={
                  board.followUpReplyAnalytics?.repliedConversations
                    ? `${board.followUpReplyAnalytics.repliedConversations} replied conversations`
                    : "No matched replies yet"
                }
              />
              <MiniKpi
                icon={<Mail size={14} />}
                label="Avg follow-ups at reply"
                value={board.followUpReplyAnalytics?.avgFollowUpsAtReply ?? 0}
                sub="After the initial send"
              />
              <MiniKpi
                icon={<LayoutGrid size={14} />}
                label="Top reply channel"
                value={topReplyChannel?.channel ?? "—"}
                sub={
                  topReplyChannel
                    ? `${topReplyChannel.replies} replies · ${topReplyChannel.deals} deals`
                    : undefined
                }
              />
              <MiniKpi
                icon={<Activity size={14} />}
                label="Human touches (Activity)"
                value={board.totalHumanTouches ?? 0}
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {enabledCharts.map((meta) => {
                const catalog = CRM_CHART_CATALOG.find((c) => c.id === meta.id)!;
                const switchable = SWITCHABLE_CHART_IDS.has(meta.id);
                const viewType = chartViews[meta.id] ?? DEFAULT_CHART_VIEWS[meta.id] ?? "bar";
                const fullWidth = meta.id === "channel_performance" || meta.id === "email_sends_vs_opens";
                return (
                  <div key={meta.id} className={fullWidth ? "lg:col-span-2" : undefined}>
                  <ChartCard
                    title={catalog.label}
                    subtitle={catalog.description}
                    icon={CHART_ICONS[meta.id]}
                    compact={meta.id === "leads_by_owner" || meta.id === "activity_mix"}
                    chartHeight={
                      meta.id === "top_senders" || meta.id === "recipient_engagement"
                        ? Math.min(520, Math.max(300, (meta.id === "top_senders" ? topSenders : recipientEngagement).length * 40 + 56))
                        : meta.id === "domain_engagement"
                          ? Math.min(440, Math.max(280, domainEngagement.length * 42 + 48))
                        : meta.id === "leads_by_pipeline_stage"
                          ? Math.min(480, Math.max(280, leadsByPipelineStage.length * 36 + 40))
                          : meta.id === "leads_over_time"
                            ? 320
                          : meta.id === "channel_performance"
                            ? Math.min(480, Math.max(340, channelPerformance.length * 28 + 200))
                          : meta.id === "email_sends_vs_opens" ||
                              meta.id === "follow_up_reply_attempts" ||
                              meta.id === "email_engagement_breakdown"
                            ? 300
                            : undefined
                    }
                    switchable={switchable}
                    viewType={viewType}
                    onViewTypeChange={(view) => setChartView(meta.id, view)}
                  >
                    <ChartBody
                      chartId={meta.id}
                      viewType={viewType}
                      deals={deals}
                      leadsByDay={leadsByDay}
                      leadsByDayStats={leadsByDayStats}
                      opensByDay={opensByDay}
                      funnelByDay={funnelByDay}
                      repliesByDay={repliesByDay}
                      touchesByDay={touchesByDay}
                      leadsByOwner={leadsByOwner}
                      activityMix={activityMix}
                      topTemplates={topTemplates}
                      topSenders={topSenders}
                      domainEngagement={domainEngagement}
                      recipientEngagement={recipientEngagement}
                      channelPerformance={channelPerformance}
                      leadsByPipelineStage={leadsByPipelineStage}
                      leadsByStageTotal={leadsByStageTotal}
                      dealsByPipelineStage={dealsByPipelineStage}
                      emailEngagementSlices={emailEngagementSlices}
                      emailTotals={emailTotals}
                      repliesByAttempt={board.followUpReplyAnalytics?.repliesByAttempt ?? []}
                      leadsGradientId={leadsGradientId}
                      opensGradientId={opensGradientId}
                      repliesGradientId={repliesGradientId}
                      touchesGradientId={touchesGradientId}
                    />
                  </ChartCard>
                  </div>
                );
              })}
            </div>

          {board.emailEngagementNote && enabledCount > 0 && (
            <p className="text-xs text-text-muted leading-relaxed px-1">{board.emailEngagementNote}</p>
          )}
        </>
      )}
    </div>
  );
}

function ChartBody({
  chartId,
  viewType,
  deals,
  leadsByDay,
  leadsByDayStats,
  opensByDay,
  funnelByDay,
  repliesByDay,
  touchesByDay,
  leadsByOwner,
  activityMix,
  topTemplates,
  topSenders,
  domainEngagement,
  recipientEngagement,
  channelPerformance,
  leadsByPipelineStage,
  leadsByStageTotal,
  dealsByPipelineStage,
  emailEngagementSlices,
  emailTotals,
  repliesByAttempt,
  leadsGradientId,
  opensGradientId,
  repliesGradientId,
  touchesGradientId,
}: {
  chartId: CrmChartId;
  viewType: ChartViewType;
  deals: DealStageRow[];
  leadsByDay: Array<{
    date: string;
    label: string;
    weekday: string;
    count: number;
    rollingAvg: number;
    isPeak: boolean;
  }>;
  leadsByDayStats: { total: number; avg: number; peak: number; peakLabel: string };
  opensByDay: ReturnType<typeof mapDates>;
  funnelByDay: Array<{
    date: string;
    label: string;
    leads: number;
    sends: number;
    opens: number;
    replies: number;
    touches: number;
  }>;
  repliesByDay: ReturnType<typeof mapDates>;
  touchesByDay: ReturnType<typeof mapDates>;
  leadsByOwner: { name: string; fullName: string; count: number }[];
  activityMix: { name: string; value: number }[];
  topTemplates: { name: string; fullName: string; opens: number; sends: number }[];
  topSenders: { name: string; fullName: string; opens: number; sends: number; notOpened: number; openRate: number }[];
  domainEngagement: Array<{
    name: string;
    fullName: string;
    sends: number;
    opens: number;
    notOpened: number;
    openRate: number;
  }>;
  recipientEngagement: Array<{
    name: string;
    fullName: string;
    sends: number;
    opens: number;
    totalOpens: number;
    openRate: number;
  }>;
  channelPerformance: Array<{
    name: string;
    fullName: string;
    leads: number;
    replies: number;
    deals: number;
    conversionRate: number;
    replyRate: number;
  }>;
  leadsByPipelineStage: Array<{
    name: string;
    fullStage: string;
    count: number;
    percent: number;
    color: string;
    label: string;
  }>;
  leadsByStageTotal: number;
  dealsByPipelineStage: { name: string; fullStage: string; count: number }[];
  emailEngagementSlices: { name: string; value: number }[];
  emailTotals: { sends: number; opened: number; rate: number };
  repliesByAttempt: Array<{ attempt: number; label: string; replies: number }>;
  leadsGradientId: string;
  opensGradientId: string;
  repliesGradientId: string;
  touchesGradientId: string;
}) {
  const tooltipStyle = {
    borderRadius: 12,
    border: "1px solid var(--border-color)",
    fontSize: 12,
  };

  const switchablePayload = (() => {
    switch (chartId) {
      case "leads_over_time":
        return {
          data: leadsByDay as unknown as Array<Record<string, string | number>>,
          categoryKey: "label",
          series: [
            { key: "count", name: "Leads added", color: CRM_CHART_PRIMARY },
            { key: "rollingAvg", name: "7-day avg", color: CRM_CHART_TERTIARY },
          ],
          empty: "No leads created in this range",
          header: (
            <div className="grid grid-cols-3 gap-2 shrink-0">
              <div className="rounded-[var(--radius-md)] bg-blue-50/80 px-2.5 py-1.5">
                <p className="text-[9px] font-black uppercase tracking-wider text-blue-700/70">Total</p>
                <p className="text-sm font-bold tabular-nums text-blue-700">{leadsByDayStats.total}</p>
              </div>
              <div className="rounded-[var(--radius-md)] bg-[var(--surface-dim)] px-2.5 py-1.5">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Avg / day</p>
                <p className="text-sm font-bold tabular-nums text-slate-700">{leadsByDayStats.avg}</p>
              </div>
              <div className="rounded-[var(--radius-md)] bg-amber-50/80 px-2.5 py-1.5">
                <p className="text-[9px] font-black uppercase tracking-wider text-amber-700/70">Peak</p>
                <p className="text-sm font-bold tabular-nums text-amber-700">
                  {leadsByDayStats.peak}
                  <span className="ml-1 text-[10px] font-semibold text-amber-700/70">{leadsByDayStats.peakLabel}</span>
                </p>
              </div>
            </div>
          ),
        };
      case "email_opens":
        return {
          data: opensByDay as unknown as Array<Record<string, string | number>>,
          categoryKey: "label",
          series: [{ key: "sendsOpened", name: "Sends opened", color: "#10b981" }],
          empty: "No email opens in this range",
        };
      case "email_replies":
        return {
          data: repliesByDay as unknown as Array<Record<string, string | number>>,
          categoryKey: "label",
          series: [{ key: "repliesReceived", name: "Replies", color: CRM_CHART_SECONDARY }],
          empty: "No email replies in this range",
        };
      case "email_sends_vs_opens":
        return {
          data: funnelByDay as unknown as Array<Record<string, string | number>>,
          categoryKey: "label",
          series: [
            { key: "leads", name: "Leads added", color: "#3b82f6" },
            { key: "sends", name: "Email sends", color: CRM_CHART_PRIMARY },
            { key: "opens", name: "Email opens", color: "#10b981" },
            { key: "replies", name: "Email replies", color: CRM_CHART_SECONDARY },
            { key: "touches", name: "Touches", color: "#64748b" },
          ],
          empty: "No leads or outreach activity in this range",
          hasData: funnelByDay.some((r) => r.leads > 0 || r.sends > 0 || r.opens > 0 || r.replies > 0 || r.touches > 0),
        };
      case "follow_up_reply_attempts":
        return {
          data: repliesByAttempt as unknown as Array<Record<string, string | number>>,
          categoryKey: "label",
          series: [{ key: "replies", name: "Replies", color: CRM_CHART_SECONDARY }],
          empty: "No thread-matched replies in this range",
        };
      case "channel_performance":
        return {
          data: channelPerformance as unknown as Array<Record<string, string | number>>,
          categoryKey: "name",
          fullNameKey: "fullName",
          series: [
            { key: "leads", name: "Leads", color: "#3b82f6" },
            { key: "replies", name: "Replies", color: CRM_CHART_SECONDARY },
            { key: "deals", name: "Deals", color: "#10b981" },
          ],
          empty: "No channel data in this range — check Lead Source / opportunity platform on new leads",
          hasData: channelPerformance.some((r) => r.leads > 0 || r.replies > 0 || r.deals > 0),
          footer:
            channelPerformance.length > 0 ? (
              <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border-color)] shrink-0">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-surface-dim/60 text-text-muted uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2 font-bold">Channel</th>
                      <th className="px-3 py-2 font-bold text-right">Leads</th>
                      <th className="px-3 py-2 font-bold text-right">Replies</th>
                      <th className="px-3 py-2 font-bold text-right">Deals</th>
                      <th className="px-3 py-2 font-bold text-right">Conv %</th>
                      <th className="px-3 py-2 font-bold text-right">Reply %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelPerformance.map((row) => (
                      <tr key={row.fullName} className="border-t border-[var(--border-color)]">
                        <td className="px-3 py-1.5 font-semibold text-text-main" title={row.fullName}>
                          {row.name}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{row.leads}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{row.replies}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{row.deals}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{row.conversionRate}%</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{row.replyRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : undefined,
        };
      case "top_templates":
        return {
          data: topTemplates as unknown as Array<Record<string, string | number>>,
          categoryKey: "name",
          fullNameKey: "fullName",
          series: [
            { key: "opens", name: "Unique opens", color: "#f59e0b" },
            { key: "sends", name: "Sends", color: "#64748b" },
          ],
          empty: "No template sends in this range",
        };
      case "top_senders":
        return {
          data: topSenders as unknown as Array<Record<string, string | number>>,
          categoryKey: "name",
          fullNameKey: "fullName",
          series: [
            { key: "sends", name: "Sends", color: CRM_CHART_PRIMARY },
            { key: "opens", name: "Unique opens", color: "#10b981" },
            { key: "openRate", name: "Open rate %", color: CRM_CHART_SECONDARY },
          ],
          empty: "No tracked sends in this range",
        };
      case "domain_engagement":
        return {
          data: domainEngagement as unknown as Array<Record<string, string | number>>,
          categoryKey: "name",
          fullNameKey: "fullName",
          series: [
            { key: "sends", name: "Sends", color: CRM_CHART_PRIMARY },
            { key: "opens", name: "Unique opens", color: "#059669" },
            { key: "openRate", name: "Open rate %", color: CRM_CHART_SECONDARY },
          ],
          empty: "No sending domain data",
        };
      case "recipient_engagement":
        return {
          data: recipientEngagement as unknown as Array<Record<string, string | number>>,
          categoryKey: "name",
          fullNameKey: "fullName",
          series: [
            { key: "sends", name: "Sends", color: "#94a3b8" },
            { key: "opens", name: "Unique opens", color: "#10b981" },
            { key: "openRate", name: "Open rate %", color: "#d97706" },
          ],
          empty: "No recipient engagement in this range",
        };
      case "sales_activity":
        return {
          data: touchesByDay as unknown as Array<Record<string, string | number>>,
          categoryKey: "label",
          series: [{ key: "count", name: "Activities", color: CRM_CHART_PRIMARY }],
          empty: "No logged activity in this range",
        };
      case "leads_by_owner":
        return {
          data: leadsByOwner as unknown as Array<Record<string, string | number>>,
          categoryKey: "name",
          fullNameKey: "fullName",
          series: [{ key: "count", name: "Leads", color: "#3b82f6" }],
          empty: "No leads in this range",
        };
      case "leads_by_pipeline_stage":
        return {
          data: leadsByPipelineStage as unknown as Array<Record<string, string | number>>,
          categoryKey: "name",
          fullNameKey: "fullStage",
          series: [
            { key: "count", name: "Open leads", color: CRM_CHART_PRIMARY },
            { key: "percent", name: "Share %", color: "#f59e0b" },
          ],
          empty: "No open leads",
          header: (
            <div className="flex items-center justify-between gap-2 shrink-0 px-0.5">
              <p className="text-[11px] font-semibold text-text-muted">
                {leadsByStageTotal} open leads across {leadsByPipelineStage.length} stages
              </p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Share of open pipeline</p>
            </div>
          ),
        };
      case "deals_by_pipeline_stage":
        return {
          data: dealsByPipelineStage as unknown as Array<Record<string, string | number>>,
          categoryKey: "name",
          fullNameKey: "fullStage",
          series: [{ key: "count", name: "Open deals", color: "#14b8a6" }],
          empty: "No open deals",
        };
      default:
        return null;
    }
  })();

  if (switchablePayload) {
    const empty =
      switchablePayload.hasData === false || switchablePayload.data.length === 0;
    if (empty) return <ChartEmpty message={switchablePayload.empty} />;
    if (switchablePayload.header || switchablePayload.footer) {
      return (
        <div className="flex h-full flex-col gap-2">
          {switchablePayload.header}
          <div className="min-h-0 flex-1">
            <SwitchableSeriesChart
              viewType={viewType}
              data={switchablePayload.data}
              categoryKey={switchablePayload.categoryKey}
              fullNameKey={switchablePayload.fullNameKey}
              series={switchablePayload.series}
            />
          </div>
          {switchablePayload.footer}
        </div>
      );
    }
    return (
      <SwitchableSeriesChart
        viewType={viewType}
        data={switchablePayload.data}
        categoryKey={switchablePayload.categoryKey}
        fullNameKey={switchablePayload.fullNameKey}
        series={switchablePayload.series}
      />
    );
  }

  switch (chartId) {
    case "deals_by_stage":
      if (deals.length === 0) return <ChartEmpty message="No open deals yet" />;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={deals}
              cx="50%"
              cy="50%"
              innerRadius={56}
              outerRadius={88}
              paddingAngle={3}
              dataKey="value"
              nameKey="name"
              label={({ name, percent, value }) => (percent != null && percent > 0.05 ? `${name} (${value}, ${(percent * 100).toFixed(0)}%)` : "")}
              labelLine={true}
            >
              {deals.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              iconType="circle"
              wrapperStyle={{ fontSize: 11, fontWeight: 600 }}
            />
          </PieChart>
        </ResponsiveContainer>
      );

    case "leads_by_owner":
      if (leadsByOwner.length === 0) return <ChartEmpty message="No leads in this range" />;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={leadsByOwner} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorLeadsOwner" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={1}/>
                <stop offset="100%" stopColor="#60a5fa" stopOpacity={1}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" opacity={0.5} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "var(--text-muted)", fontWeight: 600 }} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="name"
              width={92}
              tick={{ fontSize: 11, fill: "var(--text-main)", fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{fill: 'var(--surface-dim)', opacity: 0.5}}
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)', fontSize: 12, fontWeight: 600, padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)' }}
              itemStyle={{ padding: '3px 0' }}
              formatter={(value) => [value, "Leads"]}
              labelFormatter={(_, payload) =>
                payload?.[0]?.payload?.fullName ? String(payload[0].payload.fullName) : ""
              }
            />
            <Bar dataKey="count" fill="url(#colorLeadsOwner)" radius={[0, 6, 6, 0]} barSize={14}>
              <LabelList dataKey="count" position="right" fill="#64748b" fontSize={10} fontWeight={600} formatter={(v: any) => v || ""} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );

    case "venn_overlap":
      return (
        <div className="w-full h-full flex items-center justify-center pt-6">
          <CrmVennDiagram
            setA={{ label: "Leads", value: (leadsByDay as any[]).reduce((a, b) => a + (b.count||0), 0) || 10, color: "#3b82f6" }}
            setB={{ label: "Touches", value: (touchesByDay as any[]).reduce((a, b) => a + (b.count||0), 0) || 5, color: "#10b981" }}
            intersection={{ label: "Engaged", value: Math.floor(((leadsByDay as any[]).reduce((a, b) => a + (b.count||0), 0) || 10) * 0.4) }}
            height={220}
          />
        </div>
      );

    case "funnel_deals":
      if (deals.length === 0) return <ChartEmpty message="No pipeline data" />;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <FunnelChart>
            <Tooltip contentStyle={tooltipStyle} />
            <Funnel
              dataKey="value"
              data={[...deals].sort((a, b) => b.value - a.value)}
              isAnimationActive
            >
              <LabelList position="right" fill="var(--text-main)" stroke="none" dataKey="name" fontSize={11} />
              <LabelList position="center" fill="#fff" stroke="none" dataKey="value" fontSize={12} formatter={(val: any) => val || ""} />
              {deals.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Funnel>
          </FunnelChart>
        </ResponsiveContainer>
      );

    case "activity_mix":
      if (activityMix.length === 0) return <ChartEmpty message="No activities in this range" />;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={activityMix}
              cx="50%"
              cy="50%"
              outerRadius={88}
              dataKey="value"
              nameKey="name"
              label={({ name, percent, value }) => (percent != null && percent > 0.05 ? `${name} (${value}, ${(percent * 100).toFixed(0)}%)` : "")}
              labelLine={true}
            >
              {activityMix.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      );

    case "top_templates":
      if (topTemplates.length === 0) return <ChartEmpty message="No template sends in this range" />;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={topTemplates} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={4}>
            <defs>
              <linearGradient id="colorTemplateOpens" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={1}/>
                <stop offset="100%" stopColor="#fbbf24" stopOpacity={1}/>
              </linearGradient>
              <linearGradient id="colorTemplateSends" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#64748b" stopOpacity={1}/>
                <stop offset="100%" stopColor="#94a3b8" stopOpacity={1}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" opacity={0.5} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--text-muted)", fontWeight: 600 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--text-muted)", fontWeight: 600 }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{fill: 'var(--surface-dim)', opacity: 0.5}}
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)', fontSize: 12, fontWeight: 600, padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)' }}
              itemStyle={{ padding: '3px 0' }}
              labelFormatter={(_, payload) =>
                payload?.[0]?.payload?.fullName ? String(payload[0].payload.fullName) : ""
              }
            />
            <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600, color: "#64748b" }} />
            <Bar dataKey="opens" fill="url(#colorTemplateOpens)" name="Unique opens" radius={[6, 6, 0, 0]} barSize={12}>
              <LabelList dataKey="opens" position="top" fill="#64748b" fontSize={10} fontWeight={600} formatter={(v: any) => v || ""} />
            </Bar>
            <Bar dataKey="sends" fill="url(#colorTemplateSends)" name="Sends" radius={[6, 6, 0, 0]} barSize={12}>
              <LabelList dataKey="sends" position="top" fill="#64748b" fontSize={10} fontWeight={600} formatter={(v: any) => v || ""} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );

    case "top_senders":
      if (topSenders.length === 0) return <ChartEmpty message="No tracked sends in this range" />;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={topSenders} margin={{ left: -16, right: 0, top: 16, bottom: 0 }} barGap={4}>
            <defs>
              <linearGradient id="colorSendsOverview" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CRM_CHART_PRIMARY} stopOpacity={1}/>
                <stop offset="100%" stopColor="#818cf8" stopOpacity={1}/>
              </linearGradient>
              <linearGradient id="colorOpensOverview" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity={1}/>
                <stop offset="100%" stopColor="#c084fc" stopOpacity={1}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" opacity={0.5} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: "var(--text-main)", fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "var(--text-muted)", fontWeight: 600 }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{fill: 'var(--surface-dim)', opacity: 0.5}}
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)', fontSize: 12, fontWeight: 600, padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)' }}
              itemStyle={{ padding: '3px 0' }}
              labelFormatter={(_, payload) =>
                payload?.[0]?.payload?.fullName ? String(payload[0].payload.fullName) : ""
              }
            />
            <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600, color: "#64748b" }} />
            <Bar dataKey="opens" fill="url(#colorOpensOverview)" name="Unique opens" radius={[6, 6, 0, 0]} barSize={16}>
              <LabelList dataKey="opens" position="top" fill="#64748b" fontSize={10} fontWeight={600} formatter={(v: any) => v || ""} />
            </Bar>
            <Bar dataKey="sends" fill="url(#colorSendsOverview)" name="Total Sends" radius={[6, 6, 0, 0]} barSize={16}>
              <LabelList dataKey="sends" position="top" fill="#64748b" fontSize={10} fontWeight={600} formatter={(v: any) => v || ""} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );

    case "leads_by_pipeline_stage":
      if (leadsByPipelineStage.length === 0) return <ChartEmpty message="No open leads" />;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={leadsByPipelineStage} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorLeadsPipeline" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#ec4899" stopOpacity={1}/>
                <stop offset="100%" stopColor="#f472b6" stopOpacity={1}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" opacity={0.5} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "var(--text-muted)", fontWeight: 600 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: "var(--text-main)", fontWeight: 600 }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{fill: 'var(--surface-dim)', opacity: 0.5}}
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)', fontSize: 12, fontWeight: 600, padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)' }}
              itemStyle={{ padding: '3px 0' }}
              labelFormatter={(_, payload) =>
                payload?.[0]?.payload?.fullStage ? String(payload[0].payload.fullStage) : ""
              }
            />
            <Bar dataKey="count" fill="url(#colorLeadsPipeline)" radius={[0, 6, 6, 0]} barSize={14}>
              <LabelList dataKey="count" position="right" fontSize={10} fontWeight={600} fill="#64748b" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );

    case "deals_by_pipeline_stage":
      if (dealsByPipelineStage.length === 0) return <ChartEmpty message="No open deals" />;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dealsByPipelineStage} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorDealsPipeline" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#14b8a6" stopOpacity={1}/>
                <stop offset="100%" stopColor="#2dd4bf" stopOpacity={1}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" opacity={0.5} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "var(--text-muted)", fontWeight: 600 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: "var(--text-main)", fontWeight: 600 }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{fill: 'var(--surface-dim)', opacity: 0.5}}
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)', fontSize: 12, fontWeight: 600, padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)' }}
              itemStyle={{ padding: '3px 0' }}
              labelFormatter={(_, payload) =>
                payload?.[0]?.payload?.fullStage ? String(payload[0].payload.fullStage) : ""
              }
            />
            <Bar dataKey="count" fill="url(#colorDealsPipeline)" radius={[0, 6, 6, 0]} barSize={14}>
              <LabelList dataKey="count" position="right" fontSize={10} fontWeight={600} fill="#64748b" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );

    case "email_engagement_breakdown":
      if (emailEngagementSlices.length === 0) return <ChartEmpty message="No tracked sends in this range" />;
      return (
        <div className="flex h-full flex-col gap-2">
          <div className="grid grid-cols-3 gap-2 shrink-0">
            <div className="rounded-[var(--radius-md)] bg-[var(--surface-dim)] px-2.5 py-1.5">
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Sends</p>
              <p className="text-sm font-bold tabular-nums text-slate-700">{emailTotals.sends}</p>
            </div>
            <div className="rounded-[var(--radius-md)] bg-emerald-50/80 px-2.5 py-1.5">
              <p className="text-[9px] font-black uppercase tracking-wider text-emerald-700/70">Opened</p>
              <p className="text-sm font-bold tabular-nums text-emerald-700">{emailTotals.opened}</p>
            </div>
            <div className="rounded-[var(--radius-md)] bg-[var(--primary-light)] px-2.5 py-1.5">
              <p className="text-[9px] font-black uppercase tracking-wider text-primary/70">Open rate</p>
              <p className="text-sm font-bold tabular-nums text-primary">{emailTotals.rate}%</p>
            </div>
          </div>
          <div className="min-h-0 flex-1 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={emailEngagementSlices}
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={82}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                >
                  {emailEngagementSlices.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                  <LabelList dataKey="value" position="outside" fontSize={10} fontWeight={700} fill="#64748b" />
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      );

    default:
      return <ChartEmpty message="Chart unavailable" />;
  }
}

function ChartTypeToggle({
  value,
  onChange,
}: {
  value: ChartViewType;
  onChange: (view: ChartViewType) => void;
}) {
  return (
    <div
      className="inline-flex h-[30px] shrink-0 items-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white p-0.5 shadow-[var(--crm-shadow-input)]"
      role="group"
    >
      {CHART_VIEW_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          title={opt.label}
          aria-label={`${opt.label} chart`}
          onClick={() => onChange(opt.id)}
          className={cn(
            "inline-flex h-full items-center gap-1 rounded-[calc(var(--radius-md)-2px)] px-2 text-[10px] font-medium transition-colors",
            value === opt.id
              ? "bg-[var(--primary)] text-white"
              : "text-[var(--text-muted)] hover:text-[var(--text-main)]",
          )}
        >
          {opt.icon}
          <span className="hidden sm:inline">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}

type SeriesDef = { key: string; name: string; color: string };

function SwitchableSeriesChart({
  viewType,
  data,
  categoryKey,
  series,
  fullNameKey,
}: {
  viewType: ChartViewType;
  data: Array<Record<string, string | number>>;
  categoryKey: string;
  series: SeriesDef[];
  fullNameKey?: string;
}) {
  const tooltipStyle = {
    borderRadius: 12,
    border: "none" as const,
    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
    fontSize: 12,
    fontWeight: 600,
    padding: "10px 14px",
    backgroundColor: "rgba(255,255,255,0.96)",
  };

  if (!data.length) return <ChartEmpty message="No data" />;

  if (viewType === "radar") {
    const radarData = data.slice(0, 12);
    return (
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="72%">
          <PolarGrid stroke="#e2e8f0" />
          <PolarAngleAxis dataKey={categoryKey} tick={{ fontSize: 10, fill: "#64748b" }} />
          <PolarRadiusAxis tick={{ fontSize: 9, fill: "#94a3b8" }} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as Record<string, unknown> | undefined;
              if (fullNameKey && row?.[fullNameKey]) return String(row[fullNameKey]);
              return row?.[categoryKey] != null ? String(row[categoryKey]) : "";
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600, color: "#64748b" }} />
          {series.map((s) => (
            <Radar
              key={s.key}
              name={s.name}
              dataKey={s.key}
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.2}
              strokeWidth={2}
            />
          ))}
        </RadarChart>
      </ResponsiveContainer>
    );
  }

  if (viewType === "line") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.6} />
          <XAxis dataKey={categoryKey} tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={20} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as Record<string, unknown> | undefined;
              if (fullNameKey && row?.[fullNameKey]) return String(row[fullNameKey]);
              return row?.[categoryKey] != null ? String(row[categoryKey]) : "";
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600, color: "#64748b" }} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2.25}
              dot={data.length <= 14}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (viewType === "area") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`swArea-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.6} />
          <XAxis dataKey={categoryKey} tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={20} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as Record<string, unknown> | undefined;
              if (fullNameKey && row?.[fullNameKey]) return String(row[fullNameKey]);
              return row?.[categoryKey] != null ? String(row[categoryKey]) : "";
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600, color: "#64748b" }} />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#swArea-${s.key})`}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  // bar (default) — horizontal for named categories; vertical for time series
  const looksTemporal = data.some((d) => "date" in d || "weekday" in d);

  if (!looksTemporal && data.length <= 12) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 24, top: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" opacity={0.55} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey={categoryKey} width={110} tick={{ fontSize: 10, fill: "#334155", fontWeight: 600 }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "#f1f5f9", opacity: 0.5 }}
            contentStyle={tooltipStyle}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as Record<string, unknown> | undefined;
              if (fullNameKey && row?.[fullNameKey]) return String(row[fullNameKey]);
              return row?.[categoryKey] != null ? String(row[categoryKey]) : "";
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600, color: "#64748b" }} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[0, 6, 6, 0]} barSize={series.length > 2 ? 10 : 14} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={3}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.55} />
        <XAxis dataKey={categoryKey} tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={20} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: "#f1f5f9", opacity: 0.5 }}
          contentStyle={tooltipStyle}
          labelFormatter={(_, payload) => {
            const row = payload?.[0]?.payload as Record<string, unknown> | undefined;
            if (fullNameKey && row?.[fullNameKey]) return String(row[fullNameKey]);
            return row?.[categoryKey] != null ? String(row[categoryKey]) : "";
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600, color: "#64748b" }} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[6, 6, 0, 0]} barSize={data.length > 20 ? 8 : 14} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChartCard({
  title,
  subtitle,
  icon,
  children,
  compact,
  chartHeight,
  switchable,
  viewType,
  onViewTypeChange,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  children: ReactNode;
  compact?: boolean;
  chartHeight?: number;
  switchable?: boolean;
  viewType?: ChartViewType;
  onViewTypeChange?: (view: ChartViewType) => void;
}) {
  const heightPx = chartHeight ?? (compact ? 220 : 260);
  return (
    <CrmChartPanel
      title={title}
      subtitle={subtitle}
      icon={icon}
      actions={switchable && viewType && onViewTypeChange ? <ChartTypeToggle value={viewType} onChange={onViewTypeChange} /> : undefined}
      bodyClassName="pt-0"
    >
      <div className="w-full" style={{ height: heightPx }}>{children}</div>
    </CrmChartPanel>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center text-xs text-text-muted border border-dashed border-[var(--border-color)] rounded-[var(--radius-md)]">
      {message}
    </div>
  );
}

function MiniKpi({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-3 shadow-[var(--crm-shadow-card)]">
      <div className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-light)] text-[var(--primary)]">
        {icon}
      </div>
      <p className="text-[10px] font-semibold leading-snug text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--text-main)]">{value}</p>
      {sub ? <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{sub}</p> : null}
    </div>
  );
}
