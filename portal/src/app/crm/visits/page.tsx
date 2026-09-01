"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, ClipboardList, MapPin, X } from "lucide-react";
import { toast } from "sonner";
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

      {!configured && !loading ? <div className="mb-3"><VisitConfigBanner /></div> : null}

      <div className="mb-3 overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white shadow-[var(--crm-shadow-card)]">
        <SectionTabs
          value={tab}
          onChange={changeTab}
          items={[
            { value: "visits", label: "Field visits", count: visitStats?.total },
            { value: "requests", label: "Visit requests", count: requestStats?.total },
          ]}
          trailing={
            <CrmSearchInput
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={tab === "visits" ? "Search property or agent…" : "Search requests…"}
              className="h-8"
              wrapperClassName="relative w-full min-w-0 max-w-full"
            />
          }
        />
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <CrmSelect
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-8 w-[160px]"
          >
            <option value="">All categories</option>
            {VISIT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {formatVisitCategory(c)}
              </option>
            ))}
          </CrmSelect>
          {tab === "visits" ? (
            <>
              <CrmSelect
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value as DatePreset)}
                className="h-8 w-[150px]"
              >
                <option value="">All dates</option>
                <option value="today">Today</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
              </CrmSelect>
              <CrmSelect
                value={reportFilter}
                onChange={(e) => setReportFilter(e.target.value as ReportFilter)}
                className="h-8 w-[150px]"
              >
                <option value="">All reports</option>
                <option value="yes">Has report</option>
                <option value="no">No report</option>
              </CrmSelect>
            </>
          ) : null}
          {filtersActive ? (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-md)] px-2 text-[12px] font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)]"
            >
              <X size={12} /> Reset
            </button>
          ) : null}
        </div>
      </div>

      {tab === "visits" && visitPills.length ? (
        <div className="mb-3">
          <VisitStatPills
            items={visitPills}
            activeKey={status || "all"}
            onSelect={(key) => setStatusFilter(key === "all" ? "" : key)}
          />
        </div>
      ) : null}

      {tab === "requests" && requestPills.length ? (
        <div className="mb-3">
          <VisitStatPills
            items={requestPills}
            activeKey={status || "all"}
            onSelect={(key) => setStatusFilter(key === "all" ? "" : key)}
          />
        </div>
      ) : null}

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
