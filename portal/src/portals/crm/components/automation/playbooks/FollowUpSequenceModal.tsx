"use client";

import { CrmJiraPortal } from "@/components/crm/shell/CrmJiraPortal";
import CrmSlidePanelShell from "@/components/crm/shell/CrmSlidePanelShell";
import { FirstOutreachNotOpenedPanel } from "@/components/crm/reports/panels/FirstOutreachNotOpenedPanel";
import { FollowUpStepEmailEditor } from "@/components/crm/email/composer/FollowUpStepEmailEditor";
import { Button } from "@/components/ui/button";
import { useCrmAiDraftAvailability } from '@/lib/crm/hooks/useCrmAiDraftAvailability';
import { CRM_API_URL } from '@/lib/crm/config';
import {
  buildFirstOutreachEngagementApiPayload,
  buildFollowUpStepAiInstructions,
  cadenceFromApiSteps,
  cadenceToApiSteps,
  datetimeLocalToIso,
  defaultCadenceMilestones,
  defaultDatetimeLocalMinutesFromNow,
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
  HelpCircle,
  Loader2,
  Mail,
  MessageCircle,
  Plus,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CrmDropdown, type CrmDropdownOption } from "@/components/crm/ui";

type ScheduleTab = "first-outreach" | "follow-ups" | "reminder";
type ReminderMedium = "email" | "whatsapp" | "later";

type PendingJob = {
  _id: string;
  runAt: string;
  branchLabel?: string;
  cancelReason?: string;
};

type FollowUpScheduleResponse = {
  hasSchedule: boolean;
  cancelOnReply: boolean;
  waitForOpen?: boolean;
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
    waitForOpen?: boolean;
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
  initialTab = "reminder",
  onStarted,
  onScheduleChanged,
}: Props) {
  const [templates, setTemplates] = useState<{ _id: string; name: string }[]>([]);
  const [milestones, setMilestones] = useState<CadenceMilestone[]>(
    defaultCadenceMilestones(),
  );
  const [cancelOnReply, setCancelOnReply] = useState(true);
  const [waitForOpen, setWaitForOpen] = useState(true);
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
  const [cancelling, setCancelling] = useState(false);
  const [reminderAt, setReminderAt] = useState(
    defaultDatetimeLocalMinutesFromNow(60),
  );
  const [reminderMedium, setReminderMedium] =
    useState<ReminderMedium>("email");
  const [reminderNote, setReminderNote] = useState("");
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
      setWaitForOpen(editable.waitForOpen !== false);
      setExpandedStepId(loadedMilestones.find((m) => m.enabled)?.id ?? null);
    } catch {
      // no-op: keep defaults when schedule details cannot be loaded
    }
  }, [entityType, entityId]);

  const handleCancelSequence = useCallback(async () => {
    if (
      !confirm(
        "Cancel all scheduled follow-up emails and wait-for-open jobs for this record?",
      )
    ) {
      return;
    }
    const t = localStorage.getItem("token");
    if (!t) {
      toast.error("Not signed in");
      return;
    }
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
          ? `Cancelled ${data.cancelled} scheduled job(s)`
          : "Sequence cancelled",
      );
      setScheduleSnapshot(null);
      setPending([]);
      void loadPending();
      void loadSchedule();
      onScheduleChanged?.();
    } finally {
      setCancelling(false);
    }
  }, [entityType, entityId, loadPending, loadSchedule, onScheduleChanged]);

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
    setWaitForOpen(true);
    setReminderAt(defaultDatetimeLocalMinutesFromNow(60));
    setReminderMedium("email");
    setReminderNote("");
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
  ) => {
    const options: CrmDropdownOption[] = [
      { value: "", label: `Same as outreach (${outreachMailboxLabel})` },
      ...(mailboxHint?.accounts.map((a) => ({
        value: a._id,
        label: `${a.displayName ? `${a.displayName} · ` : ""}${a.email}`,
      })) || []),
    ];

    return (
      <CrmDropdown
        value={value}
        onChange={onChange}
        options={options}
        className={compact ? "w-full min-w-[140px]" : "w-full"}
        buttonClassName={
          compact
            ? "h-9 w-full justify-between border-border bg-card text-sm font-semibold text-text-primary hover:border-primary/40"
            : "h-11 w-full justify-between border-border bg-card text-sm font-semibold text-text-primary hover:border-primary/40"
        }
      />
    );
  };

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
    const hasEngagement = waitForOpen && !!engagementPayload;

    if (hasEngagement && engagementPayload) {
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
        waitForOpen
          ? "Add alternate open-tracking steps or enable at least one follow-up step"
          : "Enable at least one follow-up step",
      );
      if (!hasEngagement) setActiveTab("follow-ups");
      else setActiveTab("follow-ups");
      return;
    }

    if (apiSteps.length) {
      if (waitForOpen && !hasTrackedOutreach) {
        toast.error(
          "Send a tracked email from CRM compose first. Follow-ups start only after the lead opens it.",
        );
        setActiveTab("follow-ups");
        return;
      }
      if (!waitForOpen && !(mailboxHint?.accounts?.length)) {
        toast.error("Connect a mailbox in Inbox before scheduling follow-ups.");
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
        waitForOpen,
        overrideMailbox: hasPerStepMailboxOverride,
        steps: apiSteps,
        ...(mailboxHint?.latestTrackingToken
          ? { trackingToken: mailboxHint.latestTrackingToken }
          : {}),
        ...(waitForOpen && engagementPayload
          ? { firstOutreachEngagement: engagementPayload }
          : {}),
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

  const handleScheduleReminder = async () => {
    const iso = datetimeLocalToIso(reminderAt);
    if (!iso) {
      toast.error("Pick a valid date and time");
      return;
    }
    if (new Date(iso).getTime() < Date.now() - 60_000) {
      toast.error("Follow-up time must be now or in the future");
      return;
    }
    const t = localStorage.getItem("token");
    if (!t) {
      toast.error("Not signed in");
      return;
    }
    setLoading(true);
    try {
      const mediumLabel =
        reminderMedium === "whatsapp"
          ? "WhatsApp"
          : reminderMedium === "later"
            ? "decide later"
            : "Email";
      const res = await fetch(`${CRM_API_URL}/crm/reminders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${t}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          relatedType: entityType,
          relatedTo: entityId,
          scheduledAt: iso,
          medium: reminderMedium,
          description: reminderNote.trim() || undefined,
          syncLeadNextFollowUp: entityType === "Lead",
          recurrence: "none",
          title: entityLabel
            ? reminderMedium === "later"
              ? `Follow up (decide later): ${entityLabel}`
              : `Follow up via ${mediumLabel}: ${entityLabel}`
            : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Could not schedule follow-up reminder");
        return;
      }
      toast.success(
        reminderMedium === "later"
          ? "Reminder set — you'll get a popup to follow up (pick channel then)"
          : `Reminder set — you'll get a popup to follow up via ${mediumLabel}`,
      );
      onStarted?.();
      onScheduleChanged?.();
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
            {activeTab === "reminder" ? (
              <span className="text-xs text-[var(--text-muted)]">
                Reminder for you — does not auto-send to the lead
              </span>
            ) : (
              <>
                <label className="flex items-center gap-2 text-xs text-[var(--text-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={waitForOpen}
                    onChange={(e) => setWaitForOpen(e.target.checked)}
                    className="rounded border-border h-3.5 w-3.5"
                  />
                  Wait for open
                </label>
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
              </>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {scheduleSnapshot?.hasSchedule && activeTab !== "reminder" ? (
              <Button
                type="button"
                variant="ghost"
                disabled={cancelling || loading}
                onClick={() => void handleCancelSequence()}
                className="h-9 gap-1.5 rounded-[var(--crm-radius-ui)] px-4 text-sm font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              >
                {cancelling ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <XCircle size={14} />
                )}
                Cancel sequence
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="h-9 rounded-[var(--crm-radius-ui)] px-4 text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-dim)]"
            >
              Close
            </Button>
            {activeTab === "reminder" ? (
              <Button
                type="button"
                disabled={loading || !reminderAt}
                onClick={() => void handleScheduleReminder()}
                className="h-9 gap-1.5 rounded-[var(--crm-radius-ui)] bg-[var(--primary)] px-4 text-sm font-bold text-white shadow-[var(--crm-shadow-button-hover)] hover:bg-[var(--primary-dark)]"
              >
                {loading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <CalendarClock size={14} />
                )}
                Set reminder
              </Button>
            ) : activeTab === "first-outreach" ? (
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
                  (enabledCount === 0 && !(waitForOpen && engagementActive)) ||
                  (enabledCount > 0 && waitForOpen && !hasTrackedOutreach) ||
                  (enabledCount > 0 &&
                    !waitForOpen &&
                    !(mailboxHint?.accounts?.length))
                }
                title={
                  enabledCount > 0 && waitForOpen && !hasTrackedOutreach
                    ? "Send a tracked email from compose first"
                    : enabledCount > 0 &&
                        !waitForOpen &&
                        !(mailboxHint?.accounts?.length)
                      ? "Connect a mailbox in Inbox first"
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
          Automate tracked emails, or set a{" "}
          <strong className="font-semibold text-[var(--text-main)]">reminder</strong> so
          you get a popup to follow up yourself via Email or WhatsApp.
        </p>

        <div
          className="flex flex-wrap gap-1 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--surface-dim)] p-1"
          role="tablist"
          aria-label="Schedule sections"
        >
          {/* Hidden per request: Open tracking & Auto emails tabs
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "first-outreach"}
            onClick={() => setActiveTab("first-outreach")}
            className={`flex-1 min-w-[7.5rem] rounded-[calc(var(--crm-radius-ui)-2px)] px-3 py-2 text-xs font-semibold transition-colors ${
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
            className={`flex-1 min-w-[7.5rem] rounded-[calc(var(--crm-radius-ui)-2px)] px-3 py-2 text-xs font-semibold transition-colors ${
              activeTab === "follow-ups"
                ? "bg-white text-[var(--text-main)] shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
            }`}
          >
            Auto emails ({enabledCount})
          </button>
          */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "reminder"}
            onClick={() => setActiveTab("reminder")}
            className={`flex-1 min-w-[7.5rem] rounded-[calc(var(--crm-radius-ui)-2px)] px-3 py-2 text-xs font-semibold transition-colors ${
              activeTab === "reminder"
                ? "bg-white text-[var(--text-main)] shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
            }`}
          >
            Reminder
          </button>
        </div>

        {activeTab === "reminder" ? (
          <div className="space-y-4 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
            <p className="text-sm text-[var(--text-muted)] leading-relaxed">
              Pick when <strong className="font-semibold text-[var(--text-main)]">you</strong> want
              to be reminded. At that time you&apos;ll get a toast + bell notification (and email if
              enabled). This does not auto-send to the lead. View all reminders under{" "}
              <span className="font-semibold text-[var(--text-main)]">
                Notifications → Reminders
              </span>
              .
            </p>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-muted)]">
                Date &amp; time
              </label>
              <input
                type="datetime-local"
                value={reminderAt}
                onChange={(e) => setReminderAt(e.target.value)}
                className="h-11 w-full rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white px-3 text-sm font-medium text-[var(--text-main)]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-muted)]">
                Follow-up medium
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setReminderMedium("email")}
                  className={`flex h-11 items-center justify-center gap-2 rounded-[var(--crm-radius-ui)] border text-sm font-semibold transition-colors ${
                    reminderMedium === "email"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-[var(--border-color)] text-[var(--text-muted)] hover:border-primary/40"
                  }`}
                >
                  <Mail size={16} />
                  Email
                </button>
                <button
                  type="button"
                  onClick={() => setReminderMedium("whatsapp")}
                  className={`flex h-11 items-center justify-center gap-2 rounded-[var(--crm-radius-ui)] border text-sm font-semibold transition-colors ${
                    reminderMedium === "whatsapp"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-[var(--border-color)] text-[var(--text-muted)] hover:border-primary/40"
                  }`}
                >
                  <MessageCircle size={16} />
                  WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => setReminderMedium("later")}
                  className={`flex h-11 items-center justify-center gap-2 rounded-[var(--crm-radius-ui)] border text-sm font-semibold transition-colors ${
                    reminderMedium === "later"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-[var(--border-color)] text-[var(--text-muted)] hover:border-primary/40"
                  }`}
                >
                  <HelpCircle size={16} />
                  Decide later
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-muted)]">
                Note (optional)
              </label>
              <textarea
                value={reminderNote}
                onChange={(e) => setReminderNote(e.target.value)}
                rows={3}
                placeholder="e.g. Ask about site visit availability"
                className="w-full rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white px-3 py-2 text-sm text-[var(--text-main)]"
              />
            </div>
          </div>
        ) : activeTab === "first-outreach" ? (
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
            {!waitForOpen ? (
              <p className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
                <strong className="font-semibold">Send on schedule</strong> — follow-ups
                will send at the times you set. They will <em>not</em> wait for the lead to
                open a previous email.
              </p>
            ) : !hasTrackedOutreach ? (
              <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                Send a tracked email from CRM compose first. Until that exists, Schedule stays
                disabled while <strong className="font-semibold">Wait for open</strong> is on.
                Or turn off Wait for open to send on the clock time instead.
              </p>
            ) : leadHasOpenedLatestOutreach ? (
              <p className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
                This lead has already opened a tracked email — Day 2 / 5 / 7 delays start
                from schedule time.
              </p>
            ) : (
              <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                Waiting for an open before follow-ups run. Turn off{" "}
                <strong className="font-semibold">Wait for open</strong> if you want emails
                to send at the scheduled time even if they never open.
              </p>
            )}
            {waitForOpen && isFirstOutreachEngagementActive(firstOutreachEngagement) ? (
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
                        : "border-[var(--border-color)] bg-[var(--surface-dim)]/60 opacity-70"
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
                            className="h-6 px-2 rounded text-xs font-medium border border-[var(--border-color)] text-slate-600 hover:bg-slate-100"
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
                        <div className="rounded-lg border border-(--border-color) bg-[var(--surface-dim)]/60 p-3 space-y-2.5">
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
                {scheduleSnapshot.waitForOpen === false
                  ? "Sends on schedule"
                  : "Waits for open"}
                {" · "}
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
            <button
              type="button"
              disabled={cancelling}
              onClick={() => void handleCancelSequence()}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:underline disabled:opacity-40 pt-1"
            >
              {cancelling ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <XCircle size={12} />
              )}
              Cancel sequence
            </button>
          </div>
        ) : null}
      </div>
    </CrmSlidePanelShell>
  );

  return <CrmJiraPortal>{panel}</CrmJiraPortal>;
}
