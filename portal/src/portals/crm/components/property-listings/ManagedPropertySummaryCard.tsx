"use client";

import { useEffect, useState } from "react";
import { Loader2, User, Phone, Mail, FileCheck, Users, Briefcase, ShieldCheck, CheckCircle2, Ticket } from "lucide-react";
import { CrmSectionCard, CrmStatusBadge } from "@/components/crm/ui";
import { fetchManagedPropertyDetail } from "../../lib/subscriptions/backend-api";
import type { ManagedPropertyDetail } from "../../lib/subscriptions/types";

export default function ManagedPropertySummaryCard({ propertyId }: { propertyId: string }) {
  const [detail, setDetail] = useState<ManagedPropertyDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    setLoading(true);
    fetchManagedPropertyDetail(propertyId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  if (loading) {
    return (
      <CrmSectionCard title="Managed Property Dashboard">
        <div className="flex h-32 items-center justify-center text-[var(--text-muted)]">
          <Loader2 size={24} className="animate-spin" />
        </div>
      </CrmSectionCard>
    );
  }

  if (!detail) {
    return null; // Don't render if it's not a managed property or we get unauthenticated
  }

  const getWorkflowTone = (status: string): "neutral" | "success" | "warning" => {
    if (status.includes("VERIFICATION") || status.includes("ASSIGNED")) return "warning";
    if (status.includes("COMPLETE") || status.includes("ACTIVE")) return "success";
    return "neutral";
  };

  const getLegalTone = (status?: string): "neutral" | "success" | "warning" => {
    if (status === "Completed" || status === "Approved") return "success";
    if (status === "In progress" || status === "Pending") return "warning";
    return "neutral"; 
  };

  const parseVisits = (visits: any) => {
    if (Array.isArray(visits)) return visits.length;
    if (visits && typeof visits === "object") return Object.keys(visits).length;
    return 0;
  };

  return (
    <div className="space-y-4 mb-4">
      <h2 className="text-lg font-semibold tracking-tight text-[var(--text-main)] flex items-center gap-2">
        <ShieldCheck className="text-[var(--brand-main)]" size={20} />
        Managed Property Dashboard
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Owner Info */}
        <CrmSectionCard title="Property Owner" bodyClassName="p-4 space-y-3 h-full">
          <div className="flex items-center gap-3 border-b border-[var(--border-color)] pb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand-main)]/10 text-[var(--brand-main)]">
              <User size={20} />
            </div>
            <div>
              <p className="font-semibold text-[var(--text-main)] text-sm">
                {detail.user.firstName} {detail.user.lastName}
              </p>
              <p className="text-xs text-[var(--text-muted)] capitalize">{detail.user.role.toLowerCase()}</p>
            </div>
          </div>
          <div className="space-y-2 pt-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[var(--text-muted)]"><Phone size={14} /> Phone</span>
              <span className="font-medium text-[var(--text-main)]">{detail.user.phone}</span>
            </div>
            {detail.user.email && (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[var(--text-muted)]"><Mail size={14} /> Email</span>
                <span className="font-medium text-[var(--text-main)]">{detail.user.email}</span>
              </div>
            )}
          </div>
        </CrmSectionCard>

        {/* Workflow & Assignment Status */}
        <CrmSectionCard title="Assignment Pipeline" bodyClassName="p-4 space-y-4 h-full">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Current Stage</span>
            <CrmStatusBadge tone={getWorkflowTone(detail.assignmentStatus)}>
              {detail.assignmentStatus.replace(/_/g, " ")}
            </CrmStatusBadge>
          </div>
          
          <div className="space-y-2 rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)] p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[var(--text-muted)]"><Briefcase size={14} /> RM</span>
              <span className="font-medium text-[var(--text-main)]">{detail.assignedManager?.name || "Unassigned"}</span>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-2">
              <span className="flex items-center gap-1.5 text-[var(--text-muted)]"><Users size={14} /> Field Agent</span>
              <span className="font-medium text-[var(--text-main)]">{detail.assignedAgent?.name || "Unassigned"}</span>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-2">
              <span className="flex items-center gap-1.5 text-[var(--text-muted)]"><ShieldCheck size={14} /> Legal</span>
              <span className="font-medium text-[var(--text-main)]">{detail.assignedLegalManager?.name || "Unassigned"}</span>
            </div>
          </div>
        </CrmSectionCard>

        {/* Legal Status */}
        <CrmSectionCard title="Legal Verification" bodyClassName="p-4 h-full">
          <div className="flex h-full flex-col justify-center space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-[var(--text-muted)]"><FileCheck size={16} /> Status</span>
              {detail.legalCheckStatus ? (
                <CrmStatusBadge tone={getLegalTone(detail.legalCheckStatus)}>{detail.legalCheckStatus}</CrmStatusBadge>
              ) : (
                <span className="text-sm italic text-[var(--text-muted)]">Not Started</span>
              )}
            </div>
            {detail.legalCheckNote && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-3 text-xs text-amber-800 dark:text-amber-200">
                <span className="font-semibold block mb-1">Latest Note:</span>
                {detail.legalCheckNote}
              </div>
            )}
            <div className="flex justify-between text-xs text-[var(--text-muted)] pt-2 border-t border-[var(--border-color)] mt-2">
              <span>{detail.legalCheckStartedAt ? `Started: ${new Date(detail.legalCheckStartedAt).toLocaleDateString()}` : ""}</span>
              <span>{detail.legalCheckCompletedAt ? `Completed: ${new Date(detail.legalCheckCompletedAt).toLocaleDateString()}` : ""}</span>
            </div>
          </div>
        </CrmSectionCard>

        {/* Operations (Tickets & Visits) */}
        <CrmSectionCard title="Operations Overview" bodyClassName="p-4 h-full flex flex-col justify-center">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--surface-dim)] p-4 text-center">
              <CheckCircle2 size={24} className="mb-2 text-emerald-600" />
              <span className="text-2xl font-bold text-[var(--text-main)]">{parseVisits(detail.visits)}</span>
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] mt-1">Logged Visits</span>
            </div>
            <div className="flex flex-col items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--surface-dim)] p-4 text-center">
              <Ticket size={24} className="mb-2 text-sky-600" />
              <span className="text-2xl font-bold text-[var(--text-main)]">{detail.tickets?.length || 0}</span>
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] mt-1">Open Tickets</span>
            </div>
          </div>
        </CrmSectionCard>
      </div>
    </div>
  );
}
