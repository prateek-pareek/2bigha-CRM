"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Check, Loader2, X } from "lucide-react";
import {
  approveSalesAgentAction,
  fetchSalesAgentApprovals,
  rejectSalesAgentAction,
  type SalesAgentApproval,
} from "@/lib/crm/sales-agent";

function recordHref(approval: SalesAgentApproval) {
  if (!approval.recordType || !approval.recordId) return null;
  const base =
    approval.recordType === "Lead"
      ? "/crm/leads"
      : "/crm/contacts";
  return `${base}/${approval.recordId}`;
}

function PayloadPreview({ approval }: { approval: SalesAgentApproval }) {
  const p = approval.payload || {};
  if (approval.action === "send_email" || approval.action === "send_proposal") {
    return (
      <div className="mt-3 space-y-2 rounded-lg border border-[var(--border-color)] bg-[var(--background)] p-3 text-sm">
        <p>
          <span className="font-medium text-[var(--text-muted)]">To:</span>{" "}
          {String(p.to || "—")}
        </p>
        <p>
          <span className="font-medium text-[var(--text-muted)]">Subject:</span>{" "}
          {String(p.subject || "—")}
        </p>
        <div
          className="prose prose-sm max-h-48 max-w-none overflow-auto rounded border border-[var(--border-color)] bg-white p-2"
          dangerouslySetInnerHTML={{ __html: String(p.bodyHtml || "") }}
        />
      </div>
    );
  }
  return (
    <pre className="mt-3 max-h-40 overflow-auto rounded-lg border border-[var(--border-color)] bg-[var(--background)] p-3 text-xs">
      {JSON.stringify(p, null, 2)}
    </pre>
  );
}

function SalesAgentApprovalCard({
  approval,
  onDecided,
}: {
  approval: SalesAgentApproval;
  onDecided: () => void;
}) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const href = recordHref(approval);

  const approve = async () => {
    setLoading("approve");
    setError(null);
    try {
      await approveSalesAgentAction(approval._id);
      onDecided();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setLoading(null);
    }
  };

  const reject = async () => {
    setLoading("reject");
    setError(null);
    try {
      await rejectSalesAgentAction(approval._id, rejectNote.trim() || undefined);
      setShowRejectForm(false);
      setRejectNote("");
      onDecided();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setLoading(null);
    }
  };

  return (
    <article className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">
            {approval.action.replace(/_/g, " ")}
          </p>
          <h3 className="mt-1 text-base font-semibold text-[var(--text-main)]">
            {approval.previewSummary || "Pending agent action"}
          </h3>
          {href && (
            <Link href={href} className="mt-1 inline-block text-sm text-primary hover:underline">
              View {approval.recordType}
            </Link>
          )}
        </div>
        {!showRejectForm && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void approve()}
              disabled={!!loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {loading === "approve" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Approve
            </button>
            <button
              type="button"
              onClick={() => setShowRejectForm(true)}
              disabled={!!loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--background)] disabled:opacity-60"
            >
              <X className="h-4 w-4" />
              Reject
            </button>
          </div>
        )}
      </div>
      <PayloadPreview approval={approval} />
      {showRejectForm && (
        <div className="mt-4 space-y-3 rounded-lg border border-rose-100 bg-rose-50/50 p-4">
          <label className="block text-sm">
            <span className="font-medium text-[var(--text-main)]">Rejection note</span>
            <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
              Optional feedback for the team — why this action was rejected.
            </span>
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
              placeholder="e.g. Tone is too aggressive, use a softer follow-up angle…"
              className="mt-2 w-full rounded-lg border border-[var(--border-color)] bg-white px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void reject()}
              disabled={!!loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {loading === "reject" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
              Confirm reject
            </button>
            <button
              type="button"
              onClick={() => {
                setShowRejectForm(false);
                setRejectNote("");
              }}
              disabled={!!loading}
              className="rounded-lg border border-[var(--border-color)] bg-white px-3 py-2 text-sm font-semibold hover:bg-[var(--background)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </article>
  );
}

export default function SalesAgentInboxPage() {
  const [approvals, setApprovals] = useState<SalesAgentApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchSalesAgentApprovals("pending");
      setApprovals(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inbox");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-violet-500/10 text-violet-600">
          <Bot size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sales agent inbox</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Review and approve high-risk actions proposed by the sales agent.
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && approvals.length === 0 && (
        <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-color)] p-8 text-center text-sm text-[var(--text-muted)]">
          No pending approvals. The agent will queue sends, conversions, and other high-risk steps here.
        </p>
      )}
      <div className="space-y-4">
        {approvals.map((a) => (
          <SalesAgentApprovalCard key={a._id} approval={a} onDecided={() => void load()} />
        ))}
      </div>
    </div>
  );
}
