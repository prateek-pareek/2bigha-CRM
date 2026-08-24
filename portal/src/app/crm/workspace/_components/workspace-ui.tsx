"use client";

import {
  useEffect,
  useState,
  useRef,
  memo,
  type ReactNode,
} from "react";
import NextLink from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Link,
  Mail,
  Phone,
  Plus,
  TrendingUp,
  Users,
} from "lucide-react";
import { getCrmAuthToken } from "@/lib/crm/api";
import { CRM_API_URL } from "@/lib/crm/config";
import { isAdmin } from "@/lib/suite/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatePickerField, parseDateOnly, formatDateOnly } from "@/components/ui/date-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { CrmKpiCard } from "@/components/crm/ui/CrmKpiCard";
import { CRM_PANEL } from "@/lib/crm/ui";

export type WorkspaceWindowPreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "last_30_days";
export type WorkspaceWindowFilter = WorkspaceWindowPreset | `${string},${string}`;

function formatWorkspaceWindowLabel(
  value: string,
  options: { value: string; label: string }[],
): string {
  const selected = options.find((o) => o.value === value);
  if (selected) return selected.label;
  if (value.includes(",")) {
    const [fromStr, toStr] = value.split(",", 2);
    const from = parseDateOnly(fromStr?.trim() || "");
    const to = parseDateOnly(toStr?.trim() || "");
    if (from && to) {
      const fmt = (d: Date) =>
        d.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year:
            from.getFullYear() !== to.getFullYear() ? "numeric" : undefined,
        });
      return `${fmt(from)} – ${fmt(to)}`;
    }
    return value.replace(",", " – ");
  }
  return "Select...";
}

function isValidCustomWindowRange(from: string, to: string): boolean {
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  return !!(start && end && start.getTime() <= end.getTime());
}

/**
 * Matches API `isCrmWorkspaceAdmin` — team workspace + owner picker.
 * Resolves `role` the same way as `lib/suite/auth` `isAdmin` (string or `{ name }`),
 * and normalizes underscores so `SUPER_ADMIN` ≡ `SUPERADMIN`.
 */
export function canViewAllCrmWorkspaces(user?: { role?: unknown }): boolean {
  return isAdmin(user as Parameters<typeof isAdmin>[0]);
}

export type LeadFollowUpStats = {
  weekStart?: string;
  weekEnd?: string;
  totalLeadsAdded: number;
  followUpScheduled: number;
  followUpDone: number;
  notScheduled: number;
  scheduledNotDone: number;
  notScheduledLeads: Array<{
    id: string;
    name: string;
    email: string;
    organization?: string;
    leadOwner?: string;
    createdAt: string;
  }>;
  scheduledNotDoneLeads: Array<{
    id: string;
    name: string;
    email: string;
    organization?: string;
    leadOwner?: string;
    createdAt: string;
  }>;
};

export type WorkspacePayload = {
  window?: WorkspaceWindowFilter;
  attention: import("@/components/crm/reports/panels/CrmSalesAttention").SalesAttentionPayload;
  priorityTasks: Array<{
    id: string;
    title: string;
    status: string;
    dueDate?: string;
    overdue: boolean;
    relatedType?: string;
    relatedTo?: string;
    authorName?: string;
  }>;
  recentActivities: Array<{
    id: string;
    type: string;
    title?: string;
    contentSnippet: string;
    createdAt: string;
    relatedType?: string;
    relatedTo?: string;
    authorName?: string;
    recordLabel?: string;
    href?: string | null;
    auditAction?: string;
    auditModule?: string;
    changesSummary?: string;
    source?: "activity" | "audit";
  }>;
  todayFocus: {
    overdueFollowUps: number;
    proposalsAwaitingResponse: number;
    hotLeadsNoAction: number;
  };
  leadsAddedByDay?: Array<{
    date: string;
    total: number;
    byPipeline: Array<{
      pipelineId: string | null;
      pipelineName: string;
      count: number;
    }>;
    byStage?: Array<{ stage: string; count: number }>;
    stageEntered?: Array<{ stage: string; count: number }>;
  }>;
  leadFollowUpWeek?: LeadFollowUpStats;
  leadFollowUpByWindow?: {
    today: LeadFollowUpStats;
    yesterday: LeadFollowUpStats;
    thisWeek: LeadFollowUpStats;
  };
  upcomingFollowUps?: {
    items: Array<{
      jobId: string;
      runAt: string;
      entityType: "Lead" | "Contact";
      entityId: string;
      name: string;
      email: string;
      organization?: string;
      leadOwner?: string;
      stepLabel: string;
      overdue: boolean;
    }>;
    totalPending: number;
    overdueCount: number;
    nextRunAt: string | null;
  };
  leadIntake?: {
    today: Array<{
      id: string;
      name: string;
      email: string;
      organization?: string;
      leadOwner?: string;
      status?: string;
      createdAt: string;
    }>;
    yesterday: Array<{
      id: string;
      name: string;
      email: string;
      organization?: string;
      leadOwner?: string;
      status?: string;
      createdAt: string;
    }>;
    thisWeek: Array<{
      id: string;
      name: string;
      email: string;
      organization?: string;
      leadOwner?: string;
      status?: string;
      createdAt: string;
    }>;
  };
};

export function recordHref(
  relatedType: string | undefined,
  relatedTo: string | undefined,
): string | null {
  if (!relatedTo) return null;
  const t = (relatedType || "").toLowerCase();
  if (t === "lead" || t === "leads") return `/crm/leads/${relatedTo}`;
  if (t === "contact" || t === "contacts") return `/crm/contacts/${relatedTo}`;
  if (t === "client" || t === "clients") return `/crm/clients/${relatedTo}`;
  if (t === "organization" || t === "organizations") {
    return `/crm/organizations/${relatedTo}`;
  }
  return null;
}

export function fmtMoney(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

export function fmtMoneyIfAllowed(value: number, allowed: boolean) {
  return allowed ? fmtMoney(value) : "—";
}

export function greetingForHour(d: Date): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export const HS_BORDER = "border-[var(--border-color)]";
export const HS_TEXT = "text-[var(--text-main)]";
export const HS_MUTED = "text-[var(--text-muted)]";
/** Enterprise card chrome — FlowCRM / HubSpot soft elevation on cream canvas */
export const HS_PANEL = CRM_PANEL;
/** Fixed categorical order for the pipeline-overview bars — reuses the CRM's own status tokens. */
const PIPELINE_STAGE_COLORS = [
  "var(--info)",
  "var(--success)",
  "var(--warning)",
  "var(--error)",
];
export const INITIAL_WORKSPACE_ITEMS = 25;
export const WORKSPACE_ITEMS_INCREMENT = 25;

const WORKSPACE_SECTIONS = [
  "attention",
  "tasks",
  "activity",
  "leads",
  "lead_status",
  "upcoming_follow_ups",
] as const;
export type WorkspaceSection = (typeof WORKSPACE_SECTIONS)[number];

export const TAB_SECTIONS: Record<string, WorkspaceSection[]> = {
  summary: [],
  work: ["attention", "upcoming_follow_ups", "tasks"],
  work_queue: ["attention", "upcoming_follow_ups", "tasks"],
  prospecting: ["attention", "lead_status"],
  lead_status: ["lead_status"],
  follow_ups: ["upcoming_follow_ups"],
  tasks: ["tasks"],
  activity: ["activity"],
  calls: ["attention", "activity"],
  calendar: [],
  growth: [],
};

function emptyAttention(): WorkspacePayload["attention"] {
  return {
    neverContactedLeads: [],
    staleLeads: [],
    unopenedTrackedEmails: [],
    openedTrackedEmails: [],
    replyReceivedEmails: [],
    repliesAwaitingResponse: [],
    note: "",
  };
}

export function emptyWorkspacePayload(): WorkspacePayload {
  return {
    attention: emptyAttention(),
    priorityTasks: [],
    recentActivities: [],
    todayFocus: {
      overdueFollowUps: 0,
      proposalsAwaitingResponse: 0,
      hotLeadsNoAction: 0,
    },
    leadsAddedByDay: [],
    leadFollowUpWeek: {
      weekStart: "",
      weekEnd: "",
      totalLeadsAdded: 0,
      followUpScheduled: 0,
      followUpDone: 0,
      notScheduled: 0,
      scheduledNotDone: 0,
      notScheduledLeads: [],
      scheduledNotDoneLeads: [],
    },
    leadFollowUpByWindow: {
      today: {
        totalLeadsAdded: 0,
        followUpScheduled: 0,
        followUpDone: 0,
        notScheduled: 0,
        scheduledNotDone: 0,
        notScheduledLeads: [],
        scheduledNotDoneLeads: [],
      },
      yesterday: {
        totalLeadsAdded: 0,
        followUpScheduled: 0,
        followUpDone: 0,
        notScheduled: 0,
        scheduledNotDone: 0,
        notScheduledLeads: [],
        scheduledNotDoneLeads: [],
      },
      thisWeek: {
        totalLeadsAdded: 0,
        followUpScheduled: 0,
        followUpDone: 0,
        notScheduled: 0,
        scheduledNotDone: 0,
        notScheduledLeads: [],
        scheduledNotDoneLeads: [],
      },
    },
    leadIntake: { today: [], yesterday: [], thisWeek: [] },
    upcomingFollowUps: { items: [], totalPending: 0, overdueCount: 0, nextRunAt: null },
  };
}

export function mergeWorkspacePayload(
  prev: WorkspacePayload | null,
  patch: Partial<WorkspacePayload>,
): WorkspacePayload {
  const base = prev ?? emptyWorkspacePayload();
  return {
    ...base,
    ...patch,
    attention: patch.attention ?? base.attention,
    priorityTasks: patch.priorityTasks ?? base.priorityTasks,
    recentActivities: patch.recentActivities ?? base.recentActivities,
    todayFocus: patch.todayFocus ?? base.todayFocus,
    leadsAddedByDay: patch.leadsAddedByDay ?? base.leadsAddedByDay,
    leadFollowUpWeek: patch.leadFollowUpWeek ?? base.leadFollowUpWeek,
    leadFollowUpByWindow: patch.leadFollowUpByWindow ?? base.leadFollowUpByWindow,
    leadIntake: patch.leadIntake ?? base.leadIntake,
    upcomingFollowUps: patch.upcomingFollowUps ?? base.upcomingFollowUps,
    window: patch.window ?? base.window,
  };
}

export function summaryInitialSections(): WorkspaceSection[] {
  return ["tasks", "activity"];
}

type WorkspaceLeadRow = NonNullable<
  WorkspacePayload["leadFollowUpWeek"]
>["notScheduledLeads"][number];

export function WorkspaceLeadLinkList({
  leads,
}: {
  leads: Array<WorkspaceLeadRow & { href?: string }>;
}) {
  return (
    <ul className="divide-y divide-[var(--surface-dim)]">
      {leads.map((l) => (
        <li key={String((l as any).id || (l as any)._id)}>
          <NextLink
            href={(l as any).href || `/crm/leads/${l.id}`}
            className="flex items-start justify-between gap-3 py-3 hover:bg-[var(--background)] rounded-md -mx-2 px-2"
          >
            <div className="min-w-0">
              <p className={cn("text-sm font-medium truncate", HS_TEXT)}>{l.name}</p>
              <p className={cn("text-sm mt-0.5 truncate", HS_MUTED)}>
                {l.organization || l.email || "—"}
              </p>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                Added {new Date(l.createdAt).toLocaleString()}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--border-color)]" />
          </NextLink>
        </li>
      ))}
    </ul>
  );
}

export function Dropdown({ value, onChange, options, widthClass = "min-w-[160px]", showCustomDateRange }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  widthClass?: string;
  showCustomDateRange?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  const isCustomValue = !selected && value.includes(',');

  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const customRangeReady = isValidCustomWindowRange(customFrom, customTo);
  const [specificDate, setSpecificDate] = useState('');

  useEffect(() => {
    if (!value.includes(',')) return;
    const [from, to] = value.split(',', 2);
    if (from?.trim()) setCustomFrom(from.trim());
    if (to?.trim()) setCustomTo(to.trim());
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        const target = e.target as Element;
        if (target?.closest?.('[data-radix-popper-content-wrapper]')) {
          return;
        }
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleApplyCustom = () => {
    if (customFrom && customTo) {
      onChange(`${customFrom},${customTo}`);
      setOpen(false);
    }
  };

  const handleApplySpecific = () => {
    if (specificDate) {
      onChange(`${specificDate},${specificDate}`);
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className={`relative ${widthClass}`}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={`h-9 w-full inline-flex items-center gap-2 bg-[var(--card-bg)] border rounded-md px-4 text-sm font-medium text-[var(--text-main)] shadow-sm transition-colors whitespace-nowrap justify-between ${
          open ? 'border-[var(--hs-link)] ring-1 ring-[var(--hs-link)]/30' : 'border-[var(--border-color)] hover:border-[var(--text-muted)]'
        }`}
      >
        <span className="truncate">{formatWorkspaceWindowLabel(value, options)}</span>
        <ChevronDown size={13} className={`text-[var(--text-muted)] shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-[9999] bg-[var(--card-bg)] border border-[var(--border-color)] rounded-md shadow-lg min-w-full overflow-hidden flex flex-col max-h-[80vh]">
          <div className="py-1 flex-shrink-0 overflow-y-auto">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full flex items-center justify-between px-4 py-2 text-sm transition-colors text-left ${
                  opt.value === value
                    ? 'bg-[var(--accent)] text-[var(--hs-link)] font-semibold dark:bg-[color-mix(in_srgb,var(--hs-link)_18%,var(--card-bg))]'
                    : 'text-[var(--text-main)] font-medium hover:bg-[var(--background)]'
                }`}
              >
                <span className="truncate pr-3">{opt.label}</span>
                {opt.value === value && <Check size={13} className="text-[var(--hs-link)] shrink-0" />}
              </button>
            ))}
          </div>

          {showCustomDateRange && (
            <div className="p-3 border-t border-[var(--border-color)] bg-[var(--surface-dim)]/50 space-y-4 flex-shrink-0">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Specific Date</span>
                </div>
                <div className="flex gap-2">
                  <DatePickerField
                    value={specificDate}
                    onChange={setSpecificDate}
                    placeholder="Select date"
                    buttonClassName="h-8 w-full justify-start rounded-md border-[var(--border-color)] bg-[var(--card-bg)] px-2 text-xs font-semibold hover:bg-[var(--background)]"
                  />
                  <Button 
                    size="sm" 
                    onClick={handleApplySpecific} 
                    disabled={!specificDate}
                    className="h-8 text-xs font-semibold bg-[var(--hs-link)] text-white hover:bg-[var(--hs-link-hover)] rounded-md shrink-0"
                  >
                    Apply
                  </Button>
                </div>
              </div>

              <div className="space-y-2 border-t border-[var(--border-color)] pt-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Custom Range</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <DatePickerField
                    value={customFrom}
                    onChange={setCustomFrom}
                    placeholder="Start date"
                    buttonClassName="h-8 w-full justify-start rounded-md border-[var(--border-color)] bg-[var(--card-bg)] px-2 text-xs font-semibold hover:bg-[var(--background)]"
                  />
                  <DatePickerField
                    value={customTo}
                    onChange={setCustomTo}
                    placeholder="End date"
                    buttonClassName="h-8 w-full justify-start rounded-md border-[var(--border-color)] bg-[var(--card-bg)] px-2 text-xs font-semibold hover:bg-[var(--background)]"
                  />
                </div>
                <Button 
                  size="sm" 
                  onClick={handleApplyCustom} 
                  disabled={!customFrom || !customTo}
                  className="w-full h-8 text-xs font-semibold bg-[var(--hs-link)] text-white hover:bg-[var(--hs-link-hover)] rounded-md mt-1"
                >
                  Apply Custom Range
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatWorkspaceDayLabel(isoDate: string): string {
  const parts = isoDate.split("-").map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return isoDate;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Match api-hrms reporting calendar (default Asia/Kolkata, UTC+05:30, no DST). */
function reportingDayBoundsIso(ymd: string): [string, string] | null {
  const parts = ymd.split("-").map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  const offsetMs = 5.5 * 60 * 60 * 1000;
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - offsetMs);
  const end = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0) - offsetMs - 1);
  return [start.toISOString(), end.toISOString()];
}

function DayLeadsExpanded({
  date,
  ownerLabel,
  ownerId,
}: {
  date: string;
  ownerLabel?: string | null;
  ownerId?: string | null;
}) {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const token = getCrmAuthToken();
    const bounds = reportingDayBoundsIso(date);
    if (!bounds) {
      setLoading(false);
      return;
    }
    const q = new URLSearchParams();
    q.set("page", "1");
    q.set("pageSize", "100");
    const filter: Array<{ property: string; operator: string; value: string }> = [
      {
        property: "createdAt",
        operator: "between",
        value: `${bounds[0]},${bounds[1]}`,
      },
    ];
    if (ownerLabel?.trim() || ownerId?.trim()) {
      const ownerValues = [ownerLabel?.trim(), ownerId?.trim()].filter(
        Boolean,
      ) as string[];
      filter.push({
        property: "leadOwner",
        operator: "equals",
        value: ownerValues.join("||"),
      });
    }
    q.set("filters", JSON.stringify(filter));

    fetch(`${CRM_API_URL}/crm/leads?${q}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    }).then(r => r.json()).then(data => {
      if (active) {
        const rows = Array.isArray(data)
          ? data
          : (data?.data || data?.leads || data?.items || []);
        setLeads(
          (rows as Array<Record<string, unknown>>).map((row) => {
            const first = String(row.firstName || "").trim();
            const last = String(row.lastName || "").trim();
            const id = String(row._id || row.id || "");
            const name =
              [first, last].filter(Boolean).join(" ") ||
              String(row.name || "").trim() ||
              "Unnamed lead";
            return {
              id,
              name,
              email: String(row.email || ""),
              organization: String(row.organization || "") || undefined,
              leadOwner: String(row.leadOwner || "") || undefined,
              status: String(row.stage || row.status || "New").trim() || "New",
              createdAt: row.createdAt
                ? new Date(String(row.createdAt)).toISOString()
                : new Date().toISOString(),
            };
          }),
        );
        setLoading(false);
      }
    }).catch(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [date, ownerLabel, ownerId]);

  if (loading) {
    return (
      <div className="p-3 text-xs text-[var(--text-muted)] animate-pulse border-t border-[var(--border-color)]">
        Loading leads...
      </div>
    );
  }
  if (!leads.length) {
    return (
      <div className="p-3 text-xs text-[var(--text-muted)] border-t border-[var(--border-color)]">
        No leads found for this date.
      </div>
    );
  }
  return (
    <div className="bg-[var(--surface-dim)] border-t border-[var(--border-color)] p-3 mt-3 -mx-4 mb-2 shadow-inner">
      <WorkspaceLeadLinkList leads={leads} />
    </div>
  );
}

export const LeadsAddedByDayPanel = memo(function LeadsAddedByDayPanel({
  days,
  onDateClick,
  ownerLabel,
  ownerId,
  onUseLast30Days,
  windowFilter,
}: {
  days: NonNullable<WorkspacePayload["leadsAddedByDay"]>;
  onDateClick?: (date: string) => void;
  ownerLabel?: string | null;
  ownerId?: string | null;
  onUseLast30Days?: () => void;
  windowFilter?: string;
}) {
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [customDateForDay, setCustomDateForDay] = useState<Record<string, string>>({});

  const title = "Leads added by day";
  const emptyMessage = "No new leads or stage moves in this period for the current workspace view.";
  const action = { href: "/crm/leads", label: "Open leads" };

  if (!days.length) {
    const showLast30Cta =
      !!onUseLast30Days &&
      windowFilter !== "last_30_days" &&
      !String(windowFilter || "").includes(",");
    return (
      <HsSection
        title={title}
        icon={<Users className="h-4 w-4 text-[var(--text-main)]" />}
        action={action}
      >
        <div className="space-y-3 px-1 py-2">
          <EmptyHs message={emptyMessage} />
          {showLast30Cta ? (
            <div className="flex flex-wrap items-center justify-center gap-2 pb-2">
              <p className="text-xs text-[var(--text-muted)] text-center w-full">
                Counts <span className="font-semibold">new creates</span> in the header date range
                (Asia/Kolkata).
              </p>
              <button
                type="button"
                onClick={onUseLast30Days}
                className="rounded-md bg-[var(--hs-link)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
              >
                Show last 30 days
              </button>
            </div>
          ) : null}
        </div>
      </HsSection>
    );
  }
  return (
    <HsSection
      title={title}
      action={action}
      icon={<Users className="h-4 w-4 text-[var(--text-main)]" />}
    >
      <ul className="divide-y divide-[var(--surface-dim)]">
        {days.map((day) => {
          const effectiveDate = customDateForDay[day.date] || day.date;
          const byStage = day.byStage || [];
          const stageEntered =
            "stageEntered" in day
              ? (day as { stageEntered?: Array<{ stage: string; count: number }> })
                  .stageEntered || []
              : [];
          return (
          <li key={day.date} className="py-3 px-4 -mx-4 transition-colors hover:bg-[var(--surface-dim)]/30">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <button 
                    type="button" 
                    className={cn("text-sm font-semibold hover:underline flex items-center gap-1", "text-[var(--hs-link)]")}
                    onClick={() =>
                      setExpandedDay((prev) => (prev === day.date ? null : day.date))
                    }
                  >
                    {formatWorkspaceDayLabel(effectiveDate)}
                    <CalendarDays className="h-3 w-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[99999]" align="start">
                  <CalendarUI
                    mode="single"
                    selected={parseDateOnly(effectiveDate)}
                    onSelect={(d) => {
                      if (d) {
                        const newDate = formatDateOnly(d);
                        setCustomDateForDay(prev => ({ ...prev, [day.date]: newDate }));
                        setExpandedDay(day.date);
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <p className={cn("text-sm tabular-nums font-semibold text-[var(--hs-link)]")}>
                {day.total} added
                {stageEntered.length > 0 ? (
                  <span className="ml-2 font-medium text-[var(--text-muted)]">
                    · {stageEntered.reduce((s, x) => s + x.count, 0)} stage moves
                  </span>
                ) : null}
              </p>
            </div>
            {byStage.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {byStage.map((s) => (
                  <span
                    key={`${day.date}-stage-${s.stage}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--surface-dim)] bg-[var(--surface-dim)] px-2.5 py-1 text-xs font-medium text-[var(--text-main)]"
                    title="New leads created in this stage"
                  >
                    <span className="truncate max-w-[10rem]" title={s.stage}>
                      {s.stage}
                    </span>
                    <span className="tabular-nums text-[var(--text-muted)]">{s.count}</span>
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {day.byPipeline.map((p) => (
                <span
                  key={`${day.date}-${p.pipelineId ?? "none"}-${p.pipelineName}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-transparent px-2.5 py-1 text-xs font-medium text-[var(--text-muted)]"
                  title="Pipeline board"
                >
                  <span className="truncate max-w-[10rem]" title={p.pipelineName}>
                    {p.pipelineName}
                  </span>
                  <span className="tabular-nums">{p.count}</span>
                </span>
              ))}
            </div>
            {stageEntered.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {stageEntered.map((s) => (
                  <span
                    key={`${day.date}-entered-${s.stage}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200"
                    title="Moved into this stage during the day (Dead / Disqualified, etc.)."
                  >
                    <span className="truncate max-w-[10rem]" title={s.stage}>
                      → {s.stage}
                    </span>
                    <span className="tabular-nums">{s.count}</span>
                  </span>
                ))}
              </div>
            )}
            {expandedDay === day.date && (
              <DayLeadsExpanded
                date={effectiveDate}
                ownerLabel={ownerLabel}
                ownerId={ownerId}
              />
            )}
          </li>
          );
        })}
      </ul>
    </HsSection>
  );
});

export function HsKpi({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: ReactNode;
}) {
  return <CrmKpiCard label={label} value={value} sub={sub} icon={icon} />;
}

export const PipelinePerformanceTable = memo(function PipelinePerformanceTable({
  rows,
  canViewRevenue = true,
}: {
  rows: Array<{
    stage: string;
    count: number;
    value: number;
    sharePct: number;
    conversionFromPrevPct: number | null;
  }>;
  canViewRevenue?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="crm-table min-w-full">
        <thead>
          <tr className="border-b border-[var(--surface-dim)]">
            <th className="py-2 pr-4 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Stage</th>
            <th className="py-2 pr-4 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Leads</th>
            <th className="py-2 pr-4 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Stage Share</th>
            <th className="py-2 pr-4 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Conv. from Prev</th>
            <th className="py-2 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Pipeline Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.stage} className="border-b border-[#f1f4f8]">
              <td className="py-2.5 pr-4 text-sm font-medium text-[var(--text-main)]">{r.stage || "—"}</td>
              <td className="py-2.5 pr-4 text-sm text-[var(--text-main)] tabular-nums">{r.count}</td>
              <td className="py-2.5 pr-4 text-sm text-[var(--text-main)] tabular-nums">{r.sharePct.toFixed(1)}%</td>
              <td className="py-2.5 pr-4 text-sm text-[var(--text-main)] tabular-nums">
                {r.conversionFromPrevPct == null ? (
                  "—"
                ) : (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
                      r.conversionFromPrevPct >= 70
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200"
                        : r.conversionFromPrevPct >= 40
                          ? "bg-amber-50 text-amber-700 border border-amber-200 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200"
                          : "bg-rose-50 text-rose-700 border border-rose-200 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-200",
                    )}
                  >
                    {r.conversionFromPrevPct.toFixed(1)}%
                  </span>
                )}
              </td>
              <td className="py-2.5 text-sm text-[var(--text-main)] tabular-nums">{fmtMoneyIfAllowed(r.value, canViewRevenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export const PipelinePerformanceFunnel = memo(function PipelinePerformanceFunnel({
  rows,
}: {
  rows: Array<{
    stage: string;
    count: number;
    value: number;
    sharePct: number;
    conversionFromPrevPct: number | null;
  }>;
}) {
  const maxCount = Math.max(...rows.map((r) => r.count || 0), 1);
  return (
    <div className="rounded-md border border-[var(--surface-dim)] bg-[var(--surface-dim)] p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)] mb-2">
        Funnel view
      </p>
      <div className="space-y-2">
        {rows.map((row) => {
          const widthPct = Math.max(10, (row.count / maxCount) * 100);
          return (
            <div key={`funnel-${row.stage}`}>
              <div className="flex items-center justify-between text-sm text-[var(--text-muted)] mb-1">
                <span className="truncate pr-2">{row.stage}</span>
                <span className="tabular-nums">{row.count}</span>
              </div>
              <div className="h-2 rounded-full bg-[var(--surface-dim)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--primary)]"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export function HsSection({
  title,
  children,
  action,
  icon,
  headerExtra,
}: {
  title: string;
  children: ReactNode;
  action?: { href: string; label: string };
  icon?: ReactNode;
  headerExtra?: ReactNode;
}) {
  return (
    <div className={HS_PANEL}>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] bg-[var(--card-bg)] px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="crm-line-title inline-block h-4 w-[3px] shrink-0 rounded-[1px]"
            style={{ background: "var(--crm-line-title)" }}
            aria-hidden
          />
          {icon ? (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] bg-[var(--primary-light)] text-[var(--primary)]">
              {icon}
            </span>
          ) : null}
          <h2 className={cn("truncate text-base font-semibold leading-none", HS_TEXT)}>{title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {headerExtra}
          {action && (
            <NextLink
              href={action.href}
              className="shrink-0 text-sm font-medium text-[var(--primary)] hover:text-[var(--primary-dark)]"
            >
              {action.label}
            </NextLink>
          )}
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

/** Switch between long list panels without stacking them vertically. */
export function WorkspaceStackedListTabs({
  tabs,
  defaultValue,
  compact = false,
  embedded = false,
}: {
  defaultValue: string;
  compact?: boolean;
  /** When true, skip outer card chrome (parent already provides CrmSectionCard). */
  embedded?: boolean;
  tabs: Array<{
    value: string;
    label: string;
    count?: number;
    action?: { href: string; label: string };
    icon?: ReactNode;
    content: ReactNode;
  }>;
}) {
  const initial = tabs.some((t) => t.value === defaultValue)
    ? defaultValue
    : tabs[0]?.value || defaultValue;
  const [value, setValue] = useState(initial);
  const active = tabs.find((t) => t.value === value) || tabs[0];

  if (!tabs.length) return null;

  const shell = (
    <>
        <div
          className={cn(
            "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
            !embedded && "border-b border-[var(--border-color)]",
            embedded
              ? "gap-1.5 border-b border-[var(--border-color)] pb-2"
              : compact
                ? "gap-1.5 px-2.5 py-1.5 bg-[var(--card-bg)]"
                : "px-4 py-3 bg-[var(--card-bg)]",
          )}
        >
          <TabsList
            className={cn(
              "h-auto w-full sm:w-auto flex flex-wrap justify-start",
              compact
                ? "gap-0 rounded-none bg-transparent p-0 border-b-0"
                : "gap-1 rounded-md bg-[var(--surface-dim)] p-1",
            )}
          >
            {tabs.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className={cn(
                  compact
                    ? "rounded-none border-b-2 border-transparent bg-transparent px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] shadow-none data-[state=active]:bg-transparent data-[state=active]:text-[var(--text-main)] data-[state=active]:border-[var(--hs-link)] data-[state=active]:shadow-none"
                    : "rounded-[var(--radius-md)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-muted)] data-[state=active]:bg-[var(--card-bg)] data-[state=active]:text-[var(--text-main)] data-[state=active]:shadow-sm",
                )}
              >
                <span className="inline-flex items-center gap-1">
                  {t.icon}
                  <span>{t.label}</span>
                  {typeof t.count === "number" ? (
                    <span
                      className={cn(
                        "tabular-nums",
                        compact
                          ? "ml-0.5 inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-[var(--surface-dim)] px-1.5 py-px text-[10px] font-bold text-[var(--text-muted)]"
                          : null,
                      )}
                    >
                      {compact ? t.count : ` (${t.count})`}
                    </span>
                  ) : null}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          {active?.action ? (
            <NextLink
              href={active.action.href}
              className={cn(
                "font-semibold text-[var(--hs-link)] hover:underline shrink-0 self-end sm:self-auto",
                compact ? "text-[11px] px-1" : "text-sm hover:text-[#007a8c]",
              )}
            >
              {active.action.label}
            </NextLink>
          ) : null}
        </div>
        {tabs.map((tab) => (
          <TabsContent
            key={tab.value}
            value={tab.value}
            className={cn(
              "mt-0 outline-none",
              embedded
                ? "pt-3"
                : compact
                  ? "max-h-[320px] overflow-y-auto p-2 sm:p-2.5"
                  : "p-4",
            )}
          >
            {tab.content}
          </TabsContent>
        ))}
    </>
  );

  return (
    <Tabs value={value} onValueChange={setValue} className="w-full">
      {embedded ? (
        shell
      ) : (
        <div
          className={cn(
            HS_PANEL,
            compact && "overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
          )}
        >
          {shell}
        </div>
      )}
    </Tabs>
  );
}

export function EmptyHs({ message }: { message: string }) {
  return <p className={cn("text-sm text-center py-10", HS_MUTED)}>{message}</p>;
}

export function TabSectionSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "min-h-[200px] rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)] animate-pulse",
        className,
      )}
      aria-busy="true"
      aria-label="Loading workspace data"
    />
  );
}

export function SummarySectionLabel({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-2 px-0.5">
      <span
        className="crm-line-title mt-1 inline-block h-4 w-[3px] shrink-0 rounded-[1px]"
        style={{ background: "var(--crm-line-title)" }}
        aria-hidden
      />
      <div className="min-w-0">
        <h3 className={cn("text-base font-semibold leading-none", HS_TEXT)}>{title}</h3>
        <p className={cn("mt-1 text-sm", HS_MUTED)}>{subtitle}</p>
      </div>
    </div>
  );
}

export function TaskRow({ t }: { t: WorkspacePayload["priorityTasks"][0] }) {
  return (
    <div className="min-w-0 flex-1">
      <p className={cn("text-sm font-medium", HS_TEXT)}>{t.title}</p>
      <div className="flex flex-wrap gap-2 mt-1">
        <span className="text-sm font-semibold uppercase text-[var(--text-muted)]">{t.status}</span>
        {t.dueDate && (
          <span className={cn("text-sm font-semibold uppercase", t.overdue ? "text-rose-600" : "text-[var(--text-muted)]")}>
            {t.overdue ? "Overdue · " : ""}
            {new Date(t.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        )}
        {t.authorName && <span className="text-sm text-[var(--text-muted)]">{t.authorName}</span>}
      </div>
    </div>
  );
}

export function ActivityList({
  items,
  dense = true,
}: {
  items: WorkspacePayload["recentActivities"];
  dense?: boolean;
}) {
  if (!items.length) {
    return <EmptyHs message="No activity to show yet." />;
  }
  return (
    <ul className={dense ? "space-y-2" : "space-y-3"}>
      {items.map((a) => {
        const href = a.href ?? recordHref(a.relatedType, a.relatedTo);
        const isAudit = a.type === "Audit" || a.source === "audit";
        const isSystem = a.type === "System";
        const isWorkflow = a.type === "Workflow";
        
        let TypeIcon = <Plus className="h-3.5 w-3.5" />;
        let typeColor = "text-[var(--hs-link)] bg-[var(--surface-dim)]";
        
        const type = a.type.toLowerCase();
        if (type === 'email' || type === 'sent mails') {
          TypeIcon = <Mail className="h-3.5 w-3.5" />;
          typeColor = "text-blue-600 bg-blue-50 dark:text-blue-300 dark:bg-blue-500/15";
        } else if (type === 'task' || type === 'follow up') {
          TypeIcon = <CheckCircle2 className="h-3.5 w-3.5" />;
          typeColor = "text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-500/15";
        } else if (type === 'note') {
          TypeIcon = <FileText className="h-3.5 w-3.5" />;
          typeColor = "text-purple-600 bg-purple-50 dark:text-purple-300 dark:bg-purple-500/15";
        } else if (isWorkflow) {
          TypeIcon = <TrendingUp className="h-3.5 w-3.5" />;
          typeColor = "text-indigo-600 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-500/15";
        } else if (isSystem) {
          TypeIcon = <TrendingUp className="h-3.5 w-3.5" />;
          typeColor = "text-violet-600 bg-violet-50 dark:text-violet-300 dark:bg-violet-500/15";
        } else if (isAudit) {
          const action = a.title?.toLowerCase() || "";
          if (action.includes('delete')) {
            TypeIcon = <AlertTriangle className="h-3.5 w-3.5" />;
            typeColor = "text-rose-600 bg-rose-50 dark:text-rose-300 dark:bg-rose-500/15";
          } else if (action.includes('update')) {
            TypeIcon = <TrendingUp className="h-3.5 w-3.5" />;
            typeColor = "text-blue-600 bg-blue-50 dark:text-blue-300 dark:bg-blue-500/15";
          } else {
            TypeIcon = <Plus className="h-3.5 w-3.5" />;
            typeColor = "text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/15";
          }
        }

        return (
          <li
            key={a.id}
            className={cn(
              "rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-4 py-3 relative overflow-hidden",
              isAudit && "border-l-2 border-l-slate-400",
              isWorkflow && "border-l-2 border-l-indigo-400",
              isSystem && "border-l-2 border-l-violet-400",
              !dense && "py-4",
              "hover:border-[var(--border-color)] hover:bg-[var(--card-bg)] transition-all shadow-sm"
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className={cn("flex h-6 w-6 items-center justify-center rounded-full", typeColor)}>
                  {TypeIcon}
                </div>
                <span className={cn("text-xs font-bold uppercase tracking-wide", (isAudit || isSystem) ? "text-[var(--text-muted)]" : "text-[var(--hs-link)]")}>
                  {a.type}
                </span>
              </div>
              <span className="text-sm text-[var(--text-muted)] font-medium shrink-0">
                {a.createdAt
                  ? new Date(a.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : ""}
              </span>
            </div>
            
            <div className="mt-2.5">
              {a.title && (
                <p className={cn("text-sm font-bold tracking-tight", isSystem ? "text-indigo-900" : HS_TEXT)}>
                  {a.title}
                </p>
              )}
              {a.contentSnippet && (
                <p className={cn("text-[12.5px] mt-1 line-clamp-4 leading-relaxed", HS_MUTED)}>
                  {a.contentSnippet}
                </p>
              )}
              {isAudit && a.changesSummary && a.changesSummary !== a.contentSnippet ? (
                <p className={cn("text-[11px] mt-2 font-mono line-clamp-2 text-[var(--text-muted)] bg-[var(--surface-dim)] rounded px-2 py-1", HS_MUTED)}>
                  {a.changesSummary}
                </p>
              ) : null}
            </div>
            
            <div className="flex flex-wrap items-center justify-between mt-3.5 gap-2 pt-3 border-t border-[var(--surface-dim)]">
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-full bg-[var(--border-color)] flex items-center justify-center text-xs font-bold text-white uppercase text-center shrink-0">
                    {(a.authorName || "S").charAt(0)}
                  </div>
                  <span className={cn("text-sm font-medium", HS_MUTED)}>{a.authorName || "System"}</span>
                </div>
                {a.recordLabel ? (
                  <span className={cn("text-xs pl-7", HS_MUTED)}>
                    Record: <span className="font-semibold text-[var(--text-main)]">{a.recordLabel}</span>
                    {a.relatedType ? ` · ${a.relatedType}` : ""}
                  </span>
                ) : a.relatedType ? (
                  <span className={cn("text-xs pl-7", HS_MUTED)}>{a.relatedType}</span>
                ) : null}
              </div>
              {href ? (
                <NextLink 
                  href={href} 
                  className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--hs-link)] hover:text-[#007a8c] hover:underline transition-colors shrink-0"
                >
                  {isAudit ? "View record" : "Open record"}
                  <ChevronRight className="h-3 w-3" />
                </NextLink>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ShortcutRow({
  href,
  icon,
  label,
}: {
  href: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <NextLink
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-2.5 text-sm font-semibold transition-colors",
        HS_TEXT,
        "hover:bg-[var(--background)]",
      )}
    >
      <span className="text-[var(--text-muted)]">{icon}</span>
      {label}
    </NextLink>
  );
}
