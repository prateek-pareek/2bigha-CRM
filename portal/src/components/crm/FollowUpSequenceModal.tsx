"use client";

import { CrmJiraPortal } from "@/components/crm/CrmJiraPortal";
import CrmSlidePanelShell from "@/components/crm/CrmSlidePanelShell";
import { FirstOutreachNotOpenedPanel } from "@/components/crm/FirstOutreachNotOpenedPanel";
import { FollowUpStepEmailEditor } from "@/components/crm/FollowUpStepEmailEditor";
import { Button } from "@/components/ui/button";
import { useCrmAiDraftAvailability } from "@/hooks/useCrmAiDraftAvailability";
import { CRM_API_URL } from "@/lib/api/config";
import {
  buildFirstOutreachEngagementApiPayload,
  buildFollowUpStepAiInstructions,
  cadenceFromApiSteps,
  cadenceToApiSteps,
  defaultCadenceMilestones,
  defaultFirstOutreachEngagement,
  firstOutreachEngagementFromApiPayload,
  isFirstOutreachEngagementActive,
  milestoneScheduleLabel,
  newCustomMilestone,
  validateFirstOutreachEngagement,
  validateMilestones,
  type CadenceMilestone,
  type FirstOutreachEngagementApiPayload,
  type FirstOutreachEngagementConfig,
  type FollowUpCadenceApiStep,
} from "@/lib/crm/follow-up-cadence";
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  EyeOff,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type ScheduleTab = "first-outreach" | "follow-ups";

type PendingJob = {
  _id: string;
  runAt: string;
  branchLabel?: string;
  cancelReason?: string;
};

type FollowUpScheduleResponse = {
  hasSchedule: boolean;
  cancelOnReply: boolean;
  pendingJobCount: number;
  nextScheduledAt?: string | null;
  steps?: Array<{
    scheduledAt: string;
    kind: "email" | "task" | "wait";
    label: string;
    templateId: string | null;
    templateName: string | null;
    taskDueInDays?: number;
  }>;
  editableConfig?: {
    cancelOnReply: boolean;
    firstOutreachEngagement: FirstOutreachEngagementApiPayload | null;
    steps: FollowUpCadenceApiStep[];
  } | null;
};

type MailboxHint = {
  priorOutboundFound: boolean;
  hasTrackedOutreach?: boolean;
  anyOpened?: boolean;
  latestOutreachOpened?: boolean;
  latestTrackingToken?: string | null;
  requiredAccountId: string | null;
  requiredFromEmail: string | null;
  recipientEmail: string | null;
  accounts: Array<{ _id: string; email: string; displayName?: string }>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  entityType: "Lead" | "Contact";
  entityId: string;
  entityLabel?: string;
  /** Which tab to show when the panel opens (default: open tracking). */
  initialTab?: ScheduleTab;
  onStarted?: () => void;
  onScheduleChanged?: () => void;
};

function stepLabel(row: CadenceMilestone): string {
  if (row.scheduleMode === "absolute" && row.scheduledAt) {
    try {
      return new Date(row.scheduledAt).toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "Specific date";
    }
  }
  if (row.isCustom) {
    if (row.delayDays > 0) {
      return `${row.delayDays} day${row.delayDays === 1 ? "" : "s"} later`;
    }
    return milestoneScheduleLabel(row);
  }
  return `Day ${row.dayFromStart}`;
}

export default function FollowUpSequenceModal({
  open,
  onClose,
  entityType,
  entityId,
  entityLabel,
  initialTab = "first-outreach",
  onStarted,
  onScheduleChanged,
}: Props) {
  const [templates, setTemplates] = useState<{ _id: string; name: string }[]>([]);
  const [milestones, setMilestones] = useState<CadenceMilestone[]>(
    defaultCadenceMilestones(),
  );
  const [cancelOnReply, setCancelOnReply] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<PendingJob[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [scheduleSnapshot, setScheduleSnapshot] =
    useState<FollowUpScheduleResponse | null>(null);
  const [mailboxHint, setMailboxHint] = useState<MailboxHint | null>(null);
  const [loadingHint, setLoadingHint] = useState(false);
  const [bulkMailboxId, setBulkMailboxId] = useState("");
  const [activeTab, setActiveTab] = useState<ScheduleTab>("first-outreach");
  const [firstOutreachEngagement, setFirstOutreachEngagement] =
    useState<FirstOutreachEngagementConfig>(defaultFirstOutreachEngagement);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const loadTemplates = useCallback(async () => {
    const t = localStorage.getItem("token");
    if (!t) return;
    const res = await fetch(`${CRM_API_URL}/email-templates`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (res.ok) {
      const data = await res.json();
      setTemplates(
        (Array.isArray(data) ? data : []).map((x: { _id: string; name: string }) => ({
          _id: x._id,
          name: x.name,
        })),
      );
    }
  }, []);

  const loadPending = useCallback(async () => {
    const t = localStorage.getItem("token");
    if (!t || !entityId) return;
    setLoadingPending(true);
    try {
      const q = new URLSearchParams({ entityType, entityId });
      const res = await fetch(`${CRM_API_URL}/crm/workflows/pending-jobs/list?${q}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        setPending(await res.json());
      }
    } finally {
      setLoadingPending(false);
    }
  }, [entityType, entityId]);

  const loadMailboxHint = useCallback(async () => {
    const t = localStorage.getItem("token");
    if (!t || !entityId) return;
    setLoadingHint(true);
    try {
      const q = new URLSearchParams({ entityType, entityId });
      const res = await fetch(
        `${CRM_API_URL}/crm/workflows/follow-up-sequence/mailbox-hint?${q}`,
        { headers: { Authorization: `Bearer ${t}` } },
      );
      if (res.ok) {
        const hint = (await res.json()) as MailboxHint;
        setMailboxHint(hint);
        setBulkMailboxId("");
      } else {
        setMailboxHint(null);
      }
    } finally {
      setLoadingHint(false);
    }
  }, [entityType, entityId]);

  const loadSchedule = useCallback(async () => {
    const t = localStorage.getItem("token");
    if (!t || !entityId) return;
    try {
      const q = new URLSearchParams({ entityType, entityId });
      const res = await fetch(
        `${CRM_API_URL}/crm/workflows/follow-up-sequence/schedule?${q}`,
        { headers: { Authorization: `Bearer ${t}` } },
      );
      if (!res.ok) return;
      const data = (await res.json()) as FollowUpScheduleResponse;
      setScheduleSnapshot(data);
      const editable = data?.editableConfig;
      if (!editable) return;
      const loadedMilestones = cadenceFromApiSteps(editable.steps || []);
      setMilestones(loadedMilestones);
      setFirstOutreachEngagement(
        firstOutreachEngagementFromApiPayload(editable.firstOutreachEngagement || null),
      );
      setCancelOnReply(editable.cancelOnReply !== false);
      setExpandedStepId(loadedMilestones.find((m) => m.enabled)?.id ?? null);
    } catch {
      // no-op: keep defaults when schedule details cannot be loaded
    }
  }, [entityType, entityId]);

  useEffect(() => {
    if (!open) return;
    void loadTemplates();
    void loadPending();
    void loadMailboxHint();
    void loadSchedule();
    const defaults = defaultCadenceMilestones();
    setMilestones(defaults);
    setFirstOutreachEngagement(defaultFirstOutreachEngagement());
    setActiveTab(initialTab);
    setCancelOnReply(true);
    setExpandedStepId(defaults.find((m) => m.enabled)?.id ?? null);
  }, [open, initialTab, loadTemplates, loadPending, loadMailboxHint, loadSchedule]);

  const outreachMailboxLabel =
    mailboxHint?.requiredFromEmail ||
    mailboxHint?.accounts.find((a) => a._id === mailboxHint?.requiredAccountId)?.email ||
    "last outreach email";

  const applyBulkMailbox = (accountId: string) => {
    setBulkMailboxId(accountId);
    setMilestones((rows) => rows.map((r) => ({ ...r, inboxAccountId: accountId })));
  };

  const updateMilestone = (id: string, patch: Partial<CadenceMilestone>) =>
    setMilestones((rows) =>
      rows.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch, sendEmail: true, createTask: false };
        return next;
      }),
    );

  const renderMailboxSelect = (
    value: string,
    onChange: (inboxAccountId: string) => void,
    disabled?: boolean,
    compact?: boolean,
  ) => (
    <select
      value={value}
      disabled={disabled || !mailboxHint?.accounts.length}
      onChange={(e) => onChange(e.target.value)}
      className={
        compact
          ? "w-full min-w-[120px] rounded-lg border border-border px-2 py-1.5 text-xs bg-white disabled:opacity-50"
          : "w-full h-11 rounded-lg border border-border px-3 text-sm bg-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
      }
      title="Send from"
    >
      <option value="">Same as outreach ({outreachMailboxLabel})</option>
      {mailboxHint?.accounts.map((a) => (
        <option key={a._id} value={a._id}>
          {a.displayName ? `${a.displayName} · ` : ""}
          {a.email}
        </option>
      ))}
    </select>
  );

  const removeMilestone = (id: string) =>
    setMilestones((rows) => rows.filter((r) => r.id !== id));

  const addCustomStep = () => setMilestones((rows) => [...rows, newCustomMilestone()]);

  const hasTrackedOutreach = !!mailboxHint?.hasTrackedOutreach;
  const leadHasOpenedLatestOutreach = !!mailboxHint?.latestOutreachOpened;
  const aiDraftAvailable = useCrmAiDraftAvailability(open);

  const engagementActive = isFirstOutreachEngagementActive(firstOutreachEngagement);
  const alternateStepCount = firstOutreachEngagement.alternateSteps.length;

  const handleStart = async () => {
    const engagementPayload = buildFirstOutreachEngagementApiPayload(
      firstOutreachEngagement,
    );
    const hasEngagement = !!engagementPayload;

    if (hasEngagement) {
      const outreachErr = validateFirstOutreachEngagement(
        firstOutreachEngagement,
        hasTrackedOutreach,
        mailboxHint?.requiredAccountId || undefined,
      );
      if (outreachErr) {
        toast.error(outreachErr);
        setActiveTab("first-outreach");
        return;
      }
    }

    const apiSteps = cadenceToApiSteps(milestones);
    if (!hasEngagement && !apiSteps.length) {
      toast.error(
        "Add alternate open-tracking steps or enable at least one follow-up step",
      );
      if (!hasEngagement) setActiveTab("first-outreach");
      else setActiveTab("follow-ups");
      return;
    }

    if (apiSteps.length) {
      if (!hasTrackedOutreach) {
        toast.error(
          "Send a tracked email from CRM compose first. Follow-ups start only after the lead opens it.",
        );
        setActiveTab("follow-ups");
        return;
      }
      const err = validateMilestones(milestones);
      if (err) {
        toast.error(err);
        setActiveTab("follow-ups");
        return;
      }
    }

    const t = localStorage.getItem("token");
    if (!t) {
      toast.error("Not signed in");
      return;
    }
    const hasPerStepMailboxOverride = milestones.some(
      (m) =>
        m.enabled &&
        m.inboxAccountId &&
        m.inboxAccountId !== (mailboxHint?.requiredAccountId || ""),
    );

    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        entityType,
        entityId,
        cancelOnReply,
        overrideMailbox: hasPerStepMailboxOverride,
        steps: apiSteps,
        ...(mailboxHint?.latestTrackingToken
          ? { trackingToken: mailboxHint.latestTrackingToken }
          : {}),
        ...(engagementPayload ? { firstOutreachEngagement: engagementPayload } : {}),
      };

      const res = await fetch(`${CRM_API_URL}/crm/workflows/follow-up-sequence/start`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${t}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Could not schedule follow-ups");
        return;
      }
      const fallbackSuccess =
        hasEngagement && apiSteps.length
          ? "Open tracking and follow-ups scheduled"
          : hasEngagement
            ? "Open tracking scheduled"
            : "Follow-ups scheduled";
      toast.success(data?.message || fallbackSuccess);
      onStarted?.();
      onScheduleChanged?.();
      void loadPending();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const enabledCount = milestones.filter((m) => m.enabled).length;

  const stepPreview = useCallback(
    (row: CadenceMilestone) => {
      if (!row.enabled) return "Off";
      if (row.contentMode === "custom") {
        const subject = row.customSubject.trim();
        return subject || "Custom message (no subject yet)";
      }
      const tpl = templates.find((t) => t._id === row.templateId);
      return tpl?.name || "Pick a template";
    },
    [templates],
  );

  const footerSummary = useMemo(() => {
    if (activeTab === "first-outreach") {
      if (isFirstOutreachEngagementActive(firstOutreachEngagement)) {
        const alts = firstOutreachEngagement.alternateSteps.length;
        return `Open tracking · ${alts} alternate step${alts === 1 ? "" : "s"}`;
      }
      return "Open tracking · add alternate steps to enable chain";
    }
    return `${enabledCount} follow-up${enabledCount === 1 ? "" : "s"} ready`;
  }, [activeTab, enabledCount, firstOutreachEngagement]);

  const scheduledSteps = scheduleSnapshot?.steps || [];

  if (!open) return null;

  const panel = (
    <CrmSlidePanelShell
      isOpen={open}
      onClose={onClose}
      title="Follow-ups"
      subtitle={entityLabel}
      headerTone="hubspot"
      maxWidthClass="max-w-[min(96vw,72rem)]"
      contentClassName="px-5 py-5 sm:px-6 sm:py-6"
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-xs text-[var(--text-muted)] cursor-pointer">
              <input
                type="checkbox"
                checked={cancelOnReply}
                onChange={(e) => setCancelOnReply(e.target.checked)}
                className="rounded border-border h-3.5 w-3.5"
              />
              Stop if they reply
            </label>
            <span className="text-xs text-[var(--text-muted)]">{footerSummary}</span>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="h-9 rounded-[var(--crm-radius-ui)] px-4 text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-dim)]"
            >
              Cancel
            </Button>
            {activeTab === "first-outreach" ? (
              <>
                {engagementActive ? (
                  <Button
                    type="button"
                    disabled={loading || !hasTrackedOutreach}
                    title={
                      hasTrackedOutreach
                        ? undefined
                        : "Send a tracked email from compose first"
                    }
                    onClick={() => void handleStart()}
                    className="h-9 gap-1.5 rounded-[var(--crm-radius-ui)] bg-[var(--primary)] px-4 text-sm font-bold text-white shadow-[var(--crm-shadow-button-hover)] hover:bg-[var(--primary-dark)]"
                  >
                    {loading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <EyeOff size={14} />
                    )}
                    Schedule open tracking
                    {alternateStepCount > 0 ? ` (${alternateStepCount})` : ""}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant={engagementActive ? "outline" : "default"}
                  onClick={() => setActiveTab("follow-ups")}
                  className={
                    engagementActive
                      ? "h-9 rounded-(--crm-radius-ui) border-(--border-color) px-4 text-sm font-semibold shadow-none"
                      : "h-9 gap-1.5 rounded-(--crm-radius-ui) bg-(--primary) px-4 text-sm font-bold text-white shadow-(--crm-shadow-button-hover) hover:bg-(--primary-dark)"
                  }
                >
                  Follow-ups
                  <ChevronRight size={14} />
                </Button>
              </>
            ) : (
              <Button
                type="button"
                disabled={
                  loading ||
                  (enabledCount === 0 && !engagementActive) ||
                  (enabledCount > 0 && !hasTrackedOutreach)
                }
                title={
                  enabledCount > 0 && !hasTrackedOutreach
                    ? "Send a tracked email from compose first"
                    : undefined
                }
                onClick={() => void handleStart()}
                className="h-9 gap-1.5 rounded-[var(--crm-radius-ui)] bg-[var(--primary)] px-4 text-sm font-bold text-white shadow-[var(--crm-shadow-button-hover)] hover:bg-[var(--primary-dark)]"
              >
                {loading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <CalendarClock size={14} />
                )}
                Schedule
                {enabledCount > 0 && engagementActive
                  ? ` (${enabledCount} + tracking)`
                  : enabledCount > 0
                    ? ` (${enabledCount})`
                    : engagementActive
                      ? " (tracking)"
                      : ""}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4 -mx-1">
        <p className="text-sm text-[var(--text-muted)] leading-relaxed">
          Send a{" "}
          <strong className="font-semibold text-[var(--text-main)]">tracked</strong> email
          from compose first. Day 2 / 5 / 7 follow-ups only run after the lead opens a
          tracked send — not if it stays unopened or lands in spam.
        </p>

        <div
          className="flex flex-wrap gap-1 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--surface-dim)] p-1"
          role="tablist"
          aria-label="Schedule sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "first-outreach"}
            onClick={() => setActiveTab("first-outreach")}
            className={`flex-1 min-w-[9rem] rounded-[calc(var(--crm-radius-ui)-2px)] px-3 py-2 text-xs font-semibold transition-colors ${
              activeTab === "first-outreach"
                ? "bg-white text-[var(--text-main)] shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
            }`}
          >
            Open tracking
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "follow-ups"}
            onClick={() => setActiveTab("follow-ups")}
            className={`flex-1 min-w-[9rem] rounded-[calc(var(--crm-radius-ui)-2px)] px-3 py-2 text-xs font-semibold transition-colors ${
              activeTab === "follow-ups"
                ? "bg-white text-[var(--text-main)] shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
            }`}
          >
            Follow-ups ({enabledCount})
          </button>
        </div>

        {activeTab === "first-outreach" ? (
          <FirstOutreachNotOpenedPanel
            config={firstOutreachEngagement}
            templates={templates}
            accounts={mailboxHint?.accounts || []}
            entityType={entityType}
            entityId={entityId}
            aiDraftAvailable={aiDraftAvailable}
            firstOutreachMailboxId={mailboxHint?.requiredAccountId || undefined}
            firstOutreachFromEmail={mailboxHint?.requiredFromEmail}
            hasTrackedOutreach={hasTrackedOutreach}
            onChange={(patch) => setFirstOutreachEngagement((c) => ({ ...c, ...patch }))}
          />
        ) : (
          <>
            {!hasTrackedOutreach ? (
              <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                Send a tracked email from CRM compose first. Follow-ups will not schedule
                until the lead opens a tracked send.
              </p>
            ) : leadHasOpenedLatestOutreach ? (
              <p className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
                This lead has already opened a tracked email — Day 2 / 5 / 7 delays start
                from schedule time.
              </p>
            ) : (
              <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                Waiting for an open before follow-ups run. If they never open, Day 2 / 5 /
                7 will not send.
              </p>
            )}
            {isFirstOutreachEngagementActive(firstOutreachEngagement) ? (
              <p className="text-xs text-text-muted rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
                With open-tracking alternates enabled, follow-ups send from the mailbox
                they <strong className="text-text-main">opened</strong> (first outreach or
                an alternate).
              </p>
            ) : null}
            {loadingHint ? (
              <p className="text-xs text-text-muted flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Checking mailbox…
              </p>
            ) : mailboxHint &&
              mailboxHint.accounts.length > 0 &&
              !isFirstOutreachEngagementActive(firstOutreachEngagement) ? (
              <div className="max-w-xl">
                <label className="text-xs font-semibold text-text-main block mb-1.5">
                  Default send-from (all follow-up steps)
                </label>
                {renderMailboxSelect(bulkMailboxId, applyBulkMailbox)}
                <p className="text-[11px] text-text-muted mt-1">
                  {mailboxHint.priorOutboundFound
                    ? `Follow-ups use ${mailboxHint.requiredFromEmail || "your last mailbox"} unless overridden per step.`
                    : "Pick a default mailbox, or set a different sender on each step."}
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                Follow-up emails
              </p>

              {milestones.map((row) => {
                const expanded = expandedStepId === row.id;
                return (
                  <div
                    key={row.id}
                    className={`rounded-[var(--crm-radius-ui)] border overflow-hidden ${
                      row.enabled
                        ? "border-[var(--border-color)] bg-white"
                        : "border-[#ebecf0] bg-[#f4f5f7]/60 opacity-70"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-[var(--border-color)]/60">
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={(e) =>
                          updateMilestone(row.id, {
                            enabled: e.target.checked,
                            sendEmail: true,
                          })
                        }
                        className="rounded border-border shrink-0 h-3.5 w-3.5"
                        aria-label={`Enable ${stepLabel(row)}`}
                      />

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedStepId((id) => (id === row.id ? null : row.id))
                        }
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span className="text-sm font-semibold text-[var(--text-main)] shrink-0">
                          {stepLabel(row)}
                        </span>
                        <span className="truncate text-xs text-[var(--text-muted)]">
                          {stepPreview(row)}
                        </span>
                        <ChevronDown
                          size={14}
                          className={`ml-auto shrink-0 text-[var(--text-muted)] transition-transform ${
                            expanded ? "rotate-180" : ""
                          }`}
                        />
                      </button>

                      {pendingDeleteId === row.id ? (
                        <div className="ml-auto flex items-center gap-1.5 shrink-0">
                          <span className="text-xs text-red-600 font-medium">
                            Delete step?
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingDeleteId(null);
                            }}
                            className="h-6 px-2 rounded text-xs font-medium border border-[#dfe1e6] text-slate-600 hover:bg-slate-100"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeMilestone(row.id);
                              setPendingDeleteId(null);
                            }}
                            className="h-6 px-2 rounded text-xs font-semibold bg-red-600 text-white hover:bg-red-700"
                          >
                            Delete
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDeleteId(row.id);
                          }}
                          className="ml-auto p-1.5 rounded-md text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                          aria-label="Remove step"
                          title="Delete this step"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    {row.enabled && expanded ? (
                      <div className="p-3 sm:p-4 space-y-4 min-w-0">
                        {/* Scheduling section */}
                        <div className="rounded-lg border border-(--border-color) bg-[#f4f5f7]/60 p-3 space-y-2.5">
                          <p className="text-xs font-semibold text-(--text-main) uppercase tracking-wide">
                            When to send
                          </p>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`schedule-mode-${row.id}`}
                                checked={row.scheduleMode !== "absolute"}
                                onChange={() =>
                                  updateMilestone(row.id, {
                                    scheduleMode: "after_previous",
                                    isCustom: true,
                                  })
                                }
                                className="h-3.5 w-3.5"
                              />
                              <span className="text-xs text-(--text-main)">After</span>
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={365}
                              value={
                                row.scheduleMode !== "absolute" ? row.delayDays || 1 : ""
                              }
                              disabled={row.scheduleMode === "absolute"}
                              onChange={(e) =>
                                updateMilestone(row.id, {
                                  delayDays: Math.max(1, Number(e.target.value) || 1),
                                  isCustom: true,
                                })
                              }
                              className="w-16 h-7 rounded border border-(--border-color) px-2 text-xs bg-white disabled:opacity-40"
                            />
                            <span className="text-xs text-(--text-muted)">day(s)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`schedule-mode-${row.id}`}
                                checked={row.scheduleMode === "absolute"}
                                onChange={() =>
                                  updateMilestone(row.id, {
                                    scheduleMode: "absolute",
                                    isCustom: true,
                                  })
                                }
                                className="h-3.5 w-3.5"
                              />
                              <span className="text-xs text-(--text-main)">
                                Specific date &amp; time
                              </span>
                            </label>
                          </div>
                          {row.scheduleMode === "absolute" ? (
                            <input
                              type="datetime-local"
                              value={row.scheduledAt || ""}
                              onChange={(e) =>
                                updateMilestone(row.id, {
                                  scheduledAt: e.target.value,
                                  isCustom: true,
                                })
                              }
                              className="w-full h-8 rounded border border-(--border-color) px-2 text-xs bg-white"
                            />
                          ) : null}
                        </div>
                        {/* Email content */}
                        <FollowUpStepEmailEditor
                          row={row}
                          templates={templates}
                          fieldIdPrefix={`${row.id}-follow-up`}
                          compact
                          aiDraft={{
                            entityType,
                            entityId,
                            available: aiDraftAvailable,
                            contextInstructions: buildFollowUpStepAiInstructions(row),
                          }}
                          onChange={(patch) => updateMilestone(row.id, patch)}
                        />
                        {!isFirstOutreachEngagementActive(firstOutreachEngagement) ? (
                          <div className="max-w-xl">
                            <label className="text-xs font-semibold text-[var(--text-main)] block mb-1.5">
                              Send from
                            </label>
                            {renderMailboxSelect(
                              row.inboxAccountId,
                              (inboxAccountId) =>
                                updateMilestone(row.id, { inboxAccountId }),
                              false,
                              false,
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={addCustomStep}
                className="w-full flex items-center justify-center gap-1.5 rounded-[var(--crm-radius-ui)] border border-dashed border-[var(--border-color)] py-2 text-xs font-semibold text-[var(--text-muted)] hover:border-primary/40 hover:text-primary"
              >
                <Plus size={14} />
                Add step
              </button>
            </div>
          </>
        )}

        {loadingPending ? (
          <p className="text-xs text-text-muted flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            Checking existing schedule…
          </p>
        ) : pending.length > 0 ? (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {pending.length} send{pending.length === 1 ? "" : "s"} already queued —
            scheduling again replaces them.
          </p>
        ) : null}

        {scheduleSnapshot?.hasSchedule ? (
          <div className="rounded-lg border border-(--border-color) bg-(--card-bg) p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-(--text-main)">
                Scheduled timeline ({scheduleSnapshot.pendingJobCount} pending job
                {scheduleSnapshot.pendingJobCount === 1 ? "" : "s"})
              </p>
              <p className="text-[11px] text-(--text-muted)">
                {scheduleSnapshot.cancelOnReply
                  ? "Stops if they reply"
                  : "Keeps running after replies"}
              </p>
            </div>
            {scheduleSnapshot.nextScheduledAt ? (
              <p className="text-[11px] text-[var(--text-muted)]">
                Next step:{" "}
                <span className="font-medium text-[var(--text-main)]">
                  {new Date(scheduleSnapshot.nextScheduledAt).toLocaleString()}
                </span>
              </p>
            ) : null}
            {scheduledSteps.length > 0 ? (
              <ul className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                {scheduledSteps.slice(0, 25).map((s, idx) => (
                  <li
                    key={`${s.scheduledAt}-${s.kind}-${idx}`}
                    className="rounded-md border border-[var(--border-color)]/60 bg-[var(--surface-dim)]/25 px-2.5 py-1.5 text-xs"
                  >
                    <span className="font-medium text-[var(--text-main)]">
                      {new Date(s.scheduledAt).toLocaleString()}
                    </span>
                    <span className="text-[var(--text-muted)]"> · </span>
                    <span className="font-semibold text-[var(--text-main)]">
                      {s.kind === "email" ? "Email" : s.kind === "wait" ? "Wait" : "Task"}
                    </span>
                    <span className="text-[var(--text-muted)]"> · {s.label}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-(--text-muted)">
                No projected steps available yet.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </CrmSlidePanelShell>
  );

  return <CrmJiraPortal>{panel}</CrmJiraPortal>;
}
