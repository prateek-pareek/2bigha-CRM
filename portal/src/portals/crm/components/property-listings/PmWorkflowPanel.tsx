"use client";

import { useEffect, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  Clock,
  FileCheck,
  FileText,
  Loader2,
  MapPin,
  RefreshCw,
  Scale,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { PropertyListingRecord } from "@/lib/crm/property-listings/types";
import { pmStageBadgeTone } from "@/lib/crm/property-management/types";
import { CrmStatusBadge } from "@/components/crm/ui";
import { fetchLivePmStatus } from "@/lib/crm/property-management/pm-api";
import PmVisitReportModal from "./PmVisitReportModal";

const PM_STAGES = [
  "Property Submitted",
  "Assigned to RM",
  "Assigned to Legal",
  "Assigned to Field Agent",
  "Visit Report Pending",
  "Report Approved",
] as const;

function StageRail({ stage }: { stage: string }) {
  const currentIndex = PM_STAGES.findIndex(
    (s) => s.toLowerCase() === stage?.toLowerCase(),
  );

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto py-1 text-xs">
      {PM_STAGES.map((s, idx) => {
        const isDone = currentIndex >= 0 && idx < currentIndex;
        const isCurrent = currentIndex >= 0 && idx === currentIndex;
        return (
          <div key={s} className="flex shrink-0 items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-medium border text-[11px] transition-colors",
                isDone && "bg-emerald-50 text-emerald-700 border-emerald-200",
                isCurrent && "bg-sky-50 text-sky-800 border-sky-300 font-semibold ring-2 ring-sky-200/50",
                !isDone && !isCurrent && "bg-slate-50 text-slate-500 border-slate-200",
              )}
            >
              {isDone ? (
                <CheckCircle2 size={11} className="text-emerald-600" />
              ) : (
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-700">
                  {idx + 1}
                </span>
              )}
              {s}
            </span>
            {idx < PM_STAGES.length - 1 && (
              <span className="text-slate-300">›</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function PmWorkflowPanel({
  listing,
  onUpdated,
}: {
  listing: PropertyListingRecord;
  onUpdated: (next: PropertyListingRecord) => void;
}) {
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [syncingLive, setSyncingLive] = useState(false);
  const [liveData, setLiveData] = useState<{
    liveDetail?: any;
    visitReports?: any[];
    fieldVisits?: any[];
  } | null>(null);

  const triggerLiveSync = async (notify = true) => {
    setSyncingLive(true);
    try {
      const data = await fetchLivePmStatus(listing._id);
      if (data) {
        setLiveData(data);
        if (data.listing) {
          onUpdated(data.listing);
        }
        if (notify) toast.success("Live status synced with 2bigha");
      }
    } catch {
      if (notify) toast.error("Could not sync live status from 2bigha");
    } finally {
      setSyncingLive(false);
    }
  };

  useEffect(() => {
    void triggerLiveSync(false);
  }, [listing._id]);

  const stage = listing.pmStage || "Property Submitted";
  const legal = listing.legalVerification;
  const visit = listing.fieldVisit;
  const report = listing.visitReport;
  const liveDetail = liveData?.liveDetail;

  // Resolved Stage 4 Legal Status
  const legalStatus =
    legal?.status ||
    liveDetail?.legalCheckStatus ||
    (stage === "Assigned to Field Agent" || stage === "Visit Report Pending" || stage === "Visit Report Approved"
      ? "Completed"
      : stage === "Assigned to Legal"
        ? "In progress"
        : "Pending");

  // Resolved Stage 5 Visit Status
  const visitStatus =
    visit?.status ||
    liveDetail?.recentVisit?.status ||
    (stage === "Visit Report Pending" || stage === "Visit Report Approved"
      ? "Complete"
      : stage === "Assigned to Field Agent"
        ? "Scheduled"
        : "Pending");

  // Resolved Stage 6 Report Status
  const reportStatus =
    report?.status ||
    liveDetail?.recentVisit?.reportStatus ||
    (stage === "Visit Report Pending"
      ? "Pending Review"
      : stage === "Visit Report Approved"
        ? "Approved"
        : "Pending");

  const latestReportId =
    liveData?.visitReports?.[0]?.id ||
    liveData?.visitReports?.[0]?.reportId ||
    (listing.visitReport as any)?.reportId ||
    listing.pmWorkflowIds?.reportId;

  const hasReport =
    Boolean(latestReportId) &&
    Boolean(report?.submittedAt || report?.status) &&
    reportStatus !== "Pending";

  return (
    <div className="space-y-4 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-[var(--text-main)]">
              PM Operational Pipeline
            </h3>
            <button
              onClick={() => void triggerLiveSync(true)}
              disabled={syncingLive}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              title="Refresh live status from 2bigha"
            >
              <RefreshCw size={11} className={cn(syncingLive && "animate-spin text-sky-600")} />
              {syncingLive ? "Syncing…" : "Live Sync"}
            </button>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Read-only status tracking synchronized from 2bigha operations (Stages 3–6).
          </p>
        </div>
        {listing.pmStage ? (
          <CrmStatusBadge tone={pmStageBadgeTone(listing.pmStage)}>
            {listing.pmStage}
          </CrmStatusBadge>
        ) : null}
      </div>

      {/* 6-Stage Timeline Rail */}
      <div className="py-1">
        <StageRail stage={stage} />
      </div>

      {/* Quota & Plan Summary Ribbon */}
      {liveDetail ? (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-sky-100 bg-sky-50/50 p-3 text-xs text-sky-900 sm:grid-cols-4">
          <div>
            <span className="text-[11px] font-medium text-sky-700">PM Plan:</span>
            <p className="font-semibold">{liveDetail.planDetails?.planName || "Active Plan"}</p>
          </div>
          <div>
            <span className="text-[11px] font-medium text-sky-700">Visits Included:</span>
            <p className="font-semibold">{liveDetail.visitsIncluded ?? "—"}</p>
          </div>
          <div>
            <span className="text-[11px] font-medium text-sky-700">Visits Used:</span>
            <p className="font-semibold">{liveDetail.visitsUsed ?? 0}</p>
          </div>
          <div>
            <span className="text-[11px] font-medium text-sky-700">Visits Remaining:</span>
            <p className="font-semibold">{liveDetail.visitsRemaining ?? "—"}</p>
          </div>
        </div>
      ) : null}

      {/* STAGE 3: REGIONAL MANAGER */}
      <div className="rounded-lg border border-[var(--border-color)] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
              <UserCheck size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Stage 3
                </span>
                <h4 className="text-sm font-semibold text-[var(--text-main)]">
                  Regional Manager (RM)
                </h4>
                <CrmStatusBadge tone={listing.rmAssigneeName ? "success" : "neutral"}>
                  {listing.rmAssigneeName ? "Assigned" : "Pending Assignment"}
                </CrmStatusBadge>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Assigned RM: <strong className="text-[var(--text-main)]">{listing.rmAssigneeName || "Unassigned"}</strong>
                {liveDetail?.managerAssignedAt
                  ? ` · Assigned on ${new Date(liveDetail.managerAssignedAt).toLocaleDateString()}`
                  : ""}
              </p>
            </div>
          </div>
          <span className="text-[11px] font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
            Managed by 2bigha Ops
          </span>
        </div>
      </div>

      {/* STAGE 4: LEGAL MANAGER & VERIFICATION */}
      <div className="rounded-lg border border-[var(--border-color)] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <Scale size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Stage 4
                </span>
                <h4 className="text-sm font-semibold text-[var(--text-main)]">
                  Legal Verification
                </h4>
                <CrmStatusBadge
                  tone={
                    legalStatus === "Completed"
                      ? "success"
                      : legalStatus === "In progress"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {legalStatus}
                </CrmStatusBadge>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Legal Manager:{" "}
                {listing.legalAssigneeName ? (
                  <strong className="text-[var(--text-main)]">{listing.legalAssigneeName}</strong>
                ) : (
                  <span className="text-slate-400 italic">Not Assigned</span>
                )}
                {legal?.startedAt ? ` · Started ${new Date(legal.startedAt).toLocaleDateString()}` : ""}
                {legal?.completedAt ? ` · Completed ${new Date(legal.completedAt).toLocaleDateString()}` : ""}
              </p>
            </div>
          </div>
          <span className="text-[11px] font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
            Managed by 2bigha Ops
          </span>
        </div>

        {legal?.summary ? (
          <p className="mt-2.5 rounded bg-slate-50 p-2.5 text-xs text-[var(--text-muted)] border border-slate-100">
            <strong className="text-slate-700">Summary:</strong> {legal.summary}
          </p>
        ) : null}

        {/* Read-only Document Checklist */}
        {legal?.checklist?.length ? (
          <div className="mt-3 space-y-1.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Document Verification Checklist:
            </span>
            <div className="space-y-1">
              {legal.checklist.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between text-xs py-0.5">
                  <span className="flex items-center gap-1.5 text-slate-700">
                    <CheckCircle2
                      size={13}
                      className={cn(item.checked ? "text-emerald-600" : "text-slate-300")}
                    />
                    {item.label}
                  </span>
                  {item.note ? (
                    <span className="text-[11px] text-slate-400 italic">{item.note}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* STAGE 5: FIELD AGENT & PHYSICAL SITE VISIT */}
      <div className="rounded-lg border border-[var(--border-color)] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <MapPin size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Stage 5
                </span>
                <h4 className="text-sm font-semibold text-[var(--text-main)]">
                  Field Agent & Site Visit
                </h4>
                <CrmStatusBadge
                  tone={
                    visitStatus === "Complete" || visitStatus === "Completed"
                      ? "success"
                      : visitStatus === "Scheduled" || visitStatus === "Pending"
                        ? "warning"
                        : "danger"
                  }
                >
                  {visitStatus}
                </CrmStatusBadge>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Field Agent:{" "}
                {listing.fieldAssigneeName ? (
                  <strong className="text-[var(--text-main)]">{listing.fieldAssigneeName}</strong>
                ) : (
                  <span className="text-slate-400 italic">Not Assigned</span>
                )}
                {visit?.scheduledAt ? ` · Scheduled for ${new Date(visit.scheduledAt).toLocaleString()}` : ""}
                {visit?.completedAt ? ` · Completed ${new Date(visit.completedAt).toLocaleString()}` : ""}
              </p>
            </div>
          </div>
          <span className="text-[11px] font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
            Managed by 2bigha Ops
          </span>
        </div>

        {visit?.notes ? (
          <p className="mt-2.5 rounded bg-slate-50 p-2.5 text-xs text-[var(--text-muted)] border border-slate-100">
            <strong className="text-slate-700">Visit Notes:</strong> {visit.notes}
          </p>
        ) : null}
      </div>

      {/* STAGE 6: FIELD VISIT REPORT & RM APPROVAL */}
      <div className="rounded-lg border border-[var(--border-color)] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
              <FileCheck size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Stage 6
                </span>
                <h4 className="text-sm font-semibold text-[var(--text-main)]">
                  Field Visit Report Approval
                </h4>
                <CrmStatusBadge
                  tone={
                    reportStatus === "Approved"
                      ? "success"
                      : reportStatus === "Rejected"
                        ? "danger"
                        : "warning"
                  }
                >
                  {reportStatus}
                </CrmStatusBadge>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                RM Verdict: <strong>{reportStatus}</strong>
                {report?.submittedAt ? ` · Submitted ${new Date(report.submittedAt).toLocaleString()}` : ""}
                {report?.reviewedAt ? ` · Reviewed ${new Date(report.reviewedAt).toLocaleString()}` : ""}
              </p>
            </div>
          </div>

          {hasReport ? (
            <button
              onClick={() => setReportModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded border border-sky-200 bg-sky-50 px-3.5 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 shadow-sm transition-colors"
            >
              <FileText size={13} />
              View Inspection Report
            </button>
          ) : (
            <span className="text-xs text-slate-400 italic">
              No report submitted yet
            </span>
          )}
        </div>

        {(reportStatus === "Rejected" || reportStatus === "REJECTED") && report?.rejectionReason ? (
          <div className="mt-2.5 rounded border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">
            <strong>Rejection Note:</strong> {report.rejectionReason}
          </div>
        ) : null}
      </div>

      {/* Modal for Stage 6 Report Details */}
      <PmVisitReportModal
        reportId={latestReportId}
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        fallbackSummary={{
          status: reportStatus,
          submittedAt: report?.submittedAt,
          reviewedAt: report?.reviewedAt,
          rejectionReason: report?.rejectionReason,
          conditionRating: (report as any)?.conditionRating,
          observations: (report as any)?.observations,
          sections: report?.sections,
          agentName: listing.fieldAssigneeName,
          recommendations: (report as any)?.recommendations,
        }}
      />
    </div>
  );
}
