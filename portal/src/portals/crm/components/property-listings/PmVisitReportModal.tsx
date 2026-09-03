"use client";

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  FileText,
  Loader2,
  MapPin,
  Star,
  User,
  X,
} from "lucide-react";
import { fetchVisitReportDetail } from "@/lib/crm/property-management/pm-api";
import { CrmButton, CrmStatusBadge } from "@/components/crm/ui";

export interface PmVisitReportSummary {
  status?: string;
  submittedAt?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  conditionRating?: number;
  observations?: string;
  sections?: Array<{ id?: string; label: string; checked?: boolean; note?: string }>;
  agentName?: string;
  issuesFound?: any;
  recommendations?: string;
}

interface PmVisitReportModalProps {
  reportId?: number;
  open: boolean;
  onClose: () => void;
  fallbackSummary?: PmVisitReportSummary;
}

export default function PmVisitReportModal({
  reportId,
  open,
  onClose,
  fallbackSummary,
}: PmVisitReportModalProps) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);

  useEffect(() => {
    if (!open) return;
    if (!reportId) {
      setReport(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchVisitReportDetail(reportId)
      .then((data) => {
        if (!cancelled && data) setReport(data);
      })
      .catch(() => {
        if (!cancelled) setReport(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, reportId]);

  if (!open) return null;

  const status = report?.status || fallbackSummary?.status || "Pending";
  const conditionRating = report?.conditionRating ?? fallbackSummary?.conditionRating;
  const observations =
    report?.observations ||
    fallbackSummary?.observations ||
    "";
  const issuesFound = report?.issuesFound || fallbackSummary?.issuesFound;
  const recommendations =
    report?.recommendations ||
    fallbackSummary?.recommendations ||
    "";
  const submittedAt = report?.submittedAt || fallbackSummary?.submittedAt;
  const reviewedAt = report?.reviewedAt || fallbackSummary?.reviewedAt;
  const rejectionReason = report?.rejectionReason || fallbackSummary?.rejectionReason;
  const agent = report?.agent;
  const agentName =
    agent?.name ||
    [agent?.firstName, agent?.lastName].filter(Boolean).join(" ") ||
    fallbackSummary?.agentName ||
    "";
  const sections =
    report?.checklistResponses ||
    report?.reviewSections ||
    fallbackSummary?.sections ||
    [];

  const tone =
    status === "APPROVED" || status === "Approved"
      ? "success"
      : status === "REJECTED" || status === "Rejected"
        ? "danger"
        : "warning";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-[var(--border-color)] bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
              <FileText size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-[var(--text-main)]">
                  Field Inspection Report
                </h3>
                {reportId ? (
                  <span className="text-xs text-[var(--text-muted)]">#{reportId}</span>
                ) : null}
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Stage 6: Field visit findings & Regional Manager verdict
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-[var(--text-muted)]">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-sky-600" />
              Loading report details from 2bigha…
            </div>
          ) : (
            <>
              {/* Status & Rating Banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-color)] bg-slate-50/70 p-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                    RM Verdict:
                  </span>
                  <CrmStatusBadge tone={tone}>{status}</CrmStatusBadge>
                </div>
                {conditionRating !== undefined && conditionRating !== null ? (
                  <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 border border-amber-200 text-xs font-semibold text-amber-900">
                    <Star size={13} className="fill-amber-400 text-amber-500" />
                    <span>Condition Rating: {conditionRating}/5</span>
                  </div>
                ) : null}
              </div>

              {/* Timing & Agent Meta */}
              <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                <div className="rounded-lg border border-[var(--border-color)] p-3">
                  <span className="flex items-center gap-1.5 font-medium text-[var(--text-muted)]">
                    <Calendar size={13} /> Timestamps
                  </span>
                  <div className="mt-2 space-y-1">
                    <p>
                      <span className="text-slate-500">Submitted:</span>{" "}
                      {submittedAt ? new Date(submittedAt).toLocaleString() : "Recently submitted"}
                    </p>
                    <p>
                      <span className="text-slate-500">Reviewed:</span>{" "}
                      {reviewedAt ? new Date(reviewedAt).toLocaleString() : "Awaiting RM review"}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--border-color)] p-3">
                  <span className="flex items-center gap-1.5 font-medium text-[var(--text-muted)]">
                    <User size={13} /> Inspecting Agent
                  </span>
                  <div className="mt-2">
                    <p className="font-medium text-[var(--text-main)]">
                      {agentName}
                    </p>
                    {agent?.phone ? (
                      <p className="text-slate-500">{agent.phone}</p>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Rejection Alert - only if verdict is Rejected */}
              {(status === "REJECTED" || status === "Rejected") && rejectionReason ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3.5 text-xs text-rose-900">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle size={13} className="text-rose-600" />
                    <span>RM Rejection Note</span>
                  </div>
                  <p className="mt-1 text-rose-800">{rejectionReason}</p>
                </div>
              ) : null}

              {/* Observations */}
              {observations ? (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Field Observations
                  </h4>
                  <p className="rounded-lg border border-[var(--border-color)] bg-white p-3 text-xs leading-relaxed text-[var(--text-main)]">
                    {observations}
                  </p>
                </div>
              ) : null}

              {/* Checklist / Section Findings */}
              {Array.isArray(sections) && sections.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Inspection Checklist & Verification Points
                  </h4>
                  <div className="divide-y divide-slate-100 rounded-lg border border-[var(--border-color)] bg-white">
                    {sections.map((sec, i) => (
                      <div key={i} className="flex items-start justify-between p-2.5 text-xs">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                          <span className="font-medium text-slate-800">{sec.label || sec.name}</span>
                        </div>
                        {sec.note ? (
                          <span className="text-[11px] text-slate-500 italic max-w-xs text-right">
                            {sec.note}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Issues Found */}
              {issuesFound ? (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Issues & Action Items
                  </h4>
                  <div className="rounded-lg border border-[var(--border-color)] bg-white p-3 text-xs text-[var(--text-main)]">
                    {typeof issuesFound === "string" ? (
                      <p>{issuesFound}</p>
                    ) : Array.isArray(issuesFound) ? (
                      <ul className="list-disc space-y-1 pl-4">
                        {issuesFound.map((issue: any, i: number) => (
                          <li key={i}>{typeof issue === "string" ? issue : JSON.stringify(issue)}</li>
                        ))}
                      </ul>
                    ) : (
                      <pre className="text-[11px] whitespace-pre-wrap">{JSON.stringify(issuesFound, null, 2)}</pre>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Recommendations */}
              {recommendations ? (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Recommendations & Add-ons
                  </h4>
                  <p className="rounded-lg border border-[var(--border-color)] bg-white p-3 text-xs leading-relaxed text-[var(--text-main)]">
                    {recommendations}
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-[var(--border-color)] bg-slate-50 px-5 py-3">
          <CrmButton variant="secondary" onClick={onClose}>
            Close
          </CrmButton>
        </div>
      </div>
    </div>
  );
}
