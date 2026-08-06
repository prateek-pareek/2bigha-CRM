"use client";

import type { ReactNode } from "react";
import NextLink from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CrmListMutedText,
  CrmListOrgCell,
  CrmListOwnerCell,
  CrmListPersonCell,
  CrmListStatusBadge,
  CrmSectionCard,
  CrmSoftBadge,
  CrmTable,
  CrmTableShell,
} from "@/components/crm/ui";
import {
  CRM_CHART_GRID,
  CRM_CHART_SERIES,
  CRM_CHART_TICK,
  CRM_CHART_TOOLTIP,
} from "@/lib/crm/shared/chart-theme";
import { CRM_PANEL } from "@/lib/crm/ui";

/** Recent deal row — fields used by Dreams-style dashboard table. */
export type DashRecentDeal = {
  _id?: string;
  id?: string;
  title?: string;
  dealName?: string;
  stage?: string;
  status?: string;
  dealValue?: number;
  dealValueINR?: number;
  dealOwner?: string;
  owner?: string;
  probability?: number;
  priority?: string;
  tags?: string[] | string;
  organization?: string | { name?: string };
  company?: string;
  createdAt?: string | Date;
  type?: string;
  dealType?: string;
};

export type DashRecentLead = {
  _id?: string;
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  organization?: string;
  company?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  status?: string;
  stage?: string;
};

export function dashDealId(d: DashRecentDeal) {
  return String(d.id || d._id || "");
}

export function dashDealTitle(d: DashRecentDeal) {
  return (d.title || d.dealName || "Untitled deal").trim();
}

export function dashDealOwner(d: DashRecentDeal) {
  return (d.dealOwner || d.owner || "").trim();
}

export function dashDealOrg(d: DashRecentDeal) {
  if (typeof d.organization === "string") return d.organization;
  if (d.organization?.name) return d.organization.name;
  return (d.company || "").trim();
}

export function dashDealTag(d: DashRecentDeal): string | null {
  if (Array.isArray(d.tags) && d.tags[0]) return String(d.tags[0]);
  if (typeof d.tags === "string" && d.tags.trim()) return d.tags.trim();
  if (d.priority?.trim()) return d.priority.trim();
  return null;
}

export function dashLeadId(l: DashRecentLead) {
  return String(l.id || l._id || "");
}

export function dashLeadName(l: DashRecentLead) {
  const n = (l.name || "").trim();
  if (n) return n;
  return [l.firstName, l.lastName].filter(Boolean).join(" ").trim() || "Untitled lead";
}

export function fmtMoney(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

export function fmtMoneyIfAllowed(value: number, allowed: boolean) {
  return allowed ? fmtMoney(value) : "—";
}

export function dealStatusLabel(stage: string | undefined): {
  label: string;
  tone: "success" | "danger" | "info" | "secondary";
} {
  const s = (stage || "").toLowerCase();
  if (s.includes("won") || s === "closed won") return { label: "Won", tone: "success" };
  if (s.includes("lost") || s === "closed lost") return { label: "Lost", tone: "danger" };
  if (!stage) return { label: "Open", tone: "secondary" };
  return { label: "Open", tone: "info" };
}

export function EmptyDash({ message }: { message: string }) {
  return (
    <div className="rounded-[var(--crm-radius-ui)] border border-dashed border-[var(--border-color)] px-4 py-10 text-center text-sm text-[var(--text-muted)]">
      {message}
    </div>
  );
}

export function DashSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-4">
      <div className={cn(CRM_PANEL, "h-48 bg-[var(--surface-dim)]")} />
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: Math.max(0, rows - 1) }).map((_, i) => (
          <div key={i} className={cn(CRM_PANEL, "h-56 bg-[var(--surface-dim)]")} />
        ))}
      </div>
    </div>
  );
}

type StageRow = { stage: string; count: number; value?: number };

export function StageBarChart({
  title,
  rows,
  valueMode = "count",
  actions,
  emptyMessage = "No stage data in this view.",
}: {
  title: string;
  rows: StageRow[];
  valueMode?: "count" | "value";
  canViewRevenue?: boolean;
  actions?: ReactNode;
  emptyMessage?: string;
}) {
  const data = [...rows]
    .map((r) => ({
      name: r.stage,
      value: valueMode === "value" ? Number(r.value || 0) : Number(r.count || 0),
      count: Number(r.count || 0),
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return (
    <CrmSectionCard title={title} actions={actions} bodyClassName="pt-2">
      {data.length === 0 ? (
        <EmptyDash message={emptyMessage} />
      ) : (
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
              <XAxis
                dataKey="name"
                tick={CRM_CHART_TICK}
                tickLine={false}
                axisLine={false}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={56}
              />
              <YAxis tick={CRM_CHART_TICK} tickLine={false} axisLine={false} width={40} />
              <Tooltip {...CRM_CHART_TOOLTIP} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={36}>
                {data.map((_, i) => (
                  <Cell key={i} fill={CRM_CHART_SERIES[i % CRM_CHART_SERIES.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </CrmSectionCard>
  );
}

export function RecentTableCard({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <CrmSectionCard title={title} actions={actions} bodyClassName="p-0 sm:p-0">
      <CrmTableShell
        className="rounded-none border-0 shadow-none"
        scrollClassName="overflow-x-auto"
      >
        {children}
      </CrmTableShell>
    </CrmSectionCard>
  );
}

export function ViewAllLink({ href, label }: { href: string; label: string }) {
  return (
    <NextLink
      href={href}
      className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--text-main)] shadow-[var(--crm-shadow-input)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary)]"
    >
      {label}
      <ChevronRight size={14} className="text-[var(--text-muted)]" aria-hidden />
    </NextLink>
  );
}

/**
 * Dreams dashboard “Recent Deals” table — same columns / cells as CRMS reference,
 * built with Mathionix CrmTable + list cell kit.
 */
export function RecentDealsTable({
  deals,
  canViewRevenue,
  emptyMessage = "No recent deals yet.",
  minWidthClassName = "min-w-[880px]",
}: {
  deals: DashRecentDeal[];
  canViewRevenue: boolean;
  emptyMessage?: string;
  minWidthClassName?: string;
}) {
  if (deals.length === 0) {
    return (
      <div className="p-6">
        <EmptyDash message={emptyMessage} />
      </div>
    );
  }

  return (
    <CrmTable className={minWidthClassName}>
      <thead>
        <tr>
          <th>Deal Name</th>
          <th>Stage</th>
          <th>Deal Value</th>
          <th>Tags</th>
          <th>Owner</th>
          <th>Probability</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {deals.map((d) => {
          const id = dashDealId(d);
          const title = dashDealTitle(d);
          const status = dealStatusLabel(d.status || d.stage);
          const stage = (d.stage || d.status || "—").trim() || "—";
          const value = Number(d.dealValueINR ?? d.dealValue ?? 0);
          const owner = dashDealOwner(d);
          const org = dashDealOrg(d);
          const tag = dashDealTag(d);
          const prob = Math.max(0, Math.min(100, Number(d.probability ?? 0)));
          const tagTone =
            tag && /high|urgent|reject/i.test(tag)
              ? "danger"
              : tag && /low|rated/i.test(tag)
                ? "secondary"
                : tag && /collab|success|won/i.test(tag)
                  ? "success"
                  : "info";

          return (
            <tr key={id || title}>
              <td>
                {id ? (
                  <NextLink href={`/crm/deals/${id}`} className="group block min-w-0">
                    <CrmListOrgCell name={title} subtitle={org || undefined} />
                  </NextLink>
                ) : (
                  <CrmListOrgCell name={title} subtitle={org || undefined} />
                )}
              </td>
              <td>
                <CrmListMutedText>{stage}</CrmListMutedText>
              </td>
              <td>
                <span className="text-sm font-semibold text-[#1f2020]">
                  {fmtMoneyIfAllowed(value, canViewRevenue)}
                </span>
              </td>
              <td>
                {tag ? <CrmSoftBadge label={tag} tone={tagTone} /> : <CrmListMutedText>—</CrmListMutedText>}
              </td>
              <td>
                <CrmListOwnerCell name={owner} />
              </td>
              <td>
                <span className="text-sm font-medium text-[#1f2020]">{prob}%</span>
              </td>
              <td>
                {status.tone === "success" || status.tone === "danger" ? (
                  <CrmListStatusBadge label={status.label} />
                ) : (
                  <CrmSoftBadge label={status.label} tone={status.tone} />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </CrmTable>
  );
}

/**
 * Dreams Sales Overview “Recently Created Deals” — compact Deals / Value / Status.
 */
export function RecentCreatedDealsTable({
  deals,
  canViewRevenue,
  emptyMessage = "No recently created deals for this view.",
}: {
  deals: DashRecentDeal[];
  canViewRevenue: boolean;
  emptyMessage?: string;
}) {
  if (deals.length === 0) {
    return (
      <div className="p-6">
        <EmptyDash message={emptyMessage} />
      </div>
    );
  }

  return (
    <CrmTable className="min-w-[420px]">
      <thead>
        <tr>
          <th>Deals</th>
          <th>Value</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {deals.map((d) => {
          const id = dashDealId(d);
          const title = dashDealTitle(d);
          const status = dealStatusLabel(d.status || d.stage);
          const value = Number(d.dealValueINR ?? d.dealValue ?? 0);
          const subtitle =
            (typeof d.type === "string" && d.type) ||
            (typeof d.dealType === "string" && d.dealType) ||
            (d.stage && !/won|lost/i.test(d.stage) ? d.stage : null) ||
            dashDealOrg(d) ||
            "Deal";

          return (
            <tr key={id || title}>
              <td>
                {id ? (
                  <NextLink href={`/crm/deals/${id}`} className="group block min-w-0">
                    <p className="truncate text-sm font-semibold text-[#1f2020] group-hover:text-[var(--primary)]">
                      {title}
                    </p>
                    <p className="truncate text-xs text-[var(--text-muted)]">{subtitle}</p>
                  </NextLink>
                ) : (
                  <div>
                    <p className="truncate text-sm font-semibold text-[#1f2020]">{title}</p>
                    <p className="truncate text-xs text-[var(--text-muted)]">{subtitle}</p>
                  </div>
                )}
              </td>
              <td>
                <span className="text-sm font-semibold tabular-nums text-[#1f2020]">
                  {fmtMoneyIfAllowed(value, canViewRevenue)}
                </span>
              </td>
              <td>
                {status.tone === "success" || status.tone === "danger" ? (
                  <CrmListStatusBadge label={status.label} />
                ) : (
                  <CrmSoftBadge label={status.label} tone={status.tone} />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </CrmTable>
  );
}

/**
 * Dreams leads-dashboard “Recently Created Leads” table — CrmTable + person/status cells.
 */
export function RecentLeadsTable({
  leads,
  emptyMessage = "No recently created leads for this view.",
  minWidthClassName = "min-w-[720px]",
}: {
  leads: DashRecentLead[];
  emptyMessage?: string;
  minWidthClassName?: string;
}) {
  if (leads.length === 0) {
    return (
      <div className="p-6">
        <EmptyDash message={emptyMessage} />
      </div>
    );
  }

  return (
    <CrmTable className={minWidthClassName}>
      <thead>
        <tr>
          <th>Lead Name</th>
          <th>Company Name</th>
          <th>Phone</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {leads.map((l) => {
          const id = dashLeadId(l);
          const name = dashLeadName(l);
          const company = l.organization || l.company || "—";
          const phone = l.phone || l.mobile || "—";
          const status = l.status || l.stage || "New";
          const initials = name
            .split(/\s+/)
            .map((p) => p[0])
            .join("")
            .slice(0, 2);

          return (
            <tr key={id || name}>
              <td>
                {id ? (
                  <NextLink href={`/crm/leads/${id}`} className="group block min-w-0">
                    <CrmListPersonCell
                      name={name}
                      initials={initials}
                      subtitle={l.email || undefined}
                      toneSeed={name}
                    />
                  </NextLink>
                ) : (
                  <CrmListPersonCell name={name} initials={initials} toneSeed={name} />
                )}
              </td>
              <td>
                <CrmListOrgCell name={company} />
              </td>
              <td>
                <CrmListMutedText>{phone}</CrmListMutedText>
              </td>
              <td>
                <CrmListStatusBadge label={status} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </CrmTable>
  );
}
