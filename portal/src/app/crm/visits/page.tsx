"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  MapPin,
  Navigation,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Pagination from "@/components/suite/shell/Pagination";
import {
  CrmCountBadge,
  CrmEmptyState,
  CrmHeaderTools,
  CrmListMutedText,
  CrmListOrgCell,
  CrmListOwnerCell,
  CrmPageHeader,
  CrmSearchInput,
  CrmSelect,
  CrmSoftBadge,
  CrmStatusBadge,
  CrmTable,
  CrmTableShell,
} from "@/components/crm/ui";
import { SectionTabs, VisitConfigBanner, VisitStatPills, VisitWhen } from "@/components/crm/visits/visit-chrome";
import {
  fetchAllFieldVisits,
  fetchAllVisitRequests,
  type FieldVisit,
  type FieldVisitStatusCounts,
  type VisitRequest,
  type VisitRequestStatusCounts,
} from "@/lib/crm/twobigha-visits-api";
import {
  VISIT_CATEGORIES,
  fieldVisitStatusTone,
  formatVisitCategory,
  formatVisitStatus,
  personInitials,
  personName,
  propertyLabel,
  visitCategoryTone,
  visitRequestStatusTone,
} from "@/lib/crm/visits/visit-ui";

type Tab = "visits" | "requests";
type DatePreset = "" | "today" | "7d" | "30d";
type ReportFilter = "" | "yes" | "no";

function parseTab(raw: string | null): Tab {
  return raw === "requests" ? "requests" : "visits";
}

function dateRange(preset: DatePreset): { startDate?: string; endDate?: string } {
  if (!preset) return {};
  const end = new Date();
  const start = new Date();
  if (preset === "today") start.setHours(0, 0, 0, 0);
  else if (preset === "7d") start.setDate(start.getDate() - 7);
  else start.setDate(start.getDate() - 30);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

export default function VisitsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full animate-pulse p-6">
          <div className="h-8 w-64 rounded bg-[var(--surface-dim)]" />
        </div>
      }
    >
      <VisitsPageContent />
    </Suspense>
  );
}

function VisitsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => parseTab(searchParams.get("tab")));
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [category, setCategory] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("");
  const [reportFilter, setReportFilter] = useState<ReportFilter>("");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [visits, setVisits] = useState<FieldVisit[]>([]);
  const [visitMeta, setVisitMeta] = useState({ total: 0 });
  const [visitStats, setVisitStats] = useState<FieldVisitStatusCounts | null>(null);

  const [requests, setRequests] = useState<VisitRequest[]>([]);
  const [requestMeta, setRequestMeta] = useState({ total: 0 });
  const [requestStats, setRequestStats] = useState<VisitRequestStatusCounts | null>(null);

  useEffect(() => {
    setTab(parseTab(searchParams.get("tab")));
  }, [searchParams]);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchTerm(searchInput.trim()), 280);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const changeTab = (next: Tab) => {
    setTab(next);
    setPage(1);
    setStatus("");
    setDatePreset("");
    setReportFilter("");
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    params.delete("status");
    router.replace(`/crm/visits?${params.toString()}`);
  };

  const resetFilters = () => {
    setStatus("");
    setCategory("");
    setDatePreset("");
    setReportFilter("");
    setSearchInput("");
    setSearchTerm("");
    setPage(1);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("status");
    router.replace(`/crm/visits?${params.toString()}`);
  };

  const setStatusFilter = (next: string) => {
    setStatus(next);
    setPage(1);
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("status", next);
    else params.delete("status");
    router.replace(`/crm/visits?${params.toString()}`);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "visits") {
        const range = dateRange(datePreset);
        const result = await fetchAllFieldVisits({
          page,
          limit: pageSize,
          status: status || undefined,
          visitCategory: category || undefined,
          startDate: range.startDate,
          endDate: range.endDate,
        });
        setConfigured(result.configured);
        setVisits(result.data?.rows || []);
        setVisitMeta({ total: result.data?.meta?.total ?? result.data?.rows?.length ?? 0 });
        if (!status && !category && !datePreset && result.data?.stats) setVisitStats(result.data.stats);
      } else {
        const result = await fetchAllVisitRequests({
          page,
          limit: pageSize,
          status: status || undefined,
          purpose: category || undefined,
          searchTerm: searchTerm || undefined,
        });
        setConfigured(result.configured);
        setRequests(result.data?.rows || []);
        setRequestMeta({ total: result.data?.meta?.total ?? result.data?.rows?.length ?? 0 });
        if (!status && !searchTerm && !category && result.data?.stats) setRequestStats(result.data.stats);
      }
    } catch {
      toast.error(tab === "visits" ? "Failed to load field visits" : "Failed to load visit requests");
    } finally {
      setLoading(false);
    }
  }, [tab, page, pageSize, status, category, searchTerm, datePreset]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void fetchAllFieldVisits({ page: 1, limit: 1 })
      .then((result) => {
        if (result.data?.stats) setVisitStats(result.data.stats);
      })
      .catch(() => {});
    void fetchAllVisitRequests({ page: 1, limit: 1 })
      .then((result) => {
        if (result.data?.stats) setRequestStats(result.data.stats);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
  }, [tab, status, category, searchTerm, datePreset, reportFilter]);

  const visibleVisits = useMemo(() => {
    let rows = visits;
    if (searchTerm && tab === "visits") {
      const q = searchTerm.toLowerCase();
      rows = rows.filter((row) => {
        const hay = [
          propertyLabel(row.property),
          personName(row.agentAssigned),
          personName(row.owner),
          row.property?.city,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    if (reportFilter === "yes") rows = rows.filter((row) => Boolean(row.report?.status));
    if (reportFilter === "no") rows = rows.filter((row) => !row.report?.status);
    return rows;
  }, [visits, searchTerm, tab, reportFilter]);

  const total = tab === "visits" ? visitMeta.total : requestMeta.total;
  const filtersActive = Boolean(status || category || datePreset || reportFilter || searchTerm);

  const visitPills = useMemo(
    () =>
      visitStats
        ? [
            { key: "all", label: "Total", value: visitStats.total },
            { key: "SCHEDULED", label: "Scheduled", value: visitStats.scheduled },
            { key: "AGENT_ON_WAY", label: "On the way", value: visitStats.agentOnWay },
            { key: "IN_PROGRESS", label: "In progress", value: visitStats.inProgress },
            { key: "COMPLETED", label: "Completed", value: visitStats.completed },
            { key: "MISSED", label: "Missed", value: visitStats.missed },
            { key: "CANCELLED", label: "Cancelled", value: visitStats.cancelled },
          ]
        : [],
    [visitStats],
  );

  const requestPills = useMemo(
    () =>
      requestStats
        ? [
            { key: "all", label: "Total", value: requestStats.total },
            { key: "PENDING", label: "Pending", value: requestStats.pending },
            { key: "APPROVED", label: "Approved", value: requestStats.approved },
            { key: "SCHEDULED", label: "Scheduled", value: requestStats.scheduled },
            { key: "REJECTED", label: "Rejected", value: requestStats.rejected },
            { key: "CLOSED", label: "Closed", value: requestStats.closed },
          ]
        : [],
    [requestStats],
  );

  return (
    <div className="theme-crm-hubspot crm-list-page mx-auto w-full animate-in fade-in duration-500 pb-10">
      <CrmPageHeader
        bordered={false}
        title="Visit tracking"
        icon={<MapPin size={18} />}
        badge={<CrmCountBadge>{total}</CrmCountBadge>}
        description="Answer a customer call: who went out, what’s scheduled, and whether a report is in."
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Property Listings", href: "/crm/property-listings?bucket=pm" },
          { label: "Visit tracking" },
        ]}
        actions={<CrmHeaderTools onRefresh={() => void load()} canExport={false} canImport={false} />}
        className="mb-3"
      />

      {!configured && !loading ? <div className="mb-4"><VisitConfigBanner /></div> : null}

      {/* Modern Interactive KPI Metric Cards (Matching Property Listings styling) */}
      {tab === "visits" ? (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {/* Card 1: Total */}
          <button
            type="button"
            onClick={() => setStatusFilter("")}
            className={cn(
              "text-left transition-all duration-200 rounded-2xl border p-3.5 shadow-sm hover:shadow-md cursor-pointer",
              !status
                ? "border-emerald-500 bg-white ring-2 ring-emerald-500/20 dark:bg-slate-900"
                : "border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Visits</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <MapPin size={15} />
              </div>
            </div>
            <p className="mt-1.5 text-2xl font-extrabold text-slate-900 dark:text-white">
              {visitStats?.total ?? total}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">All recorded visits</p>
          </button>

          {/* Card 2: Scheduled & En Route */}
          <button
            type="button"
            onClick={() => setStatusFilter("SCHEDULED")}
            className={cn(
              "text-left transition-all duration-200 rounded-2xl border p-3.5 shadow-sm hover:shadow-md cursor-pointer",
              status === "SCHEDULED" || status === "AGENT_ON_WAY"
                ? "border-sky-500 bg-sky-50/30 ring-2 ring-sky-500/20 dark:bg-sky-950/30"
                : "border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Scheduled</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                <Clock size={15} />
              </div>
            </div>
            <p className="mt-1.5 text-2xl font-extrabold text-sky-600 dark:text-sky-400">
              {(visitStats?.scheduled ?? 0) + (visitStats?.agentOnWay ?? 0)}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {visitStats?.scheduled ?? 0} booked · {visitStats?.agentOnWay ?? 0} on way
            </p>
          </button>

          {/* Card 3: In Progress (Live on site) */}
          <button
            type="button"
            onClick={() => setStatusFilter("IN_PROGRESS")}
            className={cn(
              "text-left transition-all duration-200 rounded-2xl border p-3.5 shadow-sm hover:shadow-md cursor-pointer",
              status === "IN_PROGRESS"
                ? "border-amber-500 bg-amber-50/30 ring-2 ring-amber-500/20 dark:bg-amber-950/30"
                : "border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">In Progress</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                <Activity size={15} />
              </div>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">
                {visitStats?.inProgress ?? 0}
              </p>
              {(visitStats?.inProgress ?? 0) > 0 && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">Agents active on site</p>
          </button>

          {/* Card 4: Completed */}
          <button
            type="button"
            onClick={() => setStatusFilter("COMPLETED")}
            className={cn(
              "text-left transition-all duration-200 rounded-2xl border p-3.5 shadow-sm hover:shadow-md cursor-pointer",
              status === "COMPLETED"
                ? "border-emerald-500 bg-emerald-50/30 ring-2 ring-emerald-500/20 dark:bg-emerald-950/30"
                : "border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Completed</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                <CheckCircle2 size={15} />
              </div>
            </div>
            <p className="mt-1.5 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {visitStats?.completed ?? 0}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">Finished site inspections</p>
          </button>

          {/* Card 5: Missed / Cancelled */}
          <button
            type="button"
            onClick={() => setStatusFilter("MISSED")}
            className={cn(
              "text-left transition-all duration-200 rounded-2xl border p-3.5 shadow-sm hover:shadow-md cursor-pointer",
              status === "MISSED" || status === "CANCELLED"
                ? "border-rose-500 bg-rose-50/30 ring-2 ring-rose-500/20 dark:bg-rose-950/30"
                : "border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Exceptions</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                <AlertCircle size={15} />
              </div>
            </div>
            <p className="mt-1.5 text-2xl font-extrabold text-rose-600 dark:text-rose-400">
              {(visitStats?.missed ?? 0) + (visitStats?.cancelled ?? 0)}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {visitStats?.missed ?? 0} missed · {visitStats?.cancelled ?? 0} cancelled
            </p>
          </button>
        </div>
      ) : (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {/* Requests Card 1: Total */}
          <button
            type="button"
            onClick={() => setStatusFilter("")}
            className={cn(
              "text-left transition-all duration-200 rounded-2xl border p-3.5 shadow-sm hover:shadow-md cursor-pointer",
              !status
                ? "border-emerald-500 bg-white ring-2 ring-emerald-500/20 dark:bg-slate-900"
                : "border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">All Requests</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <ClipboardList size={15} />
              </div>
            </div>
            <p className="mt-1.5 text-2xl font-extrabold text-slate-900 dark:text-white">
              {requestStats?.total ?? total}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">Total customer requests</p>
          </button>

          {/* Requests Card 2: Pending */}
          <button
            type="button"
            onClick={() => setStatusFilter("PENDING")}
            className={cn(
              "text-left transition-all duration-200 rounded-2xl border p-3.5 shadow-sm hover:shadow-md cursor-pointer",
              status === "PENDING"
                ? "border-amber-500 bg-amber-50/30 ring-2 ring-amber-500/20 dark:bg-amber-950/30"
                : "border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Pending Review</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                <Clock size={15} />
              </div>
            </div>
            <p className="mt-1.5 text-2xl font-extrabold text-amber-600 dark:text-amber-400">
              {requestStats?.pending ?? 0}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">Awaiting RM assignment</p>
          </button>

          {/* Requests Card 3: Approved */}
          <button
            type="button"
            onClick={() => setStatusFilter("APPROVED")}
            className={cn(
              "text-left transition-all duration-200 rounded-2xl border p-3.5 shadow-sm hover:shadow-md cursor-pointer",
              status === "APPROVED"
                ? "border-emerald-500 bg-emerald-50/30 ring-2 ring-emerald-500/20 dark:bg-emerald-950/30"
                : "border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Approved</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                <CheckCircle2 size={15} />
              </div>
            </div>
            <p className="mt-1.5 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {requestStats?.approved ?? 0}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">Approved for dispatch</p>
          </button>

          {/* Requests Card 4: Scheduled */}
          <button
            type="button"
            onClick={() => setStatusFilter("SCHEDULED")}
            className={cn(
              "text-left transition-all duration-200 rounded-2xl border p-3.5 shadow-sm hover:shadow-md cursor-pointer",
              status === "SCHEDULED"
                ? "border-sky-500 bg-sky-50/30 ring-2 ring-sky-500/20 dark:bg-sky-950/30"
                : "border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Scheduled</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                <Calendar size={15} />
              </div>
            </div>
            <p className="mt-1.5 text-2xl font-extrabold text-sky-600 dark:text-sky-400">
              {requestStats?.scheduled ?? 0}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">Field visit booked</p>
          </button>

          {/* Requests Card 5: Closed & Rejected */}
          <button
            type="button"
            onClick={() => setStatusFilter("REJECTED")}
            className={cn(
              "text-left transition-all duration-200 rounded-2xl border p-3.5 shadow-sm hover:shadow-md cursor-pointer",
              status === "REJECTED" || status === "CLOSED"
                ? "border-rose-500 bg-rose-50/30 ring-2 ring-rose-500/20 dark:bg-rose-950/30"
                : "border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Closed</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                <XCircle size={15} />
              </div>
            </div>
            <p className="mt-1.5 text-2xl font-extrabold text-rose-600 dark:text-rose-400">
              {(requestStats?.rejected ?? 0) + (requestStats?.closed ?? 0)}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {requestStats?.rejected ?? 0} rejected · {requestStats?.closed ?? 0} closed
            </p>
          </button>
        </div>
      )}

      {/* Tabs & Filter Toolbar Strip */}
      <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <SectionTabs
          value={tab}
          onChange={changeTab}
          items={[
            { value: "visits", label: "Field Visits", count: visitStats?.total },
            { value: "requests", label: "Visit Requests", count: requestStats?.total },
          ]}
          trailing={
            <div className="relative w-full min-w-0 max-w-full">
              <CrmSearchInput
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={tab === "visits" ? "Search property, agent, city…" : "Search requests, owners…"}
                className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/50 text-xs focus:bg-white dark:border-slate-800 dark:bg-slate-900"
                wrapperClassName="w-full"
              />
            </div>
          }
        />

        {/* Filter Controls Row */}
        <div className="flex flex-wrap items-center gap-2.5 p-3 border-t border-slate-100 bg-slate-50/30 dark:border-slate-800/60 dark:bg-slate-900/40">
          {/* Status Filter */}
          <select
            value={status}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <option value="">All Statuses</option>
            {tab === "visits" ? (
              <>
                <option value="SCHEDULED">Scheduled</option>
                <option value="AGENT_ON_WAY">On The Way</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="MISSED">Missed</option>
                <option value="CANCELLED">Cancelled</option>
              </>
            ) : (
              <>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="REJECTED">Rejected</option>
                <option value="CLOSED">Closed</option>
              </>
            )}
          </select>

          {/* Category / Purpose Filter */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-8.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <option value="">All Categories / Purpose</option>
            {VISIT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {formatVisitCategory(c)}
              </option>
            ))}
          </select>

          {/* Date Filter (for visits) */}
          {tab === "visits" ? (
            <>
              <select
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value as DatePreset)}
                className="h-8.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
              >
                <option value="">All Dates</option>
                <option value="today">Today</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
              </select>

              <select
                value={reportFilter}
                onChange={(e) => setReportFilter(e.target.value as ReportFilter)}
                className="h-8.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
              >
                <option value="">All Reports</option>
                <option value="yes">Has Report</option>
                <option value="no">No Report</option>
              </select>
            </>
          ) : null}

          {/* Active Filter Counter & Reset */}
          {filtersActive ? (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-8.5 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-rose-600 shadow-xs hover:bg-rose-50 hover:border-rose-200 transition-colors dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-rose-950/30"
            >
              <X size={13} /> Reset Filters
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <CrmTableShell>
          <CrmTable>
            <thead>
              <tr>
                <th>Property</th>
                <th>Status</th>
                <th>When</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={4}>
                    <div className="h-8 rounded-md bg-[var(--surface-dim)]" />
                  </td>
                </tr>
              ))}
            </tbody>
          </CrmTable>
        </CrmTableShell>
      ) : tab === "visits" && visibleVisits.length === 0 ? (
        <CrmEmptyState
          icon={<MapPin className="h-7 w-7" strokeWidth={1.5} />}
          title="No field visits"
          description={
            configured
              ? "Nothing matches these filters. Clear status or category to see the full list."
              : "Configure 2bigha credentials to see live visit history."
          }
        />
      ) : tab === "requests" && requests.length === 0 ? (
        <CrmEmptyState
          icon={<ClipboardList className="h-7 w-7" strokeWidth={1.5} />}
          title="No visit requests"
          description={
            configured
              ? "Nothing matches these filters. Try another status or search."
              : "Configure 2bigha credentials to see live visit requests."
          }
        />
      ) : tab === "visits" ? (
        <CrmTableShell>
          <CrmTable>
            <thead>
              <tr>
                <th className="sticky top-0 z-10 min-w-[260px]">Property</th>
                <th className="sticky top-0 z-10">Category</th>
                <th className="sticky top-0 z-10">Status</th>
                <th className="sticky top-0 z-10">Agent</th>
                <th className="sticky top-0 z-10">Scheduled</th>
                <th className="sticky top-0 z-10">Report</th>
                <th className="sticky top-0 z-10 w-8" />
              </tr>
            </thead>
            <tbody>
              {visibleVisits.map((row) => (
                <tr
                  key={row.id}
                  className="group cursor-pointer"
                  onClick={() => router.push(`/crm/visits/${row.id}`)}
                >
                  <td>
                    <CrmListOrgCell
                      name={propertyLabel(row.property)}
                      subtitle={row.property?.city || personName(row.owner)}
                      multiline
                    />
                  </td>
                  <td>
                    <CrmSoftBadge
                      label={formatVisitCategory(row.visitCategory)}
                      tone={visitCategoryTone(row.visitCategory)}
                    />
                  </td>
                  <td>
                    <CrmStatusBadge tone={fieldVisitStatusTone(row.status)}>
                      {formatVisitStatus(row.status)}
                    </CrmStatusBadge>
                  </td>
                  <td>
                    {(() => {
                      const agent = personName(row.agentAssigned);
                      return (
                        <CrmListOwnerCell
                          name={agent === "—" ? "" : agent}
                          initials={personInitials(row.agentAssigned)}
                          multiline
                        />
                      );
                    })()}
                  </td>
                  <td>
                    <VisitWhen value={row.scheduledAt} />
                  </td>
                  <td>
                    {row.report?.status ? (
                      <Link
                        href={`/crm/visits/reports/${row.report.reportId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[13px] font-semibold text-[var(--primary)] hover:underline"
                      >
                        {formatVisitStatus(row.report.status)}
                      </Link>
                    ) : (
                      <CrmListMutedText>No report</CrmListMutedText>
                    )}
                  </td>
                  <td>
                    <ChevronRight size={16} className="text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
                  </td>
                </tr>
              ))}
            </tbody>
          </CrmTable>
        </CrmTableShell>
      ) : (
        <CrmTableShell>
          <CrmTable>
            <thead>
              <tr>
                <th className="sticky top-0 z-10 min-w-[260px]">Property</th>
                <th className="sticky top-0 z-10">Category</th>
                <th className="sticky top-0 z-10">Status</th>
                <th className="sticky top-0 z-10">Preferred</th>
                <th className="sticky top-0 z-10">Owner</th>
                <th className="sticky top-0 z-10">Created</th>
                <th className="sticky top-0 z-10 w-8" />
              </tr>
            </thead>
            <tbody>
              {requests.map((row) => (
                <tr
                  key={row.id}
                  className="group cursor-pointer"
                  onClick={() => router.push(`/crm/visits/requests/${row.id}`)}
                >
                  <td>
                    <CrmListOrgCell
                      name={propertyLabel(row.property)}
                      subtitle={row.property?.city || row.property?.state}
                      multiline
                    />
                  </td>
                  <td>
                    <CrmSoftBadge
                      label={formatVisitCategory(row.visitCategory)}
                      tone={visitCategoryTone(row.visitCategory)}
                    />
                  </td>
                  <td>
                    <CrmStatusBadge tone={visitRequestStatusTone(row.visitRequestStatus)}>
                      {formatVisitStatus(row.visitRequestStatus)}
                    </CrmStatusBadge>
                  </td>
                  <td>
                    <VisitWhen value={row.preferredDate} />
                    {row.preferredTimeSlot ? (
                      <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">{row.preferredTimeSlot}</span>
                    ) : null}
                  </td>
                  <td>
                    {(() => {
                      const owner = personName(row.owner);
                      return (
                        <CrmListOwnerCell
                          name={owner === "—" ? "" : owner}
                          initials={personInitials(row.owner)}
                          multiline
                        />
                      );
                    })()}
                  </td>
                  <td>
                    <VisitWhen value={row.createdAt} />
                  </td>
                  <td>
                    <ChevronRight size={16} className="text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
                  </td>
                </tr>
              ))}
            </tbody>
          </CrmTable>
        </CrmTableShell>
      )}

      <Pagination
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        className="mt-3 rounded-[var(--crm-radius-ui)] border-t-0"
      />
    </div>
  );
}
