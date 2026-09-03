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
import { CrmButton, CrmInput, CrmLabel, CrmStatusBadge, CrmTextarea } from "@/components/crm/ui";
import type { PropertyListingRecord } from "@/lib/crm/property-listings/types";
import {
  assignPmToFieldAgent,
  assignPmToLegal,
  assignPmToRm,
  completePmLegalVerification,
  fetchLivePmStatus,
  fetchPmAssignmentStaff,
  reviewPmVisitReport,
  schedulePmFieldVisit,
  setPmFieldVisitStatus,
  startPmLegalVerification,
  submitPmVisitReport,
  unassignPmStaff,
  updatePmLegalChecklist,
  type PmAssignPick,
  type PmAssignmentStaffResponse,
} from "@/lib/crm/property-management/pm-api";
import {
  pmStageBadgeTone,
  type PmChecklistItem,
} from "@/lib/crm/property-management/types";
import PmAssigneeSelect from "./PmAssigneeSelect";
import PmVisitReportModal from "./PmVisitReportModal";

const PM_STAGES = [
  "Property Submitted",
  "Assigned to RM",
  "Assigned to Legal",
  "Assigned to Field Agent",
  "Visit Report Pending",
  "Visit Report Approved",
] as const;

const EMPTY_STAFF: PmAssignmentStaffResponse = {
  manager: { twobigha: [], crm: [] },
  legal: { twobigha: [], crm: [] },
  field: { twobigha: [], crm: [] },
};

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

function ChecklistEditor({
  items,
  disabled,
  onChange,
}: {
  items: PmChecklistItem[];
  disabled?: boolean;
  onChange: (next: PmChecklistItem[]) => void;
}) {
  return (
    <div className="space-y-1.5 rounded-md border border-[var(--border-color)] bg-slate-50 p-2.5">
      {items.map((item, idx) => (
        <div key={item.id || idx} className="flex items-center justify-between gap-2 text-xs">
          <label className="flex items-center gap-2 cursor-pointer text-slate-700">
            <input
              type="checkbox"
              checked={item.checked}
              disabled={disabled}
              onChange={(e) => {
                const next = items.map((i, iidx) =>
                  iidx === idx ? { ...i, checked: e.target.checked } : i,
                );
                onChange(next);
              }}
              className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <span>{item.label}</span>
          </label>
          {item.note ? <span className="text-[11px] text-slate-400 italic">{item.note}</span> : null}
        </div>
      ))}
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

  const [busy, setBusy] = useState(false);
  const [staff, setStaff] = useState<PmAssignmentStaffResponse>(EMPTY_STAFF);
  const [staffLoading, setStaffLoading] = useState(true);
  const [rmValue, setRmValue] = useState("");
  const [legalValue, setLegalValue] = useState("");
  const [fieldValue, setFieldValue] = useState("");
  const [rmPick, setRmPick] = useState<PmAssignPick | null>(null);
  const [legalPick, setLegalPick] = useState<PmAssignPick | null>(null);
  const [fieldPick, setFieldPick] = useState<PmAssignPick | null>(null);
  const [legalSummary, setLegalSummary] = useState(listing.legalVerification?.summary || "");
  const [visitNotes, setVisitNotes] = useState(listing.fieldVisit?.notes || "");
  const [visitAt, setVisitAt] = useState(() => {
    const raw = listing.fieldVisit?.scheduledAt;
    if (!raw) return "";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [rejectReason, setRejectReason] = useState("");

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

  useEffect(() => {
    let cancelled = false;
    setStaffLoading(true);
    fetchPmAssignmentStaff()
      .then((data) => {
        if (!cancelled) setStaff(data);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load 2bigha / CRM staff lists");
      })
      .finally(() => {
        if (!cancelled) setStaffLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (fn: () => Promise<PropertyListingRecord>, okMsg: string) => {
    setBusy(true);
    try {
      const next = await fn();
      toast.success(okMsg);
      onUpdated(next);
      void triggerLiveSync(false);
    } catch (err: any) {
      toast.error(err?.message || "Operation failed");
    } finally {
      setBusy(false);
    }
  };

  const stage = listing.pmStage || "Property Submitted";
  const legal = listing.legalVerification;
  const visit = listing.fieldVisit;
  const report = listing.visitReport;
  const liveDetail = liveData?.liveDetail;

  const legalStatus =
    legal?.status ||
    liveDetail?.legalCheckStatus ||
    (stage === "Assigned to Field Agent" || stage === "Visit Report Pending" || stage === "Visit Report Approved"
      ? "Completed"
      : stage === "Assigned to Legal"
        ? "In progress"
        : "Pending");

  const visitStatus =
    visit?.status ||
    liveDetail?.recentVisit?.status ||
    (stage === "Visit Report Pending" || stage === "Visit Report Approved"
      ? "Complete"
      : stage === "Assigned to Field Agent"
        ? "Scheduled"
        : "Pending");

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
            Operational status tracking & workflow management synchronized with 2bigha operations.
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
      <div className="rounded-lg border border-[var(--border-color)] bg-white p-4 shadow-sm space-y-3">
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
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <PmAssigneeSelect
            label="Regional Manager (RM)"
            pool={staff.manager}
            value={rmValue}
            onChange={(pick, raw) => {
              setRmPick(pick);
              setRmValue(raw);
            }}
          />
          <div className="flex items-end gap-2">
            <CrmButton
              disabled={busy || (!rmValue.trim() && !rmPick)}
              onClick={() =>
                void run(
                  () => assignPmToRm(listing._id, rmPick || rmValue.trim()),
                  "RM assigned — stage updated",
                )
              }
            >
              {listing.rmAssigneeName ? "Reassign RM" : "Assign RM"}
            </CrmButton>
            {listing.rmAssigneeName ? (
              <CrmButton
                disabled={busy}
                variant="secondary"
                onClick={() => void run(() => unassignPmStaff(listing._id, "manager").then(res => res.listing), "RM unassigned")}
              >
                Unassign
              </CrmButton>
            ) : null}
          </div>
        </div>
      </div>

      {/* STAGE 4: LEGAL MANAGER & VERIFICATION */}
      <div className="rounded-lg border border-[var(--border-color)] bg-white p-4 shadow-sm space-y-3">
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
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <PmAssigneeSelect
            label="Legal Manager"
            pool={staff.legal}
            value={legalValue}
            onChange={(pick, raw) => {
              setLegalPick(pick);
              setLegalValue(raw);
            }}
          />
          <div className="flex items-end gap-2">
            <CrmButton
              disabled={busy || (!legalValue.trim() && !legalPick)}
              onClick={() =>
                void run(
                  () => assignPmToLegal(listing._id, legalPick || legalValue.trim()),
                  "Legal Manager assigned — checklist ready",
                )
              }
            >
              {listing.legalAssigneeName ? "Reassign Legal" : "Assign Legal"}
            </CrmButton>
            {listing.legalAssigneeName ? (
              <CrmButton
                disabled={busy}
                variant="secondary"
                onClick={() => void run(() => unassignPmStaff(listing._id, "legal").then(res => res.listing), "Legal Manager unassigned")}
              >
                Unassign
              </CrmButton>
            ) : null}
          </div>
        </div>

        <div>
          <CrmLabel>Legal summary / notes</CrmLabel>
          <CrmInput
            value={legalSummary}
            onChange={(e) => setLegalSummary(e.target.value)}
            className="mt-1"
            placeholder="Key findings, document verification details..."
          />
        </div>

        {legal?.checklist?.length ? (
          <div className="mt-2 space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Verification Checklist:
            </span>
            <ChecklistEditor
              items={legal.checklist}
              disabled={busy}
              onChange={(nextItems) => {
                void (async () => {
                  try {
                    const next = await updatePmLegalChecklist(listing._id, nextItems, legalSummary);
                    onUpdated(next);
                  } catch {
                    toast.error("Could not save checklist");
                  }
                })();
              }}
            />
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          {legal?.status !== "In progress" && legal?.status !== "Completed" ? (
            <CrmButton
              disabled={busy}
              onClick={() =>
                void run(
                  () => startPmLegalVerification(listing._id, legalSummary),
                  "Legal verification started",
                )
              }
            >
              Start verification
            </CrmButton>
          ) : null}
          {legal?.status === "In progress" ? (
            <CrmButton
              disabled={busy}
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() =>
                void run(
                  () => completePmLegalVerification(listing._id, legalSummary),
                  "Legal verification completed",
                )
              }
            >
              Complete verification
            </CrmButton>
          ) : null}
        </div>
      </div>

      {/* STAGE 5: FIELD AGENT & PHYSICAL SITE VISIT */}
      <div className="rounded-lg border border-[var(--border-color)] bg-white p-4 shadow-sm space-y-3">
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
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <PmAssigneeSelect
            label="Field Agent"
            pool={staff.field}
            value={fieldValue}
            onChange={(pick, raw) => {
              setFieldPick(pick);
              setFieldValue(raw);
            }}
          />
          <div className="flex items-end gap-2">
            <CrmButton
              disabled={busy || (!fieldValue.trim() && !fieldPick)}
              onClick={() =>
                void run(
                  () => assignPmToFieldAgent(listing._id, fieldPick || fieldValue.trim(), visitAt ? new Date(visitAt).toISOString() : undefined),
                  "Field Agent assigned",
                )
              }
            >
              {listing.fieldAssigneeName ? "Reassign Field Agent" : "Assign Field Agent"}
            </CrmButton>
            {listing.fieldAssigneeName ? (
              <CrmButton
                disabled={busy}
                variant="secondary"
                onClick={() => void run(() => unassignPmStaff(listing._id, "field").then(res => res.listing), "Field Agent unassigned")}
              >
                Unassign
              </CrmButton>
            ) : null}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <CrmLabel>Schedule visit (date & time)</CrmLabel>
            <input
              type="datetime-local"
              value={visitAt}
              onChange={(e) => setVisitAt(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-[var(--border-color)] px-2 text-sm"
            />
          </div>
          <div className="flex items-end">
            <CrmButton
              disabled={busy || !visitAt || (!listing.fieldAssigneeId && !listing.fieldAssigneeName)}
              onClick={() =>
                void run(
                  () =>
                    schedulePmFieldVisit(
                      listing._id,
                      listing.fieldAssigneeId || listing.fieldAssigneeName || "",
                      new Date(visitAt).toISOString(),
                      visitNotes,
                    ),
                  "Visit scheduled — task & calendar updated",
                )
              }
              className="bg-sky-600 hover:bg-sky-700 w-full sm:w-auto"
            >
              Schedule Visit
            </CrmButton>
          </div>
        </div>

        <div>
          <CrmLabel>Visit notes</CrmLabel>
          <CrmTextarea
            value={visitNotes}
            onChange={(e) => setVisitNotes(e.target.value)}
            className="mt-1"
            placeholder="Field visit notes, instructions for agent..."
          />
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <CrmButton
            disabled={busy}
            onClick={() =>
              void run(
                () => setPmFieldVisitStatus(listing._id, "Pending", visitNotes),
                "Visit marked Pending",
              )
            }
          >
            Pending
          </CrmButton>
          <CrmButton
            disabled={busy}
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() =>
              void run(
                () => setPmFieldVisitStatus(listing._id, "Complete", visitNotes),
                "Visit completed",
              )
            }
          >
            Complete
          </CrmButton>
          <CrmButton
            disabled={busy}
            variant="secondary"
            onClick={() =>
              void run(
                () => setPmFieldVisitStatus(listing._id, "Cancel", visitNotes),
                "Visit cancelled",
              )
            }
          >
            Cancel
          </CrmButton>
          {visit?.status === "Complete" || visitStatus === "Complete" || visitStatus === "Completed" ? (
            <CrmButton
              disabled={busy}
              className="bg-sky-600 hover:bg-sky-700"
              onClick={() =>
                void run(() => submitPmVisitReport(listing._id), "Visit report submitted")
              }
            >
              Submit Visit Report
            </CrmButton>
          ) : null}
        </div>
      </div>

      {/* STAGE 6: FIELD VISIT REPORT & RM APPROVAL */}
      <div className="rounded-lg border border-[var(--border-color)] bg-white p-4 shadow-sm space-y-3">
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

        {report?.sections ? (
          <ChecklistEditor
            items={report.sections}
            disabled={busy || report.status !== "Pending"}
            onChange={() => {
              /* sections signed off at approve time */
            }}
          />
        ) : null}

        <div className="space-y-2 pt-1">
          <div>
            <CrmLabel>Rejection / Feedback Notes (if rejecting or requesting changes)</CrmLabel>
            <CrmInput
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="mt-1"
              placeholder="Provide reason for rejection or details of requested changes..."
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <CrmButton
              disabled={busy}
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() =>
                void run(
                  () => reviewPmVisitReport(listing._id, "Approved"),
                  "Visit report approved",
                )
              }
            >
              Approve Report
            </CrmButton>
            <CrmButton
              disabled={busy}
              variant="secondary"
              onClick={() =>
                void run(
                  () =>
                    reviewPmVisitReport(
                      listing._id,
                      "Changes Requested",
                      rejectReason || "Changes requested on one or more sections",
                    ),
                  "Changes requested — field agent notified",
                )
              }
            >
              Request Changes
            </CrmButton>
            <CrmButton
              disabled={busy}
              variant="secondary"
              onClick={() =>
                void run(
                  () => reviewPmVisitReport(listing._id, "Rejected", rejectReason || "Rejected by RM"),
                  "Visit report rejected",
                )
              }
            >
              Reject & Reschedule
            </CrmButton>
          </div>
        </div>
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
