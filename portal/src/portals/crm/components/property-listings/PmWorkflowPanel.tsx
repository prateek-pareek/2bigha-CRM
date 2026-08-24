"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CrmButton, CrmInput, CrmLabel, CrmSelect, CrmStatusBadge, CrmTextarea } from "@/components/crm/ui";
import {
  PM_FIELD_POOL,
  PM_LEGAL_POOL,
  PM_RM_POOL,
  assignPmToFieldAgent,
  assignPmToLegal,
  assignPmToRm,
  completePmLegalVerification,
  reviewPmVisitReport,
  setPmFieldVisitStatus,
  startPmLegalVerification,
  submitPmVisitReport,
  updatePmLegalChecklist,
} from "@/lib/crm/property-management/pm-api";
import {
  PM_STAGE_RAIL,
  pmStageBadgeTone,
  type PmChecklistItem,
} from "@/lib/crm/property-management/types";
import type { PropertyListingRecord } from "@/lib/crm/property-listings/types";

type Props = {
  listing: PropertyListingRecord;
  onUpdated: (next: PropertyListingRecord) => void;
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

/** RM → Legal → Field Agent workflow actions (doc §§5–8), mock third-party. */
export default function PmWorkflowPanel({ listing, onUpdated }: Props) {
  const [busy, setBusy] = useState(false);
  const [rmPick, setRmPick] = useState(PM_RM_POOL[0]);
  const [legalPick, setLegalPick] = useState(PM_LEGAL_POOL[0]);
  const [fieldPick, setFieldPick] = useState(PM_FIELD_POOL[0]);
  const [legalSummary, setLegalSummary] = useState(listing.legalVerification?.summary || "");
  const [visitNotes, setVisitNotes] = useState(listing.fieldVisit?.notes || "");
  const [rejectReason, setRejectReason] = useState("");

  const run = async (fn: () => Promise<PropertyListingRecord>, okMsg: string) => {
    setBusy(true);
    try {
      const next = await fn();
      onUpdated(next);
      toast.success(okMsg);
    } catch {
      toast.error("Action failed");
    } finally {
      setBusy(false);
    }
  };

  const stage = listing.pmStage || "Property Submitted";
  const legal = listing.legalVerification;
  const visit = listing.fieldVisit;
  const report = listing.visitReport;

  return (
    <div className="space-y-4 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-main)]">PM pipeline</h3>
          <p className="text-xs text-[var(--text-muted)]">
            Current stage tasks — mock third-party workflow
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

      {busy ? (
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <Loader2 size={14} className="animate-spin" /> Working…
        </div>
      ) : null}

      {/* §5 RM: take ownership */}
      {(stage === "Property Submitted" || !listing.rmAssigneeName) && (
        <section className="space-y-2 rounded-lg border border-dashed border-[var(--border-color)] p-3">
          <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
            RM — take ownership
          </h4>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[180px] flex-1">
              <CrmLabel>Regional Manager</CrmLabel>
              <CrmSelect value={rmPick} onChange={(e) => setRmPick(e.target.value)} className="mt-1">
                {PM_RM_POOL.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </CrmSelect>
            </div>
            <CrmButton
              disabled={busy}
              onClick={() =>
                void run(() => assignPmToRm(listing._id, rmPick), "Assigned to RM")
              }
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Assign RM
            </CrmButton>
          </div>
        </section>
      )}

      {/* §5 RM: assign legal */}
      {stage === "Assigned to RM" && (
        <section className="space-y-2 rounded-lg border border-dashed border-[var(--border-color)] p-3">
          <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
            RM — assign Legal Manager
          </h4>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[180px] flex-1">
              <CrmLabel>Legal Manager</CrmLabel>
              <CrmSelect
                value={legalPick}
                onChange={(e) => setLegalPick(e.target.value)}
                className="mt-1"
              >
                {PM_LEGAL_POOL.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </CrmSelect>
            </div>
            <CrmButton
              disabled={busy}
              onClick={() =>
                void run(() => assignPmToLegal(listing._id, legalPick), "Assigned to Legal")
              }
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Assign Legal
            </CrmButton>
          </div>
        </section>
      )}

      {/* §6 Legal verification */}
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

          {legal?.status === "Completed" && (
            <div className="flex flex-wrap items-end gap-2 border-t border-[var(--border-color)] pt-3">
              <div className="min-w-[180px] flex-1">
                <CrmLabel>Field Agent</CrmLabel>
                <CrmSelect
                  value={fieldPick}
                  onChange={(e) => setFieldPick(e.target.value)}
                  className="mt-1"
                >
                  {PM_FIELD_POOL.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </CrmSelect>
              </div>
              <CrmButton
                disabled={busy}
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() =>
                  void run(
                    () => assignPmToFieldAgent(listing._id, fieldPick),
                    "Assigned to Field Agent",
                  )
                }
              >
                Assign Field Agent
              </CrmButton>
            </div>
          )}
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
