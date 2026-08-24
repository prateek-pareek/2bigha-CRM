"use client";

import type { ReactNode } from "react";
import NextLink from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CrmListMutedText,
  CrmListOrgCell,
  CrmListPersonCell,
  CrmListStatusBadge,
  CrmSectionCard,
  CrmTable,
  CrmTableShell,
} from "@/components/crm/ui";
import { CRM_PANEL } from "@/lib/crm/ui";

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
