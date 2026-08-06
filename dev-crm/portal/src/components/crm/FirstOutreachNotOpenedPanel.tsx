"use client";

import { EyeOff, Plus, Trash2 } from "lucide-react";
import {
  buildAlternateOutreachAiInstructions,
  toDatetimeLocalValue,
  type FirstOutreachEngagementConfig,
  type NotOpenedAlternateStep,
  type NotOpenedWaitMode,
} from "@/lib/crm/follow-up-cadence";
import { FollowUpStepEmailEditor } from "@/components/crm/FollowUpStepEmailEditor";

type Mailbox = { _id: string; email: string; displayName?: string };

type Props = {
  config: FirstOutreachEngagementConfig;
  templates: { _id: string; name: string }[];
  accounts: Mailbox[];
  entityType: "Lead" | "Contact";
  entityId: string;
  aiDraftAvailable: boolean | null;
  firstOutreachMailboxId?: string;
  firstOutreachFromEmail?: string | null;
  hasTrackedOutreach: boolean;
  disabled?: boolean;
  onChange: (patch: Partial<FirstOutreachEngagementConfig>) => void;
};

function WaitControls({
  label,
  mode,
  days,
  hours,
  minutes,
  deadlineAt,
  disabled,
  onModeChange,
  onPatch,
}: {
  label: string;
  mode: NotOpenedWaitMode;
  days: number;
  hours: number;
  minutes: number;
  deadlineAt: string;
  disabled?: boolean;
  onModeChange: (mode: NotOpenedWaitMode) => void;
  onPatch: (patch: {
    waitDays?: number;
    waitHours?: number;
    waitMinutes?: number;
    deadlineAt?: string;
  }) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-text-main">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["2d", "2 days"],
            ["3d", "3 days"],
            ["custom_relative", "Custom"],
            ["custom_absolute", "Date & time"],
          ] as const
        ).map(([id, text]) => (
          <button
            key={id}
            type="button"
            disabled={disabled}
            onClick={() => onModeChange(id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors ${
              mode === id
                ? "bg-white border-amber-300 text-amber-900 shadow-sm"
                : "border-transparent text-text-muted hover:bg-white/60"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
      {mode === "custom_relative" ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input
            type="number"
            min={0}
            max={365}
            disabled={disabled}
            value={days}
            onChange={(e) =>
              onPatch({ waitDays: Math.max(0, Number(e.target.value) || 0) })
            }
            className="w-16 h-9 rounded-lg border border-border px-2 text-sm"
          />
          <span className="text-text-muted">days</span>
          <input
            type="number"
            min={0}
            max={23}
            disabled={disabled}
            value={hours}
            onChange={(e) =>
              onPatch({ waitHours: Math.max(0, Number(e.target.value) || 0) })
            }
            className="w-16 h-9 rounded-lg border border-border px-2 text-sm"
          />
          <span className="text-text-muted">hours</span>
        </div>
      ) : null}
      {mode === "custom_absolute" ? (
        <input
          type="datetime-local"
          disabled={disabled}
          value={deadlineAt}
          onChange={(e) => onPatch({ deadlineAt: e.target.value })}
          className="w-full max-w-md h-11 rounded-lg border border-border px-3 text-sm bg-white"
        />
      ) : null}
    </div>
  );
}

function waitLabelForStepIndex(index: number): string {
  if (index === 0) {
    return "If still not opened, send this email after — from first outreach";
  }
  return `If still not opened, send this email after — from Step ${index} email`;
}

function stepToEditorRow(step: NotOpenedAlternateStep) {
  return {
    id: step.id,
    enabled: true,
    isCustom: false,
    scheduleMode: "from_start" as const,
    dayFromStart: 0,
    hoursFromStart: 0,
    minutesFromStart: 0,
    delayDays: 0,
    delayHours: 0,
    delayMinutes: 0,
    scheduledAt: "",
    sendEmail: true,
    contentMode: step.contentMode,
    templateId: step.templateId,
    customSubject: step.customSubject,
    customBodyHtml: step.customBodyHtml,
    inboxAccountId: step.inboxAccountId,
    createTask: false,
    taskTitle: "",
    taskBody: "",
    taskDueInDays: 0,
    ifNotOpenedEnabled: false,
    ifNotOpenedWaitMode: "2d" as const,
    ifNotOpenedWaitDays: 2,
    ifNotOpenedWaitHours: 0,
    ifNotOpenedWaitMinutes: 0,
    ifNotOpenedDeadlineAt: "",
    ifNotOpenedContentMode: "custom" as const,
    ifNotOpenedTemplateId: "",
    ifNotOpenedCustomSubject: "",
    ifNotOpenedCustomBodyHtml: "",
    ifNotOpenedInboxAccountId: "",
  };
}

export function FirstOutreachNotOpenedPanel({
  config,
  templates,
  accounts,
  entityType,
  entityId,
  aiDraftAvailable,
  firstOutreachMailboxId,
  firstOutreachFromEmail,
  hasTrackedOutreach,
  disabled,
  onChange,
}: Props) {
  const updateAlternateStep = (
    id: string,
    patch: Partial<NotOpenedAlternateStep>,
  ) => {
    onChange({
      alternateSteps: config.alternateSteps.map((s) =>
        s.id === id ? { ...s, ...patch } : s,
      ),
    });
  };

  const patchFirstWait = (
    patch: Partial<
      Pick<
        FirstOutreachEngagementConfig,
        | "firstWaitMode"
        | "firstWaitDays"
        | "firstWaitHours"
        | "firstWaitMinutes"
        | "firstDeadlineAt"
      >
    >,
  ) => {
    onChange(patch);
  };

  const setBeforeSendWaitMode = (stepIndex: number, mode: NotOpenedWaitMode) => {
    if (stepIndex === 0) {
      const patch: Partial<FirstOutreachEngagementConfig> = {
        firstWaitMode: mode,
      };
      if (mode === "2d") patch.firstWaitDays = 2;
      if (mode === "3d") patch.firstWaitDays = 3;
      if (mode === "custom_absolute") {
        patch.firstDeadlineAt = toDatetimeLocalValue(
          new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        );
      }
      onChange(patch);
      return;
    }
    const prev = config.alternateSteps[stepIndex - 1];
    if (!prev) return;
    const stepPatch: Partial<NotOpenedAlternateStep> = { waitMode: mode };
    if (mode === "2d") stepPatch.waitDays = 2;
    if (mode === "3d") stepPatch.waitDays = 3;
    if (mode === "custom_absolute") {
      stepPatch.deadlineAt = toDatetimeLocalValue(
        new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      );
    }
    updateAlternateStep(prev.id, stepPatch);
  };

  const addAlternateStep = () => {
    onChange({
      alternateSteps: [
        ...config.alternateSteps,
        {
          id: `alt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          waitMode: "2d",
          waitDays: 2,
          waitHours: 0,
          waitMinutes: 0,
          deadlineAt: toDatetimeLocalValue(
            new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          ),
          contentMode: "custom",
          templateId: "",
          customSubject: "",
          customBodyHtml: "<p></p>",
          inboxAccountId: "",
        },
      ],
    });
  };

  const removeAlternateStep = (id: string) => {
    onChange({
      alternateSteps: config.alternateSteps.filter((s) => s.id !== id),
    });
  };

  const usedMailboxes = new Set(
    config.alternateSteps.map((s) => s.inboxAccountId).filter(Boolean),
  );

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--surface-dim)]/50 px-3 py-2.5 text-xs text-[var(--text-muted)] leading-relaxed">
        Watches your first outreach
        {firstOutreachFromEmail ? (
          <> from <strong className="text-[var(--text-main)]">{firstOutreachFromEmail}</strong></>
        ) : null}
        . Each step waits after the previous send; if they open any tracked email,
        the chain stops and follow-ups use that mailbox.
      </div>

      {!hasTrackedOutreach ? (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
          Send a tracked email from CRM compose first.
        </p>
      ) : null}

      <div className="w-full rounded-[3px] border-2 border-amber-300 bg-amber-50/70 p-4 sm:p-5 space-y-4 shadow-sm">
        <p className="text-sm text-text-main leading-snug">
          <span className="font-semibold inline-flex items-center gap-1">
            <EyeOff size={14} className="text-amber-700" />
            If not opened — alternate outreach chain
          </span>
          <span className="block text-xs font-normal text-text-muted mt-1">
            Add steps below. Each step sets how long to wait after the last email
            before sending if they still have not opened.
          </span>
        </p>

        {hasTrackedOutreach ? (
          <>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                  Steps (if still not opened)
                </p>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={addAlternateStep}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-50"
                >
                  <Plus size={14} />
                  Add step
                </button>
              </div>

              {!config.alternateSteps.length ? (
                <p className="text-xs text-amber-900/90 bg-white/60 border border-amber-200/80 rounded-lg px-3 py-2">
                  No alternate steps yet — use <strong>Add step</strong> to turn
                  on the chain when scheduling follow-ups.
                </p>
              ) : null}

              {config.alternateSteps.map((step, index) => {
                const mailboxOptions = accounts.filter(
                  (a) =>
                    a._id !== firstOutreachMailboxId &&
                    (!usedMailboxes.has(a._id) || a._id === step.inboxAccountId),
                );
                const beforeSend =
                  index === 0
                    ? {
                        mode: config.firstWaitMode,
                        days: config.firstWaitDays,
                        hours: config.firstWaitHours,
                        minutes: config.firstWaitMinutes,
                        deadlineAt: config.firstDeadlineAt,
                      }
                    : {
                        mode: config.alternateSteps[index - 1].waitMode,
                        days: config.alternateSteps[index - 1].waitDays,
                        hours: config.alternateSteps[index - 1].waitHours,
                        minutes: config.alternateSteps[index - 1].waitMinutes,
                        deadlineAt: config.alternateSteps[index - 1].deadlineAt,
                      };
                return (
                  <div
                    key={step.id}
                    className="rounded-[3px] border border-amber-200/90 bg-white/80 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-text-main">
                        Step {index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAlternateStep(step.id)}
                        className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                        aria-label={`Remove alternate step ${index + 1}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <WaitControls
                      label={waitLabelForStepIndex(index)}
                      mode={beforeSend.mode}
                      days={beforeSend.days}
                      hours={beforeSend.hours}
                      minutes={beforeSend.minutes}
                      deadlineAt={beforeSend.deadlineAt}
                      disabled={disabled}
                      onModeChange={(mode) => setBeforeSendWaitMode(index, mode)}
                      onPatch={(patch) => {
                        if (index === 0) {
                          const next: Parameters<typeof patchFirstWait>[0] = {};
                          if (patch.waitDays !== undefined) {
                            next.firstWaitDays = patch.waitDays;
                          }
                          if (patch.waitHours !== undefined) {
                            next.firstWaitHours = patch.waitHours;
                          }
                          if (patch.waitMinutes !== undefined) {
                            next.firstWaitMinutes = patch.waitMinutes;
                          }
                          if (patch.deadlineAt !== undefined) {
                            next.firstDeadlineAt = patch.deadlineAt;
                          }
                          patchFirstWait(next);
                          return;
                        }
                        const prevId = config.alternateSteps[index - 1]?.id;
                        if (prevId) updateAlternateStep(prevId, patch);
                      }}
                    />

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-text-main block">
                        Send from
                      </label>
                      <select
                        value={step.inboxAccountId}
                        disabled={disabled || !mailboxOptions.length}
                        onChange={(e) =>
                          updateAlternateStep(step.id, {
                            inboxAccountId: e.target.value,
                          })
                        }
                        className="w-full max-w-xl h-11 rounded-lg border border-border px-3 text-sm bg-white"
                      >
                        <option value="">Pick inbox…</option>
                        {mailboxOptions.map((a) => (
                          <option key={a._id} value={a._id}>
                            {a.displayName ? `${a.displayName} · ` : ""}
                            {a.email}
                          </option>
                        ))}
                      </select>
                    </div>

                    <FollowUpStepEmailEditor
                      row={stepToEditorRow(step)}
                      templates={templates}
                      disabled={disabled}
                      fieldIdPrefix={`alt-${step.id}`}
                      aiDraft={{
                        entityType,
                        entityId,
                        available: aiDraftAvailable,
                        contextInstructions: buildAlternateOutreachAiInstructions(
                          index,
                          config.alternateSteps.length,
                        ),
                      }}
                      onChange={(patch) => {
                        const next: Partial<NotOpenedAlternateStep> = {};
                        if (patch.contentMode !== undefined) {
                          next.contentMode = patch.contentMode;
                        }
                        if (patch.templateId !== undefined) {
                          next.templateId = patch.templateId;
                        }
                        if (patch.customSubject !== undefined) {
                          next.customSubject = patch.customSubject;
                        }
                        if (patch.customBodyHtml !== undefined) {
                          next.customBodyHtml = patch.customBodyHtml;
                        }
                        updateAlternateStep(step.id, next);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
