"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import CRMDateRangePicker from "@/components/crm/CRMDateRangePicker";
import CrmSlidePanelShell from "@/components/crm/shell/CrmSlidePanelShell";
import {
  FORM_SUBMISSION_STATUS_LABELS,
  formatAnswerValue,
  listSubmissions,
  submissionsToCsv,
  type FormField,
  type FormSubmission,
  type FormSubmissionStatus,
} from "@/lib/crm/forms";
import { CRM_BTN_ICON, CRM_BTN_SECONDARY, CRM_INPUT, CRM_TOOLBAR_SELECT } from "@/lib/crm/ui";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

const STATUS_BADGE: Record<FormSubmissionStatus, string> = {
  created_lead: "bg-emerald-50 text-emerald-700",
  merged_into_existing: "bg-amber-50 text-amber-700",
  failed: "bg-rose-50 text-rose-700",
};

function StatusBadge({ status }: { status: FormSubmissionStatus }) {
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap", STATUS_BADGE[status])}>
      {FORM_SUBMISSION_STATUS_LABELS[status] || status}
    </span>
  );
}

export default function FormSubmissionsTab({ formId, fields }: { formId: string; fields: FormField[] }) {
  const [items, setItems] = useState<FormSubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [q, setQ] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [status, setStatus] = useState<FormSubmissionStatus | "">("");
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [rangeKey, setRangeKey] = useState(0);
  const [selected, setSelected] = useState<FormSubmission | null>(null);

  const query = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      status,
      q: qApplied,
      from: range?.from,
      to: range?.to,
    }),
    [page, status, qApplied, range],
  );

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listSubmissions(formId, query);
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      console.error("Failed to fetch submissions:", err);
      toast.error("Failed to load submissions");
    } finally {
      setLoading(false);
    }
  }, [formId, query]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = q.trim();
      setQApplied((prev) => (prev === next ? prev : next));
      setPage(1);
    }, 350);
    return () => window.clearTimeout(t);
  }, [q]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const previewFields = fields.slice(0, 4);
  const hasFilters = Boolean(status || qApplied || range);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setQApplied(q.trim());
  };

  const handleStatus = (value: FormSubmissionStatus | "") => {
    setPage(1);
    setStatus(value);
  };

  const handleRange = (next: { from: string; to: string } | null) => {
    setPage(1);
    setRange(next);
  };

  const clearFilters = () => {
    setQ("");
    setQApplied("");
    setStatus("");
    setRange(null);
    setRangeKey((k) => k + 1);
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const all: FormSubmission[] = [];
      let p = 1;
      while (p <= 20) {
        const res = await listSubmissions(formId, {
          ...query,
          page: p,
          limit: 100,
        });
        all.push(...res.items);
        if (all.length >= res.total || res.items.length === 0) break;
        p += 1;
      }
      const csv = submissionsToCsv(fields, all);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `form-submissions-${formId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${all.length} submission${all.length === 1 ? "" : "s"}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to export submissions");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 overflow-visible">
      <div className="crm-form-submissions-toolbar relative z-20 flex flex-wrap items-center gap-2">
        <form onSubmit={handleSearch} className="relative min-w-[200px] flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            className={`${CRM_INPUT} pl-8`}
            placeholder="Search answers, UTM, referrer…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
        <select
          className={CRM_TOOLBAR_SELECT}
          value={status}
          onChange={(e) => handleStatus(e.target.value as FormSubmissionStatus | "")}
        >
          <option value="">All statuses</option>
          <option value="created_lead">New lead</option>
          <option value="merged_into_existing">Merged</option>
          <option value="failed">Failed</option>
        </select>
        <CRMDateRangePicker key={rangeKey} onChange={handleRange} />
        {hasFilters && (
          <button type="button" onClick={clearFilters} className={CRM_BTN_SECONDARY}>
            <X size={14} /> Clear
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={fetchRows} className={CRM_BTN_ICON} title="Refresh">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button type="button" onClick={handleExport} disabled={exporting || total === 0} className={CRM_BTN_SECONDARY}>
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Export CSV
          </button>
        </div>
      </div>

      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
        {total} submission{total === 1 ? "" : "s"}
        {hasFilters ? " matching filters" : ""}
      </p>

      {loading ? (
        <div className="py-16 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-[var(--text-muted)]" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center text-center">
          <Users size={28} className="text-[var(--text-muted)] mb-3" />
          <p className="text-sm font-semibold text-[var(--text-main)]">
            {hasFilters ? "No submissions match these filters" : "No submissions yet"}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {hasFilters
              ? "Try a different date range, status, or search term."
              : "Submissions will appear here as they come in."}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border-color)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-[var(--text-muted)] border-b border-[var(--border-color)] bg-[var(--background)]">
                  <th className="py-2.5 px-3">Submitted</th>
                  {previewFields.map((f) => (
                    <th key={f.key} className="py-2.5 px-3">
                      {f.label}
                    </th>
                  ))}
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Source</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr
                    key={s._id}
                    onClick={() => setSelected(s)}
                    className="border-b border-[var(--border-color)] last:border-0 cursor-pointer hover:bg-[var(--background)] transition-colors"
                  >
                    <td className="py-2.5 px-3 text-[var(--text-muted)] whitespace-nowrap">
                      {new Date(s.createdAt).toLocaleString()}
                    </td>
                    {previewFields.map((f) => (
                      <td key={f.key} className="py-2.5 px-3 text-[var(--text-main)] max-w-[180px] truncate">
                        {formatAnswerValue(s.answers?.[f.key])}
                      </td>
                    ))}
                    <td className="py-2.5 px-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="py-2.5 px-3 text-[var(--text-muted)] max-w-[140px] truncate">
                      {s.utm?.source || s.referrer || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-[var(--text-muted)]">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className={CRM_BTN_ICON}
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className={CRM_BTN_ICON}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <CrmSlidePanelShell
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title="Submission"
        subtitle={selected ? new Date(selected.createdAt).toLocaleString() : undefined}
        maxWidthClass="max-w-lg"
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={selected.status} />
              {selected.leadId && (
                <Link
                  href={`/crm/leads/${selected.leadId}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)] hover:underline"
                >
                  Open lead <ExternalLink size={11} />
                </Link>
              )}
            </div>
            {selected.error && (
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-[var(--radius-md)] px-3 py-2">
                {selected.error}
              </p>
            )}
            <div>
              <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Answers</p>
              <dl className="space-y-2">
                {fields.map((f) => (
                  <div key={f.key} className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--background)] px-3 py-2">
                    <dt className="text-[11px] font-semibold text-[var(--text-muted)]">{f.label}</dt>
                    <dd className="text-sm text-[var(--text-main)] mt-0.5 break-words">
                      {formatAnswerValue(selected.answers?.[f.key])}
                    </dd>
                  </div>
                ))}
                {fields.length === 0 &&
                  Object.entries(selected.answers || {}).map(([key, value]) => (
                    <div key={key} className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--background)] px-3 py-2">
                      <dt className="text-[11px] font-semibold text-[var(--text-muted)]">{key}</dt>
                      <dd className="text-sm text-[var(--text-main)] mt-0.5 break-words">{formatAnswerValue(value)}</dd>
                    </div>
                  ))}
              </dl>
            </div>
            {(selected.utm?.source || selected.utm?.campaign || selected.referrer) && (
              <div>
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                  Attribution
                </p>
                <div className="text-sm text-[var(--text-main)] space-y-1">
                  {selected.utm?.source && <p>Source: {selected.utm.source}</p>}
                  {selected.utm?.medium && <p>Medium: {selected.utm.medium}</p>}
                  {selected.utm?.campaign && <p>Campaign: {selected.utm.campaign}</p>}
                  {selected.referrer && <p className="break-all">Referrer: {selected.referrer}</p>}
                </div>
              </div>
            )}
          </div>
        )}
      </CrmSlidePanelShell>
    </div>
  );
}
