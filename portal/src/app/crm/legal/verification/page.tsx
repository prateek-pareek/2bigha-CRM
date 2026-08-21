"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Gavel, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  CrmCountBadge,
  CrmPageHeader,
  CrmSoftBadge,
  CrmStatusBadge,
  CrmTable,
  CrmTableShell,
} from "@/components/crm/ui";
import { CRM_LIST_PAGE, CRM_TOOLBAR_SELECT } from "@/lib/crm/ui";
import {
  PM_LEGAL_POOL,
  fetchLegalVerificationQueue,
} from "@/lib/crm/property-listings/third-party-api";
import {
  formatAddress,
  formatListingArea,
  legalStatusBadgeTone,
  type PropertyLegalStatus,
  type PropertyListingRecord,
} from "@/lib/crm/property-listings/types";
import { cn } from "@/lib/utils";

const STATUS_FILTERS: { key: "queued" | PropertyLegalStatus; label: string }[] = [
  { key: "queued", label: "All queue" },
  { key: "Pending", label: "Pending" },
  { key: "Verified", label: "Verified" },
  { key: "Rejected", label: "Rejected" },
];

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function LegalVerificationDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full animate-pulse p-6">
          <div className="h-8 w-64 rounded bg-[var(--surface-dim)]" />
        </div>
      }
    >
      <LegalVerificationDashboardContent />
    </Suspense>
  );
}

function LegalVerificationDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusParam = (searchParams.get("status") || "queued") as
    | "queued"
    | PropertyLegalStatus;
  const sortParam = (searchParams.get("sort") || "requestedAt_desc") as
    | "requestedAt_desc"
    | "requestedAt_asc";
  const rangeParam = searchParams.get("range") || "all";
  const assigneeParam = searchParams.get("assignee") || "all";

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PropertyListingRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");

  const legalRequestedAfter = useMemo(() => {
    if (rangeParam === "7d") return daysAgoIso(7);
    if (rangeParam === "30d") return daysAgoIso(30);
    return undefined;
  }, [rangeParam]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchLegalVerificationQueue({
        page: 1,
        pageSize: 50,
        search: search.trim() || undefined,
        legalStatus: statusParam,
        legalSort: sortParam,
        legalRequestedAfter,
        legalAssignee: assigneeParam === "all" ? undefined : assigneeParam,
      });
      setRows(res.data || []);
      setTotal(res.total || 0);
    } catch {
      toast.error("Failed to load legal verification queue");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, statusParam, sortParam, legalRequestedAfter, assigneeParam]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchQuery = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "" || v === "all" || (k === "status" && v === "queued")) {
        q.delete(k);
      } else {
        q.set(k, v);
      }
    }
    const qs = q.toString();
    router.push(qs ? `/crm/legal/verification?${qs}` : "/crm/legal/verification");
  };

  return (
    <div className={cn(CRM_LIST_PAGE, "theme-crm-hubspot animate-in fade-in duration-500")}>
      <CrmPageHeader
        icon={<Gavel size={18} />}
        title="Legal Verification"
        badge={<CrmCountBadge>{total}</CrmCountBadge>}
        description="Subscription-bundled property legal reviews — Pending, Verified, or Rejected."
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Legal Verification" },
        ]}
        className="mb-4"
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => {
          const active = statusParam === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => patchQuery({ status: f.key })}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                active
                  ? "border-sky-300 bg-sky-50 text-sky-800"
                  : "border-[var(--border-color)] bg-white text-[var(--text-muted)] hover:bg-[var(--surface-dim)]",
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          className={cn(CRM_TOOLBAR_SELECT, "h-9")}
          value={sortParam}
          onChange={(e) => patchQuery({ sort: e.target.value })}
          aria-label="Sort by submitted date"
        >
          <option value="requestedAt_desc">Newest submitted</option>
          <option value="requestedAt_asc">Oldest submitted</option>
        </select>
        <select
          className={cn(CRM_TOOLBAR_SELECT, "h-9")}
          value={rangeParam}
          onChange={(e) => patchQuery({ range: e.target.value === "all" ? null : e.target.value })}
          aria-label="Date range"
        >
          <option value="all">Any time</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
        <select
          className={cn(CRM_TOOLBAR_SELECT, "h-9")}
          value={assigneeParam}
          onChange={(e) =>
            patchQuery({ assignee: e.target.value === "all" ? null : e.target.value })
          }
          aria-label="Assignee"
        >
          <option value="all">All reviewers</option>
          <option value="unassigned">Unassigned</option>
          {PM_LEGAL_POOL.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <div className="relative ml-auto min-w-[220px] flex-1 sm:max-w-xs">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            className={cn(CRM_TOOLBAR_SELECT, "h-9 w-full pl-8")}
            placeholder="Search property, city, owner…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Link
          href="/crm/legal"
          className="text-xs font-semibold text-[var(--text-muted)] underline-offset-2 hover:underline"
        >
          Legal cases →
        </Link>
      </div>

      <CrmTableShell>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--text-muted)]">
            <Loader2 size={16} className="animate-spin" /> Loading queue…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--text-muted)]">
            No legal verification requests in this filter.
          </div>
        ) : (
          <CrmTable>
            <thead>
              <tr>
                <th>Property</th>
                <th>Owner / client</th>
                <th>Submitted</th>
                <th>Assignee</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const legal = row.propertyLegal!;
                return (
                  <tr
                    key={row._id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/crm/legal/verification/${row._id}`)}
                  >
                    <td>
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--text-main)]">{row.title}</p>
                        <p className="truncate text-xs text-[var(--text-muted)]">
                          {formatAddress(row)} · {formatListingArea(row)}
                        </p>
                        <div className="mt-1">
                          <CrmSoftBadge
                            label={row.listingBucket.toUpperCase()}
                            tone="secondary"
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      <p className="text-sm font-medium text-[var(--text-main)]">
                        {row.contactName || "—"}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {row.contactPhone || row.contactEmail || "—"}
                      </p>
                    </td>
                    <td className="whitespace-nowrap text-sm text-[var(--text-muted)]">
                      {new Date(legal.requestedAt).toLocaleString()}
                    </td>
                    <td className="text-xs text-[var(--text-muted)]">
                      {legal.assignedTo || "Shared"}
                    </td>
                    <td>
                      <CrmStatusBadge tone={legalStatusBadgeTone(legal.status)}>
                        {legal.status}
                      </CrmStatusBadge>
                    </td>
                    <td className="max-w-[220px] truncate text-xs text-[var(--text-muted)]">
                      {legal.rejectionReason || legal.notes || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </CrmTable>
        )}
      </CrmTableShell>
    </div>
  );
}
