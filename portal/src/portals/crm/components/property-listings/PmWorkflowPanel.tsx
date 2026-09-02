"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CrmButton, CrmInput, CrmLabel, CrmStatusBadge, CrmTextarea } from "@/components/crm/ui";
import {
  assignPmToFieldAgent,
  assignPmToLegal,
  assignPmToRm,
  completePmLegalVerification,
  fetchPmAssignmentStaff,
  reviewPmVisitReport,
  setPmFieldVisitStatus,
  startPmLegalVerification,
  submitPmVisitReport,
  unassignPmStaff,
  updatePmLegalChecklist,
  type PmAssignPick,
  type PmAssignmentStaffResponse,
} from "@/lib/crm/property-management/pm-api";
import {
  PM_STAGE_RAIL,
  pmStageBadgeTone,
  type PmChecklistItem,
} from "@/lib/crm/property-management/types";
import type { PropertyListingRecord } from "@/lib/crm/property-listings/types";
import PmAssigneeSelect from "./PmAssigneeSelect";

type Props = {
  listing: PropertyListingRecord;
  onUpdated: (next: PropertyListingRecord) => void;
};

const EMPTY_STAFF: PmAssignmentStaffResponse = {
  manager: { twobigha: [], crm: [] },
  legal: { twobigha: [], crm: [] },
  field: { twobigha: [], crm: [] },
};

function StageRail({ stage }: { stage?: string }) {
  const activeIdx = PM_STAGE_RAIL.findIndex((s) =>
    (s.match as string[]).includes(stage || ""),
  );
  return (
    <ol className="flex flex-wrap gap-2">
      {PM_STAGE_RAIL.map((s, i) => {
        const done = activeIdx > i;
        const active = activeIdx === i;
        return (
          <li
            key={s.key}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              done && "border-emerald-200 bg-emerald-50 text-emerald-700",
              active && "border-sky-300 bg-sky-50 text-sky-800",
              !done && !active && "border-slate-200 bg-white text-slate-400",
            )}
          >
            {done ? <Check size={12} /> : <span className="tabular-nums">{i + 1}</span>}
            {s.key}
          </li>
        );
      })}
    </ol>
  );
}

function ChecklistEditor({
  items,
  onChange,
  disabled,
}: {
  items: PmChecklistItem[];
  onChange: (next: PmChecklistItem[]) => void;
  disabled?: boolean;
}) {
  return (
    <ul className="space-y-2">
      {items.map((item, idx) => (
        <li key={item.id} className="rounded-md border border-[var(--border-color)] px-3 py-2">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={item.checked}
              disabled={disabled}
              onChange={(e) => {
                const next = [...items];
                next[idx] = { ...item, checked: e.target.checked };
                onChange(next);
              }}
            />
            <span className="min-w-0 flex-1">
              <span className="font-medium text-[var(--text-main)]">{item.label}</span>
              <input
                type="text"
                disabled={disabled}
                value={item.note || ""}
                placeholder="Note…"
                className="mt-1 w-full rounded border border-[var(--border-color)] bg-white px-2 py-1 text-xs"
                onChange={(e) => {
                  const next = [...items];
                  next[idx] = { ...item, note: e.target.value };
                  onChange(next);
                }}
              />
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/** RM → Legal → Field Agent assignment (process-flow + handbook assign/reAssign). */
export default function PmWorkflowPanel({ listing, onUpdated }: Props) {
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
  const [rejectReason, setRejectReason] = useState("");

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
      onUpdated(next);
      if (next.pmAssignmentSyncStatus === "failed") {
        toast.error(next.pmAssignmentSyncError || "2bigha assignment did not sync");
      } else if (next.pmAssignmentSyncStatus === "skipped") {
        toast.message(next.pmAssignmentSyncError || "Saved in CRM — 2bigha managed-property id not set yet");
      } else {
        toast.success(okMsg);
      }
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string | string[] } } };
      const fromApi = ax?.response?.data?.message;
      const message = Array.isArray(fromApi)
        ? fromApi.join(", ")
        : typeof fromApi === "string" && fromApi
          ? fromApi
          : e instanceof Error
            ? e.message
            : "Action failed";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const stage = listing.pmStage || "Property Submitted";
  const legal = listing.legalVerification;
  const visit = listing.fieldVisit;
  const report = listing.visitReport;
  const hasRm = Boolean(listing.rmAssigneeName);

  return (
    <div className="space-y-4 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-main)]">PM pipeline</h3>
          <p className="text-xs text-[var(--text-muted)]">
            Assign the Regional Manager, then Legal Manager and Field Agent. Same RM stays on the case (
            <code className="text-[10px]">reAssignPropertyToManager</code> for hand-offs).
          </p>
        </div>
        {listing.pmStage ? (
          <CrmStatusBadge tone={pmStageBadgeTone(listing.pmStage)}>{listing.pmStage}</CrmStatusBadge>
        ) : null}
      </div>

      <StageRail stage={stage} />

      <div className="grid gap-3 text-xs text-[var(--text-muted)] sm:grid-cols-3">
        <p>
          <span className="font-semibold text-[var(--text-main)]">RM:</span>{" "}
          {listing.rmAssigneeName || "—"}
        </p>
        <p>
          <span className="font-semibold text-[var(--text-main)]">Legal:</span>{" "}
          {listing.legalAssigneeName || "—"}
        </p>
        <p>
          <span className="font-semibold text-[var(--text-main)]">Field:</span>{" "}
          {listing.fieldAssigneeName || "—"}
        </p>
      </div>

      {listing.pmAssignmentSyncError ? (
        <p className="text-[11px] text-amber-800">
          2bigha: {listing.pmAssignmentSyncStatus || "skipped"} — {listing.pmAssignmentSyncError}{" "}
          <Link href="/crm/settings/twobigha-sync" className="underline">
            Reconcile agents
          </Link>
        </p>
      ) : (
        <p className="text-[11px] text-[var(--text-muted)]">
          Staff lists: 2bigha PM roster + CRM team.{" "}
          <Link href="/crm/settings/twobigha-sync" className="underline">
            Settings → 2bigha Sync
          </Link>
        </p>
      )}

      {busy || staffLoading ? (
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <Loader2 size={14} className="animate-spin" /> {staffLoading ? "Loading staff…" : "Working…"}
        </div>
      ) : null}

      <section className="space-y-2 rounded-lg border border-dashed border-[var(--border-color)] p-3">
        <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
          {listing.rmAssigneeName ? "Reassign Regional Manager" : "Assign Regional Manager"}
        </h4>
        <div className="flex flex-wrap items-end gap-2">
          <PmAssigneeSelect
            label="Regional Manager"
            pool={staff.manager}
            value={rmValue}
            onChange={(pick, raw) => {
              setRmPick(pick);
              setRmValue(raw);
            }}
          />
          <CrmButton
            disabled={busy || staffLoading || !rmPick}
            onClick={() =>
              rmPick &&
              void run(
                () => assignPmToRm(listing._id, rmPick),
                listing.rmAssigneeName ? "RM reassigned" : "Assigned to RM",
              )
            }
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {listing.rmAssigneeName ? "Reassign RM" : "Assign RM"}
          </CrmButton>
          {listing.rmAssigneeName ? (
            <CrmButton
              disabled={busy}
              variant="secondary"
              onClick={() =>
                void run(() => unassignPmStaff(listing._id, "manager").then((r) => r.listing), "RM unassigned")
              }
            >
              Unassign
            </CrmButton>
          ) : null}
        </div>
      </section>

      <section className="space-y-2 rounded-lg border border-dashed border-[var(--border-color)] p-3">
        <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
          {listing.legalAssigneeName ? "Reassign Legal Manager" : "Assign Legal Manager"}
        </h4>
        <div className="flex flex-wrap items-end gap-2">
          <PmAssigneeSelect
            label="Legal Manager"
            pool={staff.legal}
            value={legalValue}
            onChange={(pick, raw) => {
              setLegalPick(pick);
              setLegalValue(raw);
            }}
          />
          <CrmButton
            disabled={busy || staffLoading || !legalPick || !hasRm}
            onClick={() =>
              legalPick &&
              void run(
                () => assignPmToLegal(listing._id, legalPick),
                listing.legalAssigneeName ? "Legal reassigned" : "Assigned to Legal",
              )
            }
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {listing.legalAssigneeName ? "Reassign Legal" : "Assign Legal"}
          </CrmButton>
          {listing.legalAssigneeName ? (
            <CrmButton
              disabled={busy}
              variant="secondary"
              onClick={() =>
                void run(() => unassignPmStaff(listing._id, "legal").then((r) => r.listing), "Legal unassigned")
              }
            >
              Unassign
            </CrmButton>
          ) : null}
        </div>
        {!hasRm ? (
          <p className="text-[11px] text-[var(--text-muted)]">Assign an RM first — the same RM owns legal hand-off.</p>
        ) : null}
      </section>

      <section className="space-y-2 rounded-lg border border-dashed border-[var(--border-color)] p-3">
        <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
          {listing.fieldAssigneeName ? "Reassign Field Agent" : "Assign Field Agent"}
        </h4>
        <div className="flex flex-wrap items-end gap-2">
          <PmAssigneeSelect
            label="Field Agent"
            pool={staff.field}
            value={fieldValue}
            onChange={(pick, raw) => {
              setFieldPick(pick);
              setFieldValue(raw);
            }}
          />
          <CrmButton
            disabled={busy || staffLoading || !fieldPick || !hasRm}
            onClick={() =>
              fieldPick &&
              void run(
                () => assignPmToFieldAgent(listing._id, fieldPick),
                listing.fieldAssigneeName ? "Field agent reassigned" : "Assigned to Field Agent",
              )
            }
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {listing.fieldAssigneeName ? "Reassign Field Agent" : "Assign Field Agent"}
          </CrmButton>
          {listing.fieldAssigneeName ? (
            <CrmButton
              disabled={busy}
              variant="secondary"
              onClick={() =>
                void run(() => unassignPmStaff(listing._id, "field").then((r) => r.listing), "Field agent unassigned")
              }
            >
              Unassign
            </CrmButton>
          ) : null}
        </div>
      </section>

      {/* Legal verification stays stage-gated; assignment pickers above are always available. */}
      {stage === "Assigned to Legal" && (
        <section className="space-y-3 rounded-lg border border-dashed border-[var(--border-color)] p-3">
          <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
            Legal verification
          </h4>
          <p className="text-xs text-[var(--text-muted)]">
            Status: <strong>{legal?.status || "Not started"}</strong>
            {legal?.startedAt
              ? ` · started ${new Date(legal.startedAt).toLocaleString()}`
              : ""}
          </p>
          <div>
            <CrmLabel>Summary note</CrmLabel>
            <CrmTextarea
              value={legalSummary}
              onChange={(e) => setLegalSummary(e.target.value)}
              className="mt-1"
              placeholder="What you’re reviewing…"
            />
          </div>
          {legal?.checklist ? (
            <ChecklistEditor
              items={legal.checklist}
              disabled={busy || legal.status === "Completed"}
              onChange={(checklist) => {
                void (async () => {
                  try {
                    const next = await updatePmLegalChecklist(
                      listing._id,
                      checklist,
                      legalSummary,
                    );
                    onUpdated(next);
                  } catch {
                    toast.error("Could not save checklist");
                  }
                })();
              }}
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
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
        </section>
      )}

      {/* §7 Field visit */}
      {stage === "Assigned to Field Agent" && (
        <section className="space-y-3 rounded-lg border border-dashed border-[var(--border-color)] p-3">
          <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
            Field visit
          </h4>
          <p className="text-xs text-[var(--text-muted)]">
            Visit status: <strong>{visit?.status || "Pending"}</strong>
            {visit?.scheduledAt
              ? ` · scheduled ${new Date(visit.scheduledAt).toLocaleString()}`
              : ""}
          </p>
          <div>
            <CrmLabel>Visit notes</CrmLabel>
            <CrmTextarea
              value={visitNotes}
              onChange={(e) => setVisitNotes(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="flex flex-wrap gap-2">
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
            {visit?.status === "Complete" ? (
              <CrmButton
                disabled={busy}
                className="bg-sky-600 hover:bg-sky-700"
                onClick={() =>
                  void run(() => submitPmVisitReport(listing._id), "Visit report submitted")
                }
              >
                Submit visit report
              </CrmButton>
            ) : null}
          </div>
        </section>
      )}

      {/* §8 Report approval */}
      {(stage === "Visit Report Pending" ||
        stage === "Visit Report Approved" ||
        stage === "Visit Report Rejected") && (
        <section className="space-y-3 rounded-lg border border-dashed border-[var(--border-color)] p-3">
          <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
            Field visit report — RM review
          </h4>
          <p className="text-xs text-[var(--text-muted)]">
            Report: <strong>{report?.status || "—"}</strong>
            {report?.submittedAt
              ? ` · submitted ${new Date(report.submittedAt).toLocaleString()}`
              : ""}
          </p>
          {report?.sections ? (
            <ChecklistEditor
              items={report.sections}
              disabled={busy || report.status !== "Pending"}
              onChange={() => {
                /* sections signed off at approve time */
              }}
            />
          ) : null}
          {report?.status === "Pending" ? (
            <>
              <div>
                <CrmLabel>Rejection reason (if rejecting)</CrmLabel>
                <CrmInput
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="mt-1"
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
                  Approve report
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
                  Reject report
                </CrmButton>
              </div>
            </>
          ) : report?.rejectionReason ? (
            <p className="text-xs text-rose-600">Reason: {report.rejectionReason}</p>
          ) : null}
        </section>
      )}
    </div>
  );
}
