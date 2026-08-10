"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ShieldAlert, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  analyzeEmailSpamContent,
  spamScoreBand,
  spamScoreLabel,
  type EmailSpamCheckResult,
} from "@/lib/crm/spam-word-checker";
import { SPAM_PHRASE_DATABASE } from "@/lib/crm/spam-word-database";

type EmailSpamWordCheckerPanelProps = {
  subject: string;
  bodyHtml: string;
  className?: string;
  /** Show compact single-line summary only */
  compact?: boolean;
};

function ScoreBadge({ score }: { score: number }) {
  const band = spamScoreBand(score);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-black tabular-nums',
        band === 'good' && 'bg-emerald-50 text-emerald-800 border border-emerald-200',
        band === 'warn' && 'bg-amber-50 text-amber-900 border border-amber-200',
        band === 'bad' && 'bg-rose-50 text-rose-800 border border-rose-200',
      )}
    >
      {band === 'good' ? (
        <CheckCircle2 size={12} className="shrink-0" />
      ) : (
        <AlertTriangle size={12} className="shrink-0" />
      )}
      {score}/100
    </span>
  );
}

function severityChip(severity: string) {
  const s = severity.toLowerCase();
  return (
    <span
      className={cn(
        'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider',
        s === 'critical' && 'bg-rose-100 text-rose-800',
        s === 'high' && 'bg-orange-100 text-orange-900',
        s === 'medium' && 'bg-amber-100 text-amber-900',
        s === 'low' && 'bg-slate-100 text-slate-600',
      )}
    >
      {severity}
    </span>
  );
}

function MatchList({ result }: { result: EmailSpamCheckResult }) {
  const items = [
    ...result.matches.map((m) => ({
      key: `${m.location}-${m.phrase}`,
      label: `"${m.phrase}"`,
      sub: m.location === 'subject' ? 'Subject' : 'Body',
      severity: m.severity,
      suggestion: m.suggestion,
    })),
    ...result.structuralFlags.map((f) => ({
      key: f.id,
      label: f.label,
      sub: 'Structure',
      severity: 'high' as const,
      suggestion: undefined as string | undefined,
    })),
  ];

  if (!items.length) {
    return (
      <p className="text-xs text-emerald-800 leading-snug">
        No common spam trigger words detected. Authentication and warmup still affect inbox placement.
      </p>
    );
  }

  return (
    <ul className="max-h-40 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
      {items.map((item) => (
        <li
          key={item.key}
          className="flex flex-col gap-0.5 rounded-lg border border-[var(--border-color)] bg-white px-2.5 py-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            {severityChip(item.severity)}
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              {item.sub}
            </span>
            <span className="text-xs font-semibold text-[var(--text-main)]">{item.label}</span>
          </div>
          {item.suggestion ? (
            <p className="text-[11px] text-[var(--text-muted)] leading-snug">
              Try: <span className="font-medium text-[var(--text-main)]">{item.suggestion}</span>
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default function EmailSpamWordCheckerPanel({
  subject,
  bodyHtml,
  className,
  compact = false,
}: EmailSpamWordCheckerPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const result = useMemo(
    () => analyzeEmailSpamContent(subject, bodyHtml),
    [subject, bodyHtml],
  );

  const issueCount = result.matches.length + result.structuralFlags.length;
  const band = spamScoreBand(result.score);

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 text-xs',
          className,
        )}
        title={spamScoreLabel(result.score)}
      >
        <ScoreBadge score={result.score} />
        {issueCount > 0 ? (
          <span className="text-[var(--text-muted)] font-medium">
            {issueCount} trigger{issueCount === 1 ? '' : 's'}
          </span>
        ) : (
          <span className="text-emerald-700 font-medium">Looks clean</span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-[var(--crm-radius-ui)] border text-sm',
        band === 'good' && 'border-emerald-200/80 bg-emerald-50/40',
        band === 'warn' && 'border-amber-200/80 bg-amber-50/50',
        band === 'bad' && 'border-rose-200/80 bg-rose-50/50',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:opacity-90 transition-opacity"
      >
        <ShieldAlert
          size={16}
          className={cn(
            'shrink-0',
            band === 'good' && 'text-emerald-600',
            band === 'warn' && 'text-amber-700',
            band === 'bad' && 'text-rose-600',
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[var(--text-main)]">
              Spam word check
            </span>
            <ScoreBadge score={result.score} />
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">
              {spamScoreLabel(result.score)}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)] leading-snug">
            {issueCount === 0
              ? `Scans subject and body against ${SPAM_PHRASE_DATABASE.length} known trigger phrases in real time.`
              : `${issueCount} issue${issueCount === 1 ? '' : 's'} — rephrase flagged phrases before sending.`}
          </p>
        </div>
        <ChevronDown
          size={16}
          className={cn(
            'shrink-0 text-[var(--text-muted)] transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {expanded && (
        <div className="border-t border-[var(--border-color)]/60 px-3 py-3 space-y-2">
          <MatchList result={result} />
          <p className="flex items-start gap-1.5 text-[10px] text-[var(--text-muted)] leading-snug">
            <Info size={11} className="shrink-0 mt-0.5" />
            Aim for 80+ before bulk or cold outreach. This runs locally in your browser; content is not uploaded.
          </p>
        </div>
      )}
    </div>
  );
}
