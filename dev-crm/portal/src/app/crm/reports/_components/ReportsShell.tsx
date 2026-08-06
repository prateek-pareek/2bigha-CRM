"use client";

import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import CRMFilterBar from "@/components/crm/segments/CRMFilterBar";
import { type FilterCriteria } from "@/lib/crm/filter-config";
import { CRM_API_URL } from '@/lib/crm/config';
import { getCrmAuthToken } from "@/lib/crm/api";
import { usePermissions } from "@/hooks/usePermissions";
import { canViewCrmRevenue } from "@/lib/suite/auth";
import {
  reportSectionTitle,
  REPORT_SECTION_DESCRIPTIONS,
} from "@/lib/crm/shared/dashboard-routes";
import { CrmPageHeader, CrmHeaderTools } from "@/components/crm/ui";
import {
  COMPARE_MODE_OPTIONS,
  REPORT_PERIOD_OPTIONS,
  resolveCompareParam,
  resolveReportPeriodParam,
  type CompareMode,
} from "@/portals/crm/lib/reports/period-compare";

function Dropdown({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={`inline-flex h-[38px] items-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] border bg-white pl-3 pr-2.5 text-sm font-medium text-[var(--text-main)] shadow-[var(--crm-shadow-input)] transition-colors ${
          open
            ? "border-[var(--primary)] ring-1 ring-[var(--primary)]/20"
            : "border-[var(--border-color)] hover:border-[var(--text-muted)]"
        }`}
      >
        {selected?.label}
        <ChevronDown
          size={13}
          className={`text-[var(--primary-muted)] transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[9999] mt-1.5 min-w-full overflow-hidden rounded-md border border-[var(--border-color)] bg-white py-1 shadow-[var(--crm-shadow-raised)]">
          {options.map((opt, idx) => (
            <button
              key={`${opt.value}-${idx}`}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                opt.value === value
                  ? "bg-[var(--primary-light)] font-semibold text-[var(--primary)]"
                  : "font-medium text-[var(--text-main)] hover:bg-[var(--background)]"
              }`}
            >
              {opt.label}
              {opt.value === value && <Check size={13} className="shrink-0 text-[var(--primary)]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export type ReportOwner = { _id: string; firstName: string; lastName: string };

export type ReportsShellContext = {
  period: string;
  /** Raw UI period key (preset or custom) before API resolution. */
  periodKey: string;
  compareMode: CompareMode;
  /** API `compare` value when comparison is enabled. */
  compare: string | undefined;
  owner: string;
  owners: ReportOwner[];
  filters: FilterCriteria[];
  canViewRevenue: boolean;
  refresh: () => void;
};

type ReportsShellProps = {
  /** Route slug from REPORT_ROUTES (overview, leads, email, forecast). */
  slug: string;
  onRefresh?: () => void | Promise<void>;
  children: (ctx: ReportsShellContext) => ReactNode;
};

/** Shared chrome for Reports routes — each page supplies its own body. */
export default function ReportsShell({ slug, onRefresh, children }: ReportsShellProps) {
  const { user } = usePermissions();
  const canViewRevenue = canViewCrmRevenue(user);
  const title = reportSectionTitle(slug);
  const description =
    REPORT_SECTION_DESCRIPTIONS[slug] || "Pipeline outcomes, outreach analytics, and sales operations.";

  const [period, setPeriod] = useState("30");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [compareMode, setCompareMode] = useState<CompareMode>("previous");
  const [compareStart, setCompareStart] = useState("");
  const [compareEnd, setCompareEnd] = useState("");
  const [owner, setOwner] = useState("All");
  const [owners, setOwners] = useState<ReportOwner[]>([]);
  const [filters, setFilters] = useState<FilterCriteria[]>([]);

  const periodKey =
    period === "custom"
      ? customStart && customEnd
        ? `${customStart},${customEnd}`
        : "30"
      : period;
  const actualPeriod = resolveReportPeriodParam(periodKey);
  const compare = resolveCompareParam(compareMode, compareStart, compareEnd);

  useEffect(() => {
    const token = getCrmAuthToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    void fetch(`${CRM_API_URL}/crm-users/list/crm-portal`, { headers })
      .then((r) => r.json())
      .then((users) => {
        if (Array.isArray(users)) setOwners(users);
      })
      .catch(() => {});
  }, []);

  const ownerOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: { value: string; label: string }[] = [{ value: "All", label: "All owners" }];
    for (const o of owners) {
      const name = `${o.firstName} ${o.lastName}`.trim() || o._id;
      if (name && !seen.has(name)) {
        seen.add(name);
        list.push({ value: name, label: name });
      }
    }
    return list;
  }, [owners]);

  const refresh = () => {
    void onRefresh?.();
  };

  return (
    <div className="theme-crm-hubspot crm-list-page mx-auto w-full space-y-4 animate-in fade-in duration-500 pb-6">
      <CrmPageHeader
        bordered={false}
        title={title}
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Reports", href: "/crm/reports/overview" },
          { label: title },
        ]}
        description={description}
        actions={<CrmHeaderTools onRefresh={refresh} />}
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <CRMFilterBar
          module="deals"
          filters={filters}
          onChange={setFilters}
          onClear={() => setFilters([])}
        />
        <Dropdown
          value={period === "custom" ? "custom" : period}
          onChange={setPeriod}
          options={REPORT_PERIOD_OPTIONS}
        />
        {period === "custom" && (
          <div className="flex h-[38px] items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-2 shadow-[var(--crm-shadow-input)]">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-transparent text-sm text-text-main outline-none"
            />
            <span className="text-xs text-text-muted">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-transparent text-sm text-text-main outline-none"
            />
          </div>
        )}
        <div className="flex h-[38px] items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--background)] px-2 text-xs font-medium text-[var(--text-muted)]">
          Compare
        </div>
        <Dropdown
          value={compareMode}
          onChange={(v) => setCompareMode(v as CompareMode)}
          options={COMPARE_MODE_OPTIONS}
        />
        {compareMode === "custom" && (
          <div className="flex h-[38px] items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-2 shadow-[var(--crm-shadow-input)]">
            <input
              type="date"
              value={compareStart}
              onChange={(e) => setCompareStart(e.target.value)}
              className="bg-transparent text-sm text-text-main outline-none"
            />
            <span className="text-xs text-text-muted">to</span>
            <input
              type="date"
              value={compareEnd}
              onChange={(e) => setCompareEnd(e.target.value)}
              className="bg-transparent text-sm text-text-main outline-none"
            />
          </div>
        )}
        <Dropdown
          value={owner}
          onChange={setOwner}
          options={ownerOptions}
        />
      </div>

      <div className="w-full space-y-4">
        {children({
          period: actualPeriod,
          periodKey,
          compareMode,
          compare,
          owner,
          owners,
          filters,
          canViewRevenue,
          refresh,
        })}
      </div>
    </div>
  );
}
