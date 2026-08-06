"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  CheckSquare,
  Loader2,
  Mail,
  RefreshCw,
  Workflow,
  XCircle,
} from "lucide-react";
import { CRM_API_URL } from "@/lib/api/config";
import { toast } from "sonner";

type ScheduleStep = {
  scheduledAt: string;
  kind?: "email" | "task" | "wait";
  label?: string;
  templateId: string | null;
  templateName: string | null;
  taskDueInDays?: number;
};

type ScheduleResponse = {
  hasSchedule: boolean;
  cancelOnReply: boolean;
  steps: ScheduleStep[];
  nextScheduledAt: string | null;
  pendingJobCount: number;
  retryAlternates?: {
    eligible: boolean;
    alternateStepCount: number;
    reason?: string;
  };
};

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

type Props = {
  entityType: "Lead" | "Contact";
  entityId: string;
  hasEmail: boolean;
  onScheduleClick: () => void;
  refreshKey?: number;
  onRetrySuccess?: () => void;
};

export default function FollowUpSequenceCard({
  entityType,
  entityId,
  hasEmail,
  onScheduleClick,
  refreshKey = 0,
  onRetrySuccess,
}: Props) {
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const loadSchedule = useCallback(async () => {
    const t = localStorage.getItem("token");
    if (!t || !entityId) {
      setSchedule(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const q = new URLSearchParams({ entityType, entityId });
      const res = await fetch(
        `${CRM_API_URL}/crm/workflows/follow-up-sequence/schedule?${q}`,
        { headers: { Authorization: `Bearer ${t}` } },
      );
      if (res.ok) {
        setSchedule((await res.json()) as ScheduleResponse);
      } else {
        setSchedule(null);
      }
    } catch {
      setSchedule(null);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule, refreshKey]);

  const handleCancel = async () => {
    if (
      !confirm(
        "Cancel all scheduled follow-up emails for this record?",
      )
    ) {
      return;
    }
    const t = localStorage.getItem("token");
    if (!t) return;
    setCancelling(true);
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/workflows/follow-up-sequence/cancel`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${t}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ entityType, entityId }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Could not cancel sequence");
        return;
      }
      toast.success(
        data?.cancelled
          ? `Cancelled ${data.cancelled} scheduled send(s)`
          : "Sequence cancelled",
      );
      void loadSchedule();
    } finally {
      setCancelling(false);
    }
  };

  const handleRetryAlternates = async () => {
    if (
      !confirm(
        "Send the alternate outreach email now from the configured mailbox?",
      )
    ) {
      return;
    }
    const t = localStorage.getItem("token");
    if (!t) return;
    setRetrying(true);
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/workflows/follow-up-sequence/retry-alternates`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${t}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ entityType, entityId }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!res.ok) {
        toast.error(data?.message || "Could not retry alternate send");
        return;
      }
      toast.success(
        data?.message ||
          "Alternate send queued — refresh the timeline in a minute.",
      );
      void loadSchedule();
      onRetrySuccess?.();
    } finally {
      setRetrying(false);
    }
  };

  const retryEligible = schedule?.retryAlternates?.eligible === true;
  const retryReason = schedule?.retryAlternates?.reason;
  const showStalled = !schedule?.hasSchedule && retryEligible;

  const retryButton = retryEligible ? (
    <button
      type="button"
      disabled={retrying || !hasEmail}
      onClick={() => void handleRetryAlternates()}
      className="text-xs font-semibold text-amber-800 hover:underline disabled:opacity-40 inline-flex items-center gap-1"
    >
      {retrying ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <RefreshCw size={12} />
      )}
      Retry alternate send
    </button>
  ) : null;

  return (
    <div className="bg-card border border-primary/20 rounded-[20px] p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-xs font-bold text-primary flex items-center gap-2">
          <CalendarClock size={14} />
          Follow-ups
        </h3>
        {schedule?.hasSchedule ? (
          <button
            type="button"
            disabled={!hasEmail}
            onClick={onScheduleClick}
            className="text-xs font-semibold text-primary hover:underline disabled:opacity-40"
          >
            Edit
          </button>
        ) : null}
      </div>

      {loading ? (
        <p className="text-xs text-text-muted flex items-center gap-2 py-2">
          <Loader2 size={14} className="animate-spin" />
          Loading schedule…
        </p>
      ) : showStalled ? (
        <div className="space-y-3">
          <p className="text-xs text-text-muted leading-relaxed">
            Follow-up sequence stalled — the alternate mailbox email did not send.
          </p>
          {retryReason ? (
            <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 leading-relaxed">
              {retryReason}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3 pt-1">{retryButton}</div>
        </div>
      ) : schedule?.hasSchedule ? (
        <div className="space-y-3">
          {schedule.nextScheduledAt ? (
            <p className="text-xs text-text-muted">
              Next touchpoint:{" "}
              <strong className="text-text-main">
                {formatWhen(schedule.nextScheduledAt)}
              </strong>
            </p>
          ) : null}
          {retryReason ? (
            <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 leading-relaxed">
              {retryReason}
            </p>
          ) : null}
          {schedule.cancelOnReply ? (
            <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1.5">
              Stops automatically if they reply
            </p>
          ) : (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
              Will continue even if they reply
            </p>
          )}
          {schedule.steps.length > 0 ? (
          <ul className="space-y-2">
            {schedule.steps.map((step, idx) => {
              const isTask = step.kind === "task";
              const title =
                step.label ||
                step.templateName ||
                (isTask ? "Follow-up task" : "Follow-up email");
              return (
              <li
                key={`${step.scheduledAt}-${idx}`}
                className="flex gap-2 rounded-[3px] border border-border/80 bg-white/80 px-3 py-2.5"
              >
                <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  {isTask ? (
                    <CheckSquare size={12} className="text-primary" />
                  ) : (
                    <Mail size={12} className="text-primary" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-text-main truncate">
                    {title}
                  </p>
                  <p className="text-xs text-text-muted">
                    {formatWhen(step.scheduledAt)}
                    {isTask && step.taskDueInDays != null && step.taskDueInDays > 0
                      ? ` · due ${step.taskDueInDays}d after created`
                      : null}
                  </p>
                </div>
              </li>
            );
            })}
          </ul>
          ) : (
            <p className="text-xs text-text-muted rounded-[3px] border border-border/80 bg-white/80 px-3 py-2">
              {schedule.pendingJobCount} automated step
              {schedule.pendingJobCount === 1 ? "" : "s"} queued in workflows.
            </p>
          )}
          <div className="flex flex-wrap gap-3 pt-1">
            {retryButton}
            <button
              type="button"
              disabled={cancelling}
              onClick={() => void handleCancel()}
              className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-40 inline-flex items-center gap-1"
            >
              {cancelling ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <XCircle size={12} />
              )}
              Cancel sequence
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs text-text-muted leading-relaxed mb-3">
            Day 2, 5, 7… with custom copy like compose. Stops if they reply.
          </p>
          <button
            type="button"
            disabled={!hasEmail}
            onClick={onScheduleClick}
            className="inline-flex h-8 items-center rounded-[var(--crm-radius-ui)] bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary/15 disabled:opacity-40"
          >
            Set up follow-ups
          </button>
        </>
      )}

      <Link
        href="/crm/settings/workflows"
        className="inline-flex items-center gap-1 text-xs font-medium text-text-muted hover:text-primary mt-2"
      >
        <Workflow size={12} />
        Advanced workflows →
      </Link>
    </div>
  );
}
