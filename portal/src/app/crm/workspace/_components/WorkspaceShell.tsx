"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getCrmAuthToken } from "@/lib/crm/api";
import { CRM_API_URL } from "@/lib/crm/config";
import {
  crmCacheKeys,
  crmCachePeek,
  crmCacheSet,
  crmCacheShouldRevalidate,
  defaultWorkspaceOwner,
} from "@/lib/crm/shared/prefetch-cache";
import { usePermissions } from "@/hooks/usePermissions";
import { canViewCrmRevenue } from "@/lib/suite/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CrmEmptyState } from "@/components/crm/ui/CrmEmptyState";
import { CrmPageHeader, CrmHeaderTools } from "@/components/crm/ui";
import { CrmIcon } from "@/lib/crm/shared/icons";
import { workspaceSectionTitle } from "@/lib/crm/shared/dashboard-routes";
import { CRM_BTN_ICON } from "@/lib/crm/ui";
import {
  type WorkspaceWindowFilter,
  type WorkspacePayload,
  type LeadFollowUpStats,
  type DealsPipelineOption,
  type WorkspaceSection,
  canViewAllCrmWorkspaces,
  greetingForHour,
  Dropdown,
  HS_BORDER,
  HS_TEXT,
  HS_MUTED,
  HS_PANEL,
  INITIAL_WORKSPACE_ITEMS,
  TAB_SECTIONS,
  mergeWorkspacePayload,
  summaryInitialSections,
} from "./workspace-ui";
import {
  COMPARE_MODE_OPTIONS,
  resolveCompareParam,
  type CompareMode,
} from "@/portals/crm/lib/reports/period-compare";

export type WorkspaceShellContext = {
  ws: WorkspacePayload | null;
  loading: boolean;
  error: string | null;
  isTabLoading: boolean;
  metrics: {
    pipelineValue: number;
    openDeals: number;
    attentionTotal: number;
    overdueTasks: number;
    repliesReceived: number;
  };
  owner: string;
  setOwner: Dispatch<SetStateAction<string>>;
  windowFilter: WorkspaceWindowFilter;
  setWindowFilter: Dispatch<SetStateAction<WorkspaceWindowFilter>>;
  compareMode: CompareMode;
  setCompareMode: Dispatch<SetStateAction<CompareMode>>;
  compare: string | undefined;
  compareStart: string;
  setCompareStart: Dispatch<SetStateAction<string>>;
  compareEnd: string;
  setCompareEnd: Dispatch<SetStateAction<string>>;
  intakeKind: "leads" | "deals";
  setIntakeKind: Dispatch<SetStateAction<"leads" | "deals">>;
  isSummaryLeadsLoading: boolean;
  viewAll: boolean;
  hasAccess: (permission: string) => boolean;
  router: ReturnType<typeof useRouter>;
  canSeeOwnerPicker: boolean;
  canViewRevenueForecast: boolean;
  selectedOwnerLabel: string | null;
  visibleOwners: Array<{ _id: string; firstName: string; lastName: string; email?: string }>;
  taskSearch: string;
  setTaskSearch: Dispatch<SetStateAction<string>>;
  taskFilter: "all" | "overdue" | "due_today" | "no_due_date";
  setTaskFilter: Dispatch<SetStateAction<"all" | "overdue" | "due_today" | "no_due_date">>;
  filteredTasks: WorkspacePayload["priorityTasks"];
  renderedTasks: WorkspacePayload["priorityTasks"];
  setVisibleTaskCount: Dispatch<SetStateAction<number>>;
  dealSearch: string;
  setDealSearch: Dispatch<SetStateAction<string>>;
  dealStageFilter: string;
  setDealStageFilter: Dispatch<SetStateAction<string>>;
  filteredDealsClosingSoon: NonNullable<WorkspacePayload["dealsClosingSoon"]>;
  renderedDealsClosingSoon: NonNullable<WorkspacePayload["dealsClosingSoon"]>;
  setVisibleDealCount: Dispatch<SetStateAction<number>>;
  activityTypeFilter: string;
  setActivityTypeFilter: Dispatch<SetStateAction<string>>;
  filteredActivities: WorkspacePayload["recentActivities"];
  renderedActivities: WorkspacePayload["recentActivities"];
  setVisibleActivityCount: Dispatch<SetStateAction<number>>;
  leadFollowUpView: "today" | "yesterday" | "thisWeek";
  setLeadFollowUpView: Dispatch<SetStateAction<"today" | "yesterday" | "thisWeek">>;
  selectedLeadFollowUpStats: LeadFollowUpStats | null;
  leadIntakeView: "today" | "yesterday" | "thisWeek";
  setLeadIntakeView: Dispatch<SetStateAction<"today" | "yesterday" | "thisWeek">>;
  leadIntakeStatusView: string;
  setLeadIntakeStatusView: Dispatch<SetStateAction<string>>;
  leadIntakeRows: NonNullable<NonNullable<WorkspacePayload["leadIntake"]>["thisWeek"]>;
  leadIntakeStatusTabs: Array<{ name: string; count: number }>;
  filteredLeadIntakeRows: NonNullable<NonNullable<WorkspacePayload["leadIntake"]>["thisWeek"]>;
  renderedNeverContactedLeads: WorkspacePayload["attention"]["neverContactedLeads"];
  renderedStaleLeads: WorkspacePayload["attention"]["staleLeads"];
  setVisibleNeverContactedCount: Dispatch<SetStateAction<number>>;
  setVisibleStaleLeadCount: Dispatch<SetStateAction<number>>;
  reloadWorkspace: () => void;
};

type WorkspaceShellProps = {
  /** Internal section id: summary | work_queue | … */
  section: string;
  children: (ctx: WorkspaceShellContext) => ReactNode;
};

export default function WorkspaceShell({ section, children }: WorkspaceShellProps) {
  const router = useRouter();
  const { user, isLoaded: permLoaded, hasAccess } = usePermissions();
  const viewAll = canViewAllCrmWorkspaces(user);
  const canViewRevenueForecast = canViewCrmRevenue(user);
  const sectionTitle = workspaceSectionTitle(section);
  const accessibleEmployeeIds = (user as any)?.salesWorkspaceAccessibleEmployees || [];
  const canSeeOwnerPicker = viewAll || accessibleEmployeeIds.length > 0;

  const [owner, setOwner] = useState(viewAll ? "All" : (user?._id || "All"));
  const [windowFilter, setWindowFilter] =
    useState<WorkspaceWindowFilter>("last_30_days");
  const [compareMode, setCompareMode] = useState<CompareMode>("previous");
  const [compareStart, setCompareStart] = useState("");
  const [compareEnd, setCompareEnd] = useState("");
  const compare = resolveCompareParam(compareMode, compareStart, compareEnd);
  const [owners, setOwners] = useState<
    Array<{ _id: string; firstName: string; lastName: string; email?: string }>
  >([]);
  const [dealPipelines, setDealPipelines] = useState<DealsPipelineOption[]>([]);
  const [selectedAnalyticsPipeline, setSelectedAnalyticsPipeline] = useState("all");
  const [ws, setWs] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedSections, setLoadedSections] = useState<Set<WorkspaceSection>>(
    () => new Set(),
  );
  const [sectionLoading, setSectionLoading] = useState<Set<WorkspaceSection>>(
    () => new Set(),
  );
  const [error, setError] = useState<string | null>(null);
  const mainTab = section;
  const mainTabRef = useRef(mainTab);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [intakeKind, setIntakeKind] = useState<"leads" | "deals">("leads");

  useEffect(() => {
    mainTabRef.current = mainTab;
  }, [mainTab]);

  // Section comes from the route; invalid revenue access is handled by the page redirect.
  const [taskSearch, setTaskSearch] = useState("");
  const [taskFilter, setTaskFilter] = useState<"all" | "overdue" | "due_today" | "no_due_date">("all");
  const [leadFollowUpView, setLeadFollowUpView] = useState<"today" | "yesterday" | "thisWeek">("thisWeek");
  const [leadIntakeView, setLeadIntakeView] = useState<"today" | "yesterday" | "thisWeek">("thisWeek");
  const [leadIntakeStatusView, setLeadIntakeStatusView] = useState<string>("all");
  const [dealSearch, setDealSearch] = useState("");
  const [dealStageFilter, setDealStageFilter] = useState("all");
  const [activityTypeFilter, setActivityTypeFilter] = useState("all");
  const [visibleTaskCount, setVisibleTaskCount] = useState(INITIAL_WORKSPACE_ITEMS);
  const [visibleDealCount, setVisibleDealCount] = useState(INITIAL_WORKSPACE_ITEMS);
  const [visibleActivityCount, setVisibleActivityCount] = useState(INITIAL_WORKSPACE_ITEMS);
  const [visibleNeverContactedCount, setVisibleNeverContactedCount] = useState(INITIAL_WORKSPACE_ITEMS);
  const [visibleStaleLeadCount, setVisibleStaleLeadCount] = useState(INITIAL_WORKSPACE_ITEMS);

  const firstName =
    String(user?.firstName || "").trim() ||
    String(user?.name || "").split(/\s+/)[0] ||
    "there";

  const headerDate = useMemo(() => {
    return new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  useEffect(() => {
    if (!permLoaded || !canSeeOwnerPicker) return;
    const token = getCrmAuthToken();
    fetch(`${CRM_API_URL}/crm-users/list/crm-portal`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setOwners(data);
      })
      .catch(() => { });
  }, [permLoaded, canSeeOwnerPicker]);

  useEffect(() => {
    if (!permLoaded) return;
    const cached = crmCachePeek<DealsPipelineOption[]>(crmCacheKeys.pipelines("deals"));
    if (cached) setDealPipelines(cached.data);
    const token = getCrmAuthToken();
    const shouldFetch = !cached || crmCacheShouldRevalidate(cached.ageMs);
    if (!shouldFetch) return;
    fetch(`${CRM_API_URL}/crm/pipelines?type=deals`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setDealPipelines(data);
          crmCacheSet(crmCacheKeys.pipelines("deals"), data);
        }
      })
      .catch(() => {
        if (!cached) setDealPipelines([]);
      });
  }, [permLoaded]);

  const loadWorkspace = useCallback(
    async (
      sections: WorkspaceSection[],
      options?: { merge?: boolean; background?: boolean },
    ) => {
      if (!sections.length) return;
      const uniqueSections = [...new Set(sections)];
      setSectionLoading((prev) => new Set([...prev, ...uniqueSections]));
      let ownerKey = defaultWorkspaceOwner(user);
      if (canSeeOwnerPicker && owner) {
        if (owner !== "All" || (!viewAll && accessibleEmployeeIds.length > 0)) {
          ownerKey = owner;
        }
      }
      const cacheKey = crmCacheKeys.workspace(
        ownerKey,
        windowFilter,
        uniqueSections.join(","),
      );
      const cached = crmCachePeek<Partial<WorkspacePayload>>(cacheKey);
      let backgroundOnly = !!options?.background;
      if (cached && !options?.background) {
        setWs((prev) =>
          options?.merge
            ? mergeWorkspacePayload(prev, cached.data)
            : mergeWorkspacePayload(null, cached.data),
        );
        setLoadedSections((prev) => new Set([...prev, ...uniqueSections]));
        setLastUpdatedAt(new Date(Date.now() - cached.ageMs));
        if (!crmCacheShouldRevalidate(cached.ageMs)) {
          setSectionLoading((prev) => {
            const next = new Set(prev);
            uniqueSections.forEach((s) => next.delete(s));
            return next;
          });
          setLoading(false);
          return;
        }
        backgroundOnly = true;
      }
      if (!backgroundOnly) {
        setLoading(true);
      }
      setError(null);
      const token = getCrmAuthToken();
      const q = new URLSearchParams();
      if (canSeeOwnerPicker) {
        if (owner) {
          if (owner !== "All" || (!viewAll && accessibleEmployeeIds.length > 0)) {
            q.set("owner", owner);
          }
        }
      }
      q.set("window", windowFilter);
      q.set("sections", uniqueSections.join(","));
      try {
        const res = await fetch(`${CRM_API_URL}/crm/workspace?${q}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const text = await res.text();
        if (res.status === 401) {
          setWs(null);
          setLoadedSections(new Set());
          setError("Session expired. Sign in again.");
          router.push("/auth/login?error=unauthorized");
          return;
        }
        if (!res.ok) {
          let detail = `${res.status} ${res.statusText}`;
          try {
            const j = text ? JSON.parse(text) : {};
            if (j?.message) detail = String(j.message);
          } catch {
            if (text?.trim()) detail = text.slice(0, 200);
          }
          throw new Error(detail);
        }
        const json = (text ? JSON.parse(text) : null) as Partial<WorkspacePayload>;
        if (!json || typeof json !== "object") {
          throw new Error("Invalid workspace response");
        }
        if (json.leadsAddedByDay && !Array.isArray(json.leadsAddedByDay)) {
          json.leadsAddedByDay = [];
        }
        if (json.dealsAddedByDay && !Array.isArray(json.dealsAddedByDay)) {
          json.dealsAddedByDay = [];
        }
        setWs((prev) =>
          options?.merge ? mergeWorkspacePayload(prev, json) : mergeWorkspacePayload(null, json),
        );
        setLoadedSections((prev) => new Set([...prev, ...uniqueSections]));
        setLastUpdatedAt(new Date());
        crmCacheSet(cacheKey, json);
      } catch (e) {
        if (!options?.merge) {
          setWs(null);
          setLoadedSections(new Set());
        }
        const msg =
          e instanceof Error ? e.message : "Could not load workspace.";
        setError(
          msg === "Failed to fetch"
            ? "Could not reach the API. Check your connection and CRM_API URL."
            : `Could not load workspace. ${msg}`,
        );
      } finally {
        setSectionLoading((prev) => {
          const next = new Set(prev);
          uniqueSections.forEach((s) => next.delete(s));
          return next;
        });
        if (!backgroundOnly) {
          setLoading(false);
        }
      }
    },
    [
      canSeeOwnerPicker,
      owner,
      windowFilter,
      router,
      viewAll,
      accessibleEmployeeIds.length,
      user,
    ],
  );

  const reloadWorkspace = useCallback(() => {
    const forTab = TAB_SECTIONS[mainTab] ?? [];
    const sections =
      forTab.length > 0 ? [...new Set(forTab)] : [...loadedSections];
    if (!sections.length) {
      void loadWorkspace(summaryInitialSections(), { merge: false });
      return;
    }
    void loadWorkspace(sections, { merge: true });
  }, [mainTab, loadedSections, loadWorkspace]);

  useEffect(() => {
    if (!permLoaded) return;
    setWs(null);
    setLoadedSections(new Set());
    const tabSections = TAB_SECTIONS[mainTabRef.current] ?? [];
    const initial = [
      ...new Set([...summaryInitialSections(), ...tabSections, "attention"]),
    ] as WorkspaceSection[];
    let cancelled = false;
    const run = async () => {
      await loadWorkspace(initial, { merge: false });
      if (cancelled) return;
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [permLoaded, owner, windowFilter, loadWorkspace, hasAccess]);

  useEffect(() => {
    if (!permLoaded) return;
    const needed = TAB_SECTIONS[mainTab] ?? [];
    const missing = needed.filter((s) => !loadedSections.has(s));
    if (missing.length) {
      void loadWorkspace(missing, { merge: true, background: true });
    }
  }, [mainTab, permLoaded, loadedSections, loadWorkspace]);

  const isTabLoading = useMemo(() => {
    const needed = TAB_SECTIONS[mainTab] ?? [];
    if (!needed.length) return false;
    return needed.some(
      (s) => sectionLoading.has(s) || !loadedSections.has(s),
    );
  }, [mainTab, sectionLoading, loadedSections]);

  const isSummaryLeadsLoading = useMemo(() => {
    if (!hasAccess("leads:read")) return false;
    return (
      sectionLoading.has("leads") ||
      (!loadedSections.has("leads") &&
        (mainTab === "summary" || mainTab === "prospecting"))
    );
  }, [hasAccess, sectionLoading, loadedSections, mainTab]);

  const visibleOwners = useMemo(() => {
    if (viewAll) return owners;
    return owners.filter(
      (o) => o._id === user?._id || accessibleEmployeeIds.includes(o._id),
    );
  }, [owners, viewAll, user?._id, accessibleEmployeeIds]);

  const selectedOwnerLabel = useMemo(() => {
    if (owner === "All") return null;
    const o = owners.find((x) => x._id === owner);
    const name = [o?.firstName, o?.lastName].filter(Boolean).join(" ").trim();
    return name || o?.email || null;
  }, [owner, owners]);

  const metrics = useMemo(() => {
    if (!ws) {
      return {
        pipelineValue: 0,
        openDeals: 0,
        attentionTotal: 0,
        overdueTasks: 0,
        repliesReceived: 0,
      };
    }
    const pipelineValue = ws.pipelineByStage.reduce((s, x) => s + x.value, 0);
    const openDeals = ws.pipelineByStage.reduce((s, x) => s + x.count, 0);
    const a = ws.attention;
    const attentionTotal =
      (a?.neverContactedLeads?.length ?? 0) +
      (a?.staleLeads?.length ?? 0) +
      (a?.unopenedTrackedEmails?.length ?? 0) +
      (a?.openedTrackedEmails?.length ?? 0);
    const overdueTasks = ws.priorityTasks.filter((t) => t.overdue).length;
    const repliesReceived = a?.replyReceivedEmails?.length ?? 0;
    return { pipelineValue, openDeals, attentionTotal, overdueTasks, repliesReceived };
  }, [ws]);

  const leadsAddedWindowTotal = useMemo(() => {
    const rows = ws?.leadsAddedByDay;
    if (!rows?.length) return 0;
    return rows.reduce((s, d) => s + (d.total || 0), 0);
  }, [ws?.leadsAddedByDay]);

  const dealsAddedWindowTotal = useMemo(() => {
    const rows = ws?.dealsAddedByDay;
    if (!rows?.length) return 0;
    return rows.reduce((s, d) => s + (d.total || 0), 0);
  }, [ws?.dealsAddedByDay]);

  const intakeAddedWindowTotal =
    intakeKind === "deals" ? dealsAddedWindowTotal : leadsAddedWindowTotal;

  const maxStageValue = useMemo(() => {
    if (!ws?.pipelineByStage.length) return 1;
    return Math.max(...ws.pipelineByStage.map((s) => s.value), 1);
  }, [ws]);

  const stagePerformance = useMemo(() => {
    if (!ws?.pipelineByStage?.length) return [];
    const total = ws.pipelineByStage.reduce((sum, s) => sum + (s.count || 0), 0);
    return ws.pipelineByStage.map((stage, index, arr) => {
      const prev = index > 0 ? arr[index - 1] : null;
      const stageCount = stage.count || 0;
      const prevCount = prev?.count || 0;
      return {
        stage: stage.stage,
        count: stageCount,
        value: stage.value || 0,
        sharePct: total > 0 ? (stageCount / total) * 100 : 0,
        conversionFromPrevPct:
          index === 0 ? null : prevCount > 0 ? (stageCount / prevCount) * 100 : 0,
      };
    });
  }, [ws]);

  const analyticsPipelineStageSet = useMemo(() => {
    if (selectedAnalyticsPipeline === "all") return null;
    const selected = dealPipelines.find((p) => p._id === selectedAnalyticsPipeline);
    const names = (selected?.stages || []).map((s) => String(s?.name || "").trim()).filter(Boolean);
    if (!names.length) return null;
    return new Set(names);
  }, [dealPipelines, selectedAnalyticsPipeline]);

  const filteredStagePerformance = useMemo(() => {
    if (!analyticsPipelineStageSet) return stagePerformance;
    return stagePerformance.filter((row) => analyticsPipelineStageSet.has(row.stage));
  }, [stagePerformance, analyticsPipelineStageSet]);

  const tasksDueToday = useMemo(() => {
    if (!ws) return 0;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return ws.priorityTasks.filter((t) => {
      if (!t.dueDate) return false;
      const d = new Date(t.dueDate);
      return d >= start && d < end;
    }).length;
  }, [ws]);

  const filteredTasks = useMemo(() => {
    if (!ws) return [];
    const q = taskSearch.trim().toLowerCase();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return ws.priorityTasks.filter((t) => {
      const matchesQuery =
        !q ||
        t.title.toLowerCase().includes(q) ||
        String(t.status || "").toLowerCase().includes(q) ||
        String(t.relatedType || "").toLowerCase().includes(q) ||
        String(t.authorName || "").toLowerCase().includes(q);
      if (!matchesQuery) return false;
      if (taskFilter === "all") return true;
      if (taskFilter === "overdue") return t.overdue;
      if (taskFilter === "no_due_date") return !t.dueDate;
      if (taskFilter === "due_today") {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate);
        return d >= start && d < end;
      }
      return true;
    });
  }, [ws, taskSearch, taskFilter]);

  const dealStages = useMemo(() => {
    if (!ws) return [];
    return ws.pipelineByStage.map((s) => s.stage).filter(Boolean);
  }, [ws]);

  const filteredDealsClosingSoon = useMemo(() => {
    if (!ws) return [];
    const q = dealSearch.trim().toLowerCase();
    return ws.dealsClosingSoon.filter((d) => {
      const matchesQuery =
        !q ||
        d.title.toLowerCase().includes(q) ||
        d.stage.toLowerCase().includes(q) ||
        String(d.dealOwner || "").toLowerCase().includes(q);
      if (!matchesQuery) return false;
      if (dealStageFilter === "all") return true;
      return d.stage === dealStageFilter;
    });
  }, [ws, dealSearch, dealStageFilter]);

  const filteredActivities = useMemo(() => {
    if (!ws) return [];
    if (activityTypeFilter === "all") return ws.recentActivities;
    return ws.recentActivities.filter((a) => a.type === activityTypeFilter);
  }, [ws, activityTypeFilter]);

  const renderedTasks = useMemo(
    () => filteredTasks.slice(0, visibleTaskCount),
    [filteredTasks, visibleTaskCount],
  );
  const renderedDealsClosingSoon = useMemo(
    () => filteredDealsClosingSoon.slice(0, visibleDealCount),
    [filteredDealsClosingSoon, visibleDealCount],
  );
  const renderedActivities = useMemo(
    () => filteredActivities.slice(0, visibleActivityCount),
    [filteredActivities, visibleActivityCount],
  );
  const renderedNeverContactedLeads = useMemo(
    () => (ws?.attention.neverContactedLeads || []).slice(0, visibleNeverContactedCount),
    [ws?.attention.neverContactedLeads, visibleNeverContactedCount],
  );
  const renderedStaleLeads = useMemo(
    () => (ws?.attention.staleLeads || []).slice(0, visibleStaleLeadCount),
    [ws?.attention.staleLeads, visibleStaleLeadCount],
  );
  const selectedLeadFollowUpStats = useMemo<LeadFollowUpStats | null>(() => {
    if (!ws) return null;
    if (ws.leadFollowUpByWindow) {
      if (leadFollowUpView === "today") return ws.leadFollowUpByWindow.today;
      if (leadFollowUpView === "yesterday") return ws.leadFollowUpByWindow.yesterday;
      return ws.leadFollowUpByWindow.thisWeek;
    }
    return ws.leadFollowUpWeek || null;
  }, [ws, leadFollowUpView]);
  const leadIntakeRows = useMemo(() => {
    if (!ws?.leadIntake) return [];
    if (leadIntakeView === "today") return ws.leadIntake.today || [];
    if (leadIntakeView === "yesterday") return ws.leadIntake.yesterday || [];
    return ws.leadIntake.thisWeek || [];
  }, [ws?.leadIntake, leadIntakeView]);
  const leadIntakeStatusTabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of leadIntakeRows) {
      const key = String(row.status || "New").trim() || "New";
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [leadIntakeRows]);
  const filteredLeadIntakeRows = useMemo(() => {
    if (leadIntakeStatusView === "all") return leadIntakeRows;
    return leadIntakeRows.filter(
      (row) => (String(row.status || "New").trim() || "New") === leadIntakeStatusView,
    );
  }, [leadIntakeRows, leadIntakeStatusView]);

  useEffect(() => setVisibleTaskCount(INITIAL_WORKSPACE_ITEMS), [taskSearch, taskFilter, owner, windowFilter]);
  useEffect(() => setVisibleDealCount(INITIAL_WORKSPACE_ITEMS), [dealSearch, dealStageFilter, owner, windowFilter]);
  useEffect(() => setVisibleActivityCount(INITIAL_WORKSPACE_ITEMS), [activityTypeFilter, owner, windowFilter]);
  useEffect(() => setVisibleNeverContactedCount(INITIAL_WORKSPACE_ITEMS), [owner, windowFilter, ws?.attention.neverContactedLeads?.length]);
  useEffect(() => setVisibleStaleLeadCount(INITIAL_WORKSPACE_ITEMS), [owner, windowFilter, ws?.attention.staleLeads?.length]);
  useEffect(() => {
    if (leadIntakeStatusView === "all") return;
    const exists = leadIntakeStatusTabs.some((tab) => tab.name === leadIntakeStatusView);
    if (!exists) setLeadIntakeStatusView("all");
  }, [leadIntakeStatusTabs, leadIntakeStatusView]);
  useEffect(() => setLeadIntakeStatusView("all"), [leadIntakeView, owner, windowFilter]);

  const sectionDescription = (() => {
    if (mainTab === "summary") {
      return "Executive snapshot — revenue, conversion, pipeline health, and recent deals.";
    }
    if (mainTab === "deals") {
      return "Live pipeline health — open deals, win/loss, closing risk, and created trend.";
    }
    if (mainTab === "prospecting") {
      return "Live leads snapshot — new volume, stage mix, outreach gaps, and recent intake.";
    }
    if (mainTab === "revenue_summary") {
      return "Pipeline value, revenue trend, and weighted forecast.";
    }
    if (mainTab === "growth") {
      return "Growth strategy — MoM/QoQ trends, retention, channels, and target vs achievement.";
    }
    if (mainTab === "work_queue") {
      return "Work queue, follow-ups, tasks due, and deals missing a next step.";
    }
    if (mainTab === "work") {
      return "Daily workload — queues, task urgency, and what needs action today.";
    }
    if (mainTab === "lead_status") {
      return "Follow-up scheduling and new lead intake.";
    }
    if (mainTab === "follow_ups") {
      return "Upcoming and overdue automated follow-ups.";
    }
    if (mainTab === "tasks") {
      return "Priority tasks due across your pipeline.";
    }
    if (mainTab === "next_step") {
      return "Open deals missing a clear next action.";
    }
    if (mainTab === "activity") {
      return "Recent CRM activity across owners.";
    }
    if (mainTab === "calls") {
      return "Dial queue and call activity for the telecalling team.";
    }
    if (mainTab === "calendar") {
      return "Meetings and scheduled CRM events.";
    }
    if (viewAll) {
      return owner === "All"
        ? "Team summary — pipeline, queues, and tasks across all owners."
        : selectedOwnerLabel
          ? `Viewing ${selectedOwnerLabel}’s workspace.`
          : "Loading workspace for the selected rep…";
    }
    return `${greetingForHour(new Date())}, ${firstName} — ${headerDate}`;
  })();

  return (
    <div className="crm-workspace-container theme-crm-hubspot crm-list-page mx-auto w-full animate-in fade-in duration-500 pb-6">
      <CrmPageHeader
        bordered={false}
        title={sectionTitle}
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/work" },
          { label: "Dashboard", href: "/crm/workspace/work" },
          { label: sectionTitle },
        ]}
        description={sectionDescription}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex h-[38px] items-center gap-2 rounded-[5px] border border-[var(--border-color)] bg-white px-2.5 shadow-[var(--crm-shadow-input)]">
              <CrmIcon.Calendar size={16} className="text-[var(--text-muted)]" aria-hidden />
              <Dropdown
                value={windowFilter}
                onChange={(v) => setWindowFilter(v as WorkspaceWindowFilter)}
                widthClass="min-w-[140px] border-0 shadow-none bg-transparent h-[34px]"
                showCustomDateRange
                options={[
                  { value: "today", label: "Today" },
                  { value: "yesterday", label: "Yesterday" },
                  { value: "this_week", label: "This week" },
                  { value: "this_month", label: "This month" },
                  { value: "last_30_days", label: "Last 30 days" },
                ]}
              />
            </div>
            <div className="inline-flex h-[38px] items-center gap-1.5 rounded-[5px] border border-[var(--border-color)] bg-white px-2 shadow-[var(--crm-shadow-input)]">
              <span className="pl-1 text-[11px] font-medium text-[var(--text-muted)]">Compare</span>
              <Dropdown
                value={compareMode}
                onChange={(v) => setCompareMode(v as CompareMode)}
                widthClass="min-w-[150px] border-0 shadow-none bg-transparent h-[34px]"
                options={COMPARE_MODE_OPTIONS}
              />
            </div>
            {compareMode === "custom" && (
              <div className="flex h-[38px] items-center gap-1.5 rounded-[5px] border border-[var(--border-color)] bg-white px-2 shadow-[var(--crm-shadow-input)]">
                <input
                  type="date"
                  value={compareStart}
                  onChange={(e) => setCompareStart(e.target.value)}
                  className="bg-transparent text-sm text-[var(--text-main)] outline-none"
                />
                <span className="text-xs text-[var(--text-muted)]">to</span>
                <input
                  type="date"
                  value={compareEnd}
                  onChange={(e) => setCompareEnd(e.target.value)}
                  className="bg-transparent text-sm text-[var(--text-main)] outline-none"
                />
              </div>
            )}
            {canSeeOwnerPicker ? (
              <Dropdown
                value={owner}
                onChange={setOwner}
                widthClass="min-w-[180px]"
                options={[
                  ...(viewAll || (accessibleEmployeeIds.length > 0) ? [{ value: "All", label: viewAll ? "All owners" : "All authorized" }] : []),
                  ...(!viewAll && accessibleEmployeeIds.length > 0 && user?._id ? [{ value: String(user?._id), label: "My Workspace" }] : []),
                  ...visibleOwners
                    .filter((o) => !(!viewAll && accessibleEmployeeIds.length > 0 && String(o._id) === String(user?._id)))
                    .map((o) => ({
                      value: String(o._id),
                      label: [o.firstName, o.lastName].filter(Boolean).join(" ").trim() || o.email || String(o._id),
                    }))
                ]}
              />
            ) : (
              <div
                className={cn(
                  "min-w-[160px] rounded-[5px] border bg-white px-3 py-2 text-sm font-medium shadow-[var(--crm-shadow-input)]",
                  HS_BORDER,
                  HS_TEXT,
                )}
              >
                <span className={cn("mb-0.5 block text-[11px] font-medium", HS_MUTED)}>
                  Signed in as
                </span>
                {`${user?.firstName || ""} ${user?.lastName || ""}`.trim() || user?.email || "—"}
              </div>
            )}
            <NextLink
              href="/crm/tasks"
              className={CRM_BTN_ICON}
              title="Tasks"
              aria-label="Open tasks"
            >
              <CrmIcon.ListTodo size={16} aria-hidden />
            </NextLink>
            <NextLink
              href="/crm/inbox"
              className={CRM_BTN_ICON}
              title="Inbox"
              aria-label="Open inbox"
            >
              <CrmIcon.Inbox size={16} aria-hidden />
            </NextLink>
            <NextLink
              href="/crm/reports/overview"
              className={CRM_BTN_ICON}
              title="Reports"
              aria-label="Open reports"
            >
              <CrmIcon.ChartPie size={16} aria-hidden />
            </NextLink>
            <CrmHeaderTools
              canExport={false}
              canImport={false}
              onRefresh={() => void reloadWorkspace()}
            />
          </div>
        }
      />
      {lastUpdatedAt && (
        <p className="mb-3 px-3 text-xs text-[var(--text-muted)] sm:px-6">
          Last updated {lastUpdatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}

        <div className="w-full">

          <div className="px-3 sm:px-6 py-4 sm:py-6 bg-[var(--background)]">
            {error && (
              <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-200">
                {error}
              </div>
            )}

            {loading && mainTab === "summary" && !ws && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-3 animate-pulse">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className={cn("h-20", HS_PANEL, "bg-[var(--surface-dim)]")} />
                ))}
              </div>
            )}

            {!viewAll &&
            !loading &&
            (user?.crmPermissions || []).length === 0 &&
            mainTab !== "activity" &&
            mainTab !== "calendar" ? (
              <CrmEmptyState
                title="Assignment required for CRM access"
                description="You have tool access enabled, but no CRM module permissions are assigned yet. Ask an admin to enable Leads, Deals, or other Sales modules."
                icon={<ShieldCheck className="h-7 w-7 text-[var(--hs-link)]" strokeWidth={1.5} />}
                action={
                  <Button
                    onClick={() => router.push("/hrms/announcements")}
                    variant="outline"
                    className="border-[var(--hs-link)] text-[var(--hs-link)] hover:bg-[var(--hs-link)] hover:text-white"
                  >
                    Return to Dashboard
                  </Button>
                }
              />
            ) : (
              children({
              ws,
              loading,
              error,
              isTabLoading,
              metrics,
              owner,
              setOwner,
              windowFilter,
              setWindowFilter,
              compareMode,
              setCompareMode,
              compare,
              compareStart,
              setCompareStart,
              compareEnd,
              setCompareEnd,
              intakeKind,
              setIntakeKind,
              isSummaryLeadsLoading,
              viewAll,
              hasAccess,
              router,
              canSeeOwnerPicker,
              canViewRevenueForecast,
              selectedOwnerLabel,
              visibleOwners,
              taskSearch,
              setTaskSearch,
              taskFilter,
              setTaskFilter,
              filteredTasks,
              renderedTasks,
              setVisibleTaskCount,
              dealSearch,
              setDealSearch,
              dealStageFilter,
              setDealStageFilter,
              filteredDealsClosingSoon,
              renderedDealsClosingSoon,
              setVisibleDealCount,
              activityTypeFilter,
              setActivityTypeFilter,
              filteredActivities,
              renderedActivities,
              setVisibleActivityCount,
              leadFollowUpView,
              setLeadFollowUpView,
              selectedLeadFollowUpStats,
              leadIntakeView,
              setLeadIntakeView,
              leadIntakeStatusView,
              setLeadIntakeStatusView,
              leadIntakeRows,
              leadIntakeStatusTabs,
              filteredLeadIntakeRows,
              renderedNeverContactedLeads,
              renderedStaleLeads,
              setVisibleNeverContactedCount,
              setVisibleStaleLeadCount,
              reloadWorkspace,
            })
            )}
          </div>
        </div>
    </div>
  );
}
