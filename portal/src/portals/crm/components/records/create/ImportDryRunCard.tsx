"use client";

import { useState } from "react";
import { AlertCircle, Loader2, SearchCheck } from "lucide-react";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";

type DryRun = {
  total: number;
  summary: Record<"new" | "duplicate_skip" | "duplicate_merge" | "duplicate_replace" | "blocked" | "invalid" | "owner_error", number>;
  inFileDuplicates: number;
  plannedByOwner: Record<string, number>;
  issues: { rowNumber: number; outcome: string; reason: string }[];
  issuesTruncated: boolean;
};

type Props = {
  buildFile: () => File;
  mapping: Record<string, string>;
  duplicateStrategy: string;
  assignmentJson: string;
  leadVertical?: string;
  /** Re-run is offered again whenever any of these change. */
  disabled?: boolean;
};

const LABELS: [keyof DryRun["summary"], string][] = [
  ["new", "New leads"],
  ["duplicate_skip", "Duplicates skipped"],
  ["duplicate_merge", "Duplicates merged"],
  ["duplicate_replace", "Duplicates replaced"],
  ["blocked", "Blocked (outside your access)"],
  ["owner_error", "Owner not allowed"],
  ["invalid", "Invalid rows"],
];

/** "Check before importing" — server dry-run of duplicates, access and owner assignment. */
export default function ImportDryRunCard({ buildFile, mapping, duplicateStrategy, assignmentJson, leadVertical, disabled }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DryRun | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", buildFile());
      fd.append("mapping", JSON.stringify(mapping));
      fd.append("duplicateStrategy", duplicateStrategy);
      fd.append("assignment", assignmentJson);
      if (leadVertical) fd.append("leadVertical", leadVertical);
      const res = await fetch(`${CRM_API_URL}/crm/import/leads/dry-run`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getCrmAuthToken() || ""}` },
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || "Could not check the file");
      setResult(body as DryRun);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Could not check the file");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-slate-800">Check duplicates & owners</p>
          <p className="text-[11px] text-slate-500">Shows what the import would do, without saving anything.</p>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading || disabled}
          className="flex items-center gap-1.5 rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/5 disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <SearchCheck size={13} />}
          {result ? "Re-check" : "Run check"}
        </button>
      </div>

      {error && (
        <p className="flex items-center gap-1 text-[11px] font-bold text-rose-600">
          <AlertCircle size={12} /> {error}
        </p>
      )}

      {result && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {LABELS.filter(([k]) => result.summary[k] > 0 || k === "new").map(([k, label]) => (
              <div key={k} className="rounded-lg bg-slate-50 p-2.5">
                <p className="text-base font-extrabold text-slate-900">{result.summary[k]}</p>
                <p className="text-[11px] font-medium text-slate-500">{label}</p>
              </div>
            ))}
          </div>
          {result.inFileDuplicates > 0 && (
            <p className="text-[11px] font-medium text-amber-700">
              {result.inFileDuplicates} row(s) repeat a phone/email that appears earlier in this file.
            </p>
          )}
          {Object.keys(result.plannedByOwner).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(result.plannedByOwner).map(([owner, n]) => (
                <span key={owner} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                  {owner}: {n}
                </span>
              ))}
            </div>
          )}
          {result.issues.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 text-[11px]">
              {result.issues.map((i) => (
                <div key={`${i.rowNumber}-${i.outcome}`} className="flex gap-2 border-b border-slate-100 px-3 py-1.5 last:border-0">
                  <span className="w-14 shrink-0 font-mono text-slate-400">Row {i.rowNumber}</span>
                  <span className="text-slate-700">{i.reason}</span>
                </div>
              ))}
              {result.issuesTruncated && <p className="px-3 py-1.5 text-slate-400">Showing the first {result.issues.length} issues.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
