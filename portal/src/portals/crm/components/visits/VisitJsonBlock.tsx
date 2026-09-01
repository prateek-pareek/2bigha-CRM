"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronDown, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CrmStatusBadge } from "@/components/crm/ui";
import { formatVisitStatus, isVisitUuidLabel } from "@/lib/crm/visits/visit-ui";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function unwrapReview(row: Record<string, unknown>): Record<string, unknown> {
  return isPlainObject(row.review) ? { ...row, ...row.review } : row;
}

function pickStatus(row: Record<string, unknown>): string | undefined {
  const merged = unwrapReview(row);
  const raw = merged.status ?? merged.verdict ?? merged.decision ?? merged.result;
  return raw == null || raw === "" ? undefined : String(raw);
}

function pickReason(row: Record<string, unknown>): string | undefined {
  const merged = unwrapReview(row);
  const raw =
    merged.reason ??
    merged.comment ??
    merged.note ??
    merged.notes ??
    merged.rejectionReason ??
    merged.hint;
  return raw == null || raw === "" ? undefined : String(raw);
}

function pickAnswer(row: Record<string, unknown>): string | undefined {
  const raw = row.answer ?? row.value ?? row.text ?? row.description ?? row.details;
  if (Array.isArray(raw)) {
    const parts = raw.filter((item) => typeof item === "string" && item.trim()) as string[];
    return parts.length ? parts.join(", ") : undefined;
  }
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  if (raw == null || raw === "") return undefined;
  return String(raw);
}

function pickLabel(row: Record<string, unknown>, fallback: string): string {
  const raw = row.title ?? row.section ?? row.name ?? row.label ?? row.key ?? row.itemLabel;
  const text = raw == null ? "" : String(raw).trim();
  if (!text || isVisitUuidLabel(text)) return fallback;
  return text.replace(/_/g, " ");
}

function formatAnswer(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string" && item.trim()).join(", ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value == null) return "";
  return String(value);
}

function statusTone(status?: string) {
  const s = (status || "").toUpperCase();
  if (s.includes("APPROV") || s.includes("PASS") || s === "YES" || s === "OK") return "success" as const;
  if (s.includes("REJECT") || s.includes("FAIL") || s === "NO") return "danger" as const;
  if (s.includes("CHANGE") || s.includes("PENDING") || s.includes("REVIEW")) return "warning" as const;
  return "neutral" as const;
}

function ChecklistRows({ entries }: { entries: [string, unknown][] }) {
  return (
    <ul className="divide-y divide-[var(--border-color)] rounded-[var(--radius-md)] border border-[var(--border-color)]">
      {entries.map(([key, raw]) => {
        const checked =
          raw === true ||
          raw === "yes" ||
          raw === "YES" ||
          (isPlainObject(raw) && (raw.checked === true || raw.value === true || raw.done === true));
        const note = isPlainObject(raw) ? pickReason(raw) || pickAnswer(raw) : undefined;
        const label = isVisitUuidLabel(key) ? note || "Item" : key.replace(/_/g, " ");
        const sub = isVisitUuidLabel(key) ? undefined : note;
        return (
          <li key={key} className="flex items-start gap-2 px-3 py-2 text-[13px]">
            <span
              className={cn(
                "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                checked ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400",
              )}
            >
              {checked ? <Check size={11} /> : <Circle size={8} />}
            </span>
            <span className="min-w-0">
              <span className="font-medium text-[var(--text-main)]">{label}</span>
              {sub ? <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">{sub}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function AnswerRows({ entries }: { entries: [string, unknown][] }) {
  return (
    <ul className="divide-y divide-[var(--border-color)] rounded-[var(--radius-md)] border border-[var(--border-color)]">
      {entries.map(([key, raw]) => {
        const answer = formatAnswer(raw);
        const label = isVisitUuidLabel(key) ? "" : key.replace(/_/g, " ");
        if (!answer && !label) return null;
        return (
          <li key={key} className="px-3 py-2 text-[13px]">
            <p className="font-medium text-[var(--text-main)]">{answer || label}</p>
            {label && answer && label !== answer ? (
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{label}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function ItemRows({ items }: { items: unknown[] }) {
  return (
    <ul className="mt-2 divide-y divide-[var(--border-color)] rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)]/40">
      {items.map((item, i) => {
        if (!isPlainObject(item)) {
          return (
            <li key={i} className="px-3 py-2 text-[13px] text-[var(--text-main)]">
              {String(item)}
            </li>
          );
        }
        const answer = pickAnswer(item);
        const label = pickLabel(item, "");
        const reason = pickReason(item);
        return (
          <li key={i} className="px-3 py-2 text-[13px]">
            <p className="font-medium text-[var(--text-main)]">{answer || label || `Item ${i + 1}`}</p>
            {label && answer && label !== answer ? (
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{label}</p>
            ) : null}
            {reason && reason !== answer ? (
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{reason}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function SectionRow({
  label,
  status,
  reason,
  children,
}: {
  label: string;
  status?: string;
  reason?: string;
  children?: ReactNode;
}) {
  return (
    <li className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[var(--text-main)]">
            {status?.toUpperCase().includes("REJECT")
              ? "❌ "
              : status?.toUpperCase().includes("APPROV")
                ? "✅ "
                : "🗂️ "}
            {label}
          </p>
          {reason ? <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{reason}</p> : null}
        </div>
        {status ? <CrmStatusBadge tone={statusTone(status)}>{formatVisitStatus(status)}</CrmStatusBadge> : null}
      </div>
      {children}
    </li>
  );
}

/** Section RM verdicts, checklists, or other JSON payloads from visit reports. */
export default function VisitJsonBlock({
  value,
  empty = "—",
  collapsedLabel = "Show raw details",
}: {
  value: unknown;
  empty?: string;
  collapsedLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const payload =
    isPlainObject(value) && Array.isArray(value.sections) && value.sections.length ? value.sections : value;

  if (payload == null || payload === "") {
    return <p className="text-sm text-[var(--text-muted)]">{empty}</p>;
  }

  if (typeof payload === "string") {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-main)]">{payload}</p>;
  }

  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return <p className="text-sm text-[var(--text-muted)]">{empty}</p>;
    }
    if (payload.every((item) => typeof item === "string")) {
      return (
        <div className="flex flex-wrap gap-1.5">
          {payload.map((item) => (
            <span
              key={item}
              className="rounded-full border border-[var(--border-color)] bg-[var(--surface-dim)] px-2 py-0.5 text-[12px] text-[var(--text-main)]"
            >
              {item}
            </span>
          ))}
        </div>
      );
    }
    const asItems = payload.every(
      (item) => isPlainObject(item) && ("answer" in item || "itemLabel" in item) && !("items" in item),
    );
    if (asItems) {
      return <ItemRows items={payload} />;
    }
    const asSections = payload.every(
      (item) =>
        isPlainObject(item) &&
        ("section" in item ||
          "name" in item ||
          "status" in item ||
          "key" in item ||
          "title" in item ||
          "review" in item ||
          "items" in item),
    );
    if (asSections) {
      return (
        <ul className="space-y-1.5">
          {payload.map((item, i) => {
            const row = item as Record<string, unknown>;
            const nested = Array.isArray(row.items) ? row.items : null;
            return (
              <SectionRow
                key={i}
                label={pickLabel(row, `Section ${i + 1}`)}
                status={pickStatus(row)}
                reason={pickReason(row)}
              >
                {nested?.length ? <ItemRows items={nested} /> : null}
              </SectionRow>
            );
          })}
        </ul>
      );
    }
  }

  if (isPlainObject(payload)) {
    const entries = Object.entries(payload).filter(([key]) => key !== "allApproved" && key !== "rejectedSections");
    if (entries.length === 0) {
      return <p className="text-sm text-[var(--text-muted)]">{empty}</p>;
    }
    const looksLikeChecklist = entries.every(([, v]) => {
      if (typeof v === "boolean" || v === "yes" || v === "no" || v === "YES" || v === "NO") return true;
      return isPlainObject(v) && ("checked" in v || "value" in v || "done" in v);
    });
    if (looksLikeChecklist) {
      return <ChecklistRows entries={entries} />;
    }
    const looksLikeAnswers = entries.every(([, v]) => {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return true;
      return Array.isArray(v) && v.every((item) => typeof item === "string" || typeof item === "number");
    });
    if (looksLikeAnswers) {
      return <AnswerRows entries={entries} />;
    }
    const looksLikeSections = entries.every(
      ([, v]) => isPlainObject(v) && ("status" in v || "verdict" in v || "decision" in v || "review" in v),
    );
    if (looksLikeSections) {
      return (
        <ul className="space-y-1.5">
          {entries.map(([key, raw]) => {
            const row = raw as Record<string, unknown>;
            return (
              <SectionRow
                key={key}
                label={isVisitUuidLabel(key) ? pickLabel(row, "Section") : key.replace(/_/g, " ")}
                status={pickStatus(row)}
                reason={pickReason(row)}
              />
            );
          })}
        </ul>
      );
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)]"
      >
        <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
        {open ? "Hide raw details" : collapsedLabel}
      </button>
      {open ? (
        <pre className="mt-2 max-h-64 overflow-auto rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)] p-3 text-[11px] leading-relaxed text-[var(--text-main)]">
          {JSON.stringify(payload, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
