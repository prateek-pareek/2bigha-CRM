"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bot, ChevronRight, Loader2, Sparkles } from "lucide-react";
import {
  fetchSalesAgentRecordSummary,
  triggerSalesAgentRun,
  type SalesAgentApproval,
  type SalesAgentRun,
} from "@/lib/crm/sales-agent";

type Props = {
  recordType: "Lead" | "Contact";
  recordId: string;
};

export default function SalesAgentRecordPanel({ recordType, recordId }: Props) {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [agentContext, setAgentContext] = useState<Record<string, unknown> | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<SalesAgentApproval[]>([]);
  const [recentRuns, setRecentRuns] = useState<SalesAgentRun[]>([]);

  const load = useCallback(async () => {
    if (!recordId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSalesAgentRecordSummary(recordType, recordId);
      setEnabled(data.enabled && data.configured);
      setAgentContext((data.agentContext as Record<string, unknown>) || null);
      setPendingApprovals(data.pendingApprovals || []);
      setRecentRuns(data.recentRuns || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load agent status");
    } finally {
      setLoading(false);
    }
  }, [recordId, recordType]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAgent = async () => {
    setRunning(true);
    setError(null);
    try {
      await triggerSalesAgentRun({
        recordType,
        recordId,
        instructions: instructions.trim() || undefined,
      });
      setShowInstructions(false);
      setInstructions("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start agent");
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white p-4">
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Sales agent…
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-violet-200/80 bg-gradient-to-br from-violet-50/80 to-white p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-main)]">Sales agent</h3>
            <p className="text-xs text-[var(--text-muted)]">
              {enabled ? "Supervised AI for this record" : "Enable under CRM Settings → Sales agents"}
            </p>
          </div>
        </div>
        {pendingApprovals.length > 0 && (
          <Link
            href="/crm/agents/inbox"
            className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800"
          >
            {pendingApprovals.length} pending
          </Link>
        )}
      </div>

      {agentContext?.summary ? (
        <p className="mb-3 rounded-lg border border-violet-100 bg-white/80 p-2.5 text-xs text-[var(--text-muted)]">
          {String(agentContext.summary).slice(0, 280)}
        </p>
      ) : null}

      {recentRuns.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {recentRuns.slice(0, 3).map((run) => (
            <li key={run._id} className="flex items-center justify-between text-xs">
              <span className="capitalize text-[var(--text-muted)]">
                {run.trigger?.replace(/_/g, " ")} · {run.agentRole}
              </span>
              <span
                className={
                  run.status === "completed"
                    ? "text-emerald-600"
                    : run.status === "pending_approval"
                      ? "text-amber-600"
                      : "text-[var(--text-muted)]"
                }
              >
                {run.status?.replace(/_/g, " ")}
              </span>
            </li>
          ))}
        </ul>
      )}

      {showInstructions ? (
        <div className="mb-3 space-y-2">
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Optional instructions for this run…"
            rows={2}
            className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void runAgent()}
              disabled={running || !enabled}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Run now
            </button>
            <button
              type="button"
              onClick={() => setShowInstructions(false)}
              className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowInstructions(true)}
          disabled={!enabled}
          className="mb-2 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
        >
          Run sales agent
        </button>
      )}

      <Link
        href="/crm/agents/activity"
        className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:underline"
      >
        View all activity <ChevronRight className="h-3 w-3" />
      </Link>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
