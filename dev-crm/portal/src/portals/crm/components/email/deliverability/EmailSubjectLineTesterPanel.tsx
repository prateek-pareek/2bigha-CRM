"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Circle,
  Info,
  Mail,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import DeliverabilityPillarsCallout from "@/components/crm/email/deliverability/DeliverabilityPillarsCallout";
import { analyzeEmailSpamContent, spamScoreBand } from "@/lib/crm/spam-word-checker";
import {
  analyzeEmailDeliverability,
  deliverabilityScoreLabel,
  IDEAL_SUBJECT_CHARS,
  type DeliverabilityCheckItem,
  type DeliverabilityCheckStatus,
  type EmailDeliverabilityAnalysis,
  type EmailDeliverabilityOptions,
} from "@/lib/crm/subject-line-tester";

type EmailSubjectLineTesterPanelProps = {
  subject: string;
  bodyHtml: string;
  className?: string;
  compact?: boolean;
  commercialMailingAddress?: string;
  deliverabilityOptions?: EmailDeliverabilityOptions;
};

function ScoreBadge({ score, prefix }: { score: number; prefix?: string }) {
  const band = spamScoreBand(score);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-black tabular-nums",
        band === "good" && "border border-emerald-200 bg-emerald-50 text-emerald-800",
        band === "warn" && "border border-amber-200 bg-amber-50 text-amber-900",
        band === "bad" && "border border-rose-200 bg-rose-50 text-rose-800",
      )}
    >
      {band === "good" ? (
        <CheckCircle2 size={12} className="shrink-0" />
      ) : (
        <AlertTriangle size={12} className="shrink-0" />
      )}
      {prefix ? `${prefix} ` : ""}
      {score}/100
    </span>
  );
}

function StatusIcon({ status }: { status: DeliverabilityCheckStatus }) {
  if (status === "pass") {
    return <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />;
  }
  if (status === "warn") {
    return <AlertTriangle size={14} className="shrink-0 text-amber-600" />;
  }
  if (status === "fail") {
    return <XCircle size={14} className="shrink-0 text-rose-600" />;
  }
  return <Circle size={14} className="shrink-0 text-slate-400" />;
}

function ChecklistSection({
  title,
  checks,
}: {
  title: string;
  checks: DeliverabilityCheckItem[];
}) {
  if (!checks.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold text-[var(--text-muted)]">
        {title}
      </p>
      <ul className="space-y-1.5">
        {checks.map((c) => (
          <li
            key={c.id}
            className={cn(
              "flex gap-2 rounded-lg border px-2.5 py-2 text-xs",
              c.status === "pass" && "border-emerald-100 bg-white",
              c.status === "warn" && "border-amber-100 bg-amber-50/30",
              c.status === "fail" && "border-rose-100 bg-rose-50/40",
            )}
          >
            <StatusIcon status={c.status} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[var(--text-main)]">{c.label}</p>
              <p className="text-[11px] leading-snug text-[var(--text-muted)]">{c.message}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompactSummary({ analysis }: { analysis: EmailDeliverabilityAnalysis }) {
  const fail = analysis.allChecks.filter((c) => c.status === "fail").length;
  const warn = analysis.allChecks.filter((c) => c.status === "warn").length;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <ScoreBadge score={analysis.overallScore} />
      <span className="text-[var(--text-muted)] font-medium">
        Subj {analysis.subjectCharCount}/{IDEAL_SUBJECT_CHARS} chars
      </span>
      {fail > 0 ? (
        <span className="font-medium text-rose-700">{fail} failed</span>
      ) : warn > 0 ? (
        <span className="font-medium text-amber-800">{warn} warning{warn === 1 ? "" : "s"}</span>
      ) : (
        <span className="font-medium text-emerald-700">Checks passed</span>
      )}
    </div>
  );
}

export default function EmailSubjectLineTesterPanel({
  subject,
  bodyHtml,
  className,
  compact = false,
  commercialMailingAddress,
  deliverabilityOptions,
}: EmailSubjectLineTesterPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const analysis = useMemo(() => {
    const spam = analyzeEmailSpamContent(subject, bodyHtml);
    return analyzeEmailDeliverability(subject, bodyHtml, spam, {
      commercialMailingAddress,
      ...deliverabilityOptions,
    });
  }, [subject, bodyHtml, commercialMailingAddress, deliverabilityOptions]);

  const band = spamScoreBand(analysis.overallScore);
  const issueCount = analysis.allChecks.filter((c) => c.status !== "pass").length;

  if (compact) {
    return (
      <div className={cn("min-w-0", className)} title={deliverabilityScoreLabel(analysis.overallScore)}>
        <CompactSummary analysis={analysis} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-[var(--crm-radius-ui)] border text-sm",
        band === "good" && "border-sky-200/80 bg-sky-50/40",
        band === "warn" && "border-amber-200/80 bg-amber-50/50",
        band === "bad" && "border-rose-200/80 bg-rose-50/50",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-opacity hover:opacity-90"
      >
        <Mail
          size={16}
          className={cn(
            "shrink-0",
            band === "good" && "text-sky-600",
            band === "warn" && "text-amber-700",
            band === "bad" && "text-rose-600",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[var(--text-main)]">
              Subject & body tester
            </span>
            <ScoreBadge score={analysis.overallScore} />
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">
              {deliverabilityScoreLabel(analysis.overallScore)}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--text-muted)]">
            {issueCount === 0
              ? `Real-time checks on subject (${analysis.subjectCharCount}/${IDEAL_SUBJECT_CHARS} chars) and body — like a subject-line tester.`
              : `${issueCount} check${issueCount === 1 ? "" : "s"} need attention — expand for pass/fail checklist.`}
          </p>
        </div>
        <ChevronDown
          size={16}
          className={cn(
            "shrink-0 text-[var(--text-muted)] transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-[var(--border-color)]/60 px-3 py-3">
          <div className="flex flex-wrap gap-2">
            <ScoreBadge score={analysis.subjectScore} prefix="Subject" />
            <ScoreBadge score={analysis.bodyScore} prefix="Body" />
            <ScoreBadge score={analysis.spam.score} prefix="Spam" />
          </div>
          <ChecklistSection title="Subject line" checks={analysis.subjectChecks} />
          <ChecklistSection title="Email body" checks={analysis.bodyChecks} />
          <DeliverabilityPillarsCallout compact className="border-amber-200/60 from-amber-50/40" />
          <p className="flex items-start gap-1.5 text-[10px] leading-snug text-[var(--text-muted)]">
            <Info size={11} className="mt-0.5 shrink-0" />
            Content score is one piece — replies and engagement matter more to inbox providers.
            Aim for 80+ before cold sends. Checks run locally in your browser.
          </p>
        </div>
      )}
    </div>
  );
}

/** Inline counter for the subject input row */
export function SubjectLineCharHint({
  subject,
  className,
}: {
  subject: string;
  className?: string;
}) {
  const len = (subject || "").length;
  const band =
    len === 0 ? "muted" : len <= IDEAL_SUBJECT_CHARS ? "good" : len <= 70 ? "warn" : "bad";
  return (
    <span
      className={cn(
        "shrink-0 text-[10px] font-bold tabular-nums",
        band === "good" && "text-emerald-700",
        band === "warn" && "text-amber-700",
        band === "bad" && "text-rose-700",
        band === "muted" && "text-[var(--text-muted)]",
        className,
      )}
      title={`Ideal subject length is ${IDEAL_SUBJECT_CHARS} characters or fewer`}
    >
      {len}/{IDEAL_SUBJECT_CHARS}
    </span>
  );
}
