/** Standard automation cadence: days from sequence start. */
export const FOLLOW_UP_CADENCE_DAYS = [2, 5, 7, 15, 30] as const;

export type ScheduleMode = "from_start" | "after_previous" | "absolute";

export type CadenceMilestone = {
  id: string;
  enabled: boolean;
  isCustom: boolean;
  scheduleMode: ScheduleMode;
  /** Cumulative offset from sequence start (`from_start` mode). */
  dayFromStart: number;
  hoursFromStart: number;
  minutesFromStart: number;
  /** Gap after the previous scheduled step (`after_previous` mode). */
  delayDays: number;
  delayHours: number;
  delayMinutes: number;
  /** `datetime-local` value (`absolute` mode). */
  scheduledAt: string;
  sendEmail: boolean;
  /** `template` = saved CRM template; `custom` = your own subject/body (better for deliverability). */
  contentMode: "template" | "custom" | "ai_draft";
  templateId: string;
  customSubject: string;
  customBodyHtml: string;
  /** Empty = use outreach / last-send mailbox from server hint. */
  inboxAccountId: string;
  createTask: boolean;
  taskTitle: string;
  taskBody: string;
  taskDueInDays: number;
  /** If the step's email is not opened in time, send alternate content from another mailbox */
  ifNotOpenedEnabled: boolean;
  ifNotOpenedWaitMode: "2d" | "3d" | "custom_relative" | "custom_absolute";
  ifNotOpenedWaitDays: number;
  ifNotOpenedWaitHours: number;
  ifNotOpenedWaitMinutes: number;
  ifNotOpenedDeadlineAt: string;
  ifNotOpenedContentMode: "template" | "custom";
  ifNotOpenedTemplateId: string;
  ifNotOpenedCustomSubject: string;
  ifNotOpenedCustomBodyHtml: string;
  ifNotOpenedInboxAccountId: string;
};

export type NotOpenedWaitMode = "2d" | "3d" | "custom_relative" | "custom_absolute";

/** One alternate send if prior outreach was not opened (wait → send → wait for open). */
export type NotOpenedAlternateStep = {
  id: string;
  waitMode: NotOpenedWaitMode;
  waitDays: number;
  waitHours: number;
  waitMinutes: number;
  deadlineAt: string;
  contentMode: "template" | "custom" | "ai_draft";
  templateId: string;
  customSubject: string;
  customBodyHtml: string;
  inboxAccountId: string;
};

/** First manual outreach gate + chained alternate steps before follow-up cadence. */
export type FirstOutreachEngagementConfig = {
  firstWaitMode: NotOpenedWaitMode;
  firstWaitDays: number;
  firstWaitHours: number;
  firstWaitMinutes: number;
  firstDeadlineAt: string;
  alternateSteps: NotOpenedAlternateStep[];
};

/** @deprecated Use FirstOutreachEngagementConfig */
export type NotOpenedResendConfig = FirstOutreachEngagementConfig & NotOpenedAlternateStep;

export type NotOpenedResendApiPayload = {
  waitDays?: number;
  waitHours?: number;
  waitMinutes?: number;
  deadlineAt?: string;
  sendMode?: "template" | "custom" | "ai_draft";
  templateId?: string;
  subject?: string;
  body?: string;
  aiInstructions?: string;
  inboxAccountId?: string;
};

export type FirstOutreachEngagementApiPayload = {
  firstWait: NotOpenedResendApiPayload;
  alternateSteps: NotOpenedResendApiPayload[];
};

function waitModeFromApi(payload: NotOpenedResendApiPayload): NotOpenedWaitMode {
  if (payload.deadlineAt) return "custom_absolute";
  const d = Number(payload.waitDays) || 0;
  const h = Number(payload.waitHours) || 0;
  const m = Number(payload.waitMinutes) || 0;
  if (d === 2 && h === 0 && m === 0) return "2d";
  if (d === 3 && h === 0 && m === 0) return "3d";
  return "custom_relative";
}

function waitFieldsFromMode(
  mode: NotOpenedWaitMode,
  days: number,
  hours: number,
  minutes: number,
  deadlineAt: string,
): Pick<
  NotOpenedResendApiPayload,
  "waitDays" | "waitHours" | "waitMinutes" | "deadlineAt"
> {
  if (mode === "custom_absolute") {
    const iso = datetimeLocalToIso(deadlineAt);
    return iso ? { deadlineAt: iso } : {};
  }
  const waitDays = mode === "3d" ? 3 : mode === "2d" ? 2 : days;
  return { waitDays, waitHours: hours, waitMinutes: minutes };
}

function buildAlternateStepApiPayload(
  step: NotOpenedAlternateStep,
  stepIndex: number,
  totalSteps: number,
): NotOpenedResendApiPayload {
  const payload: NotOpenedResendApiPayload = {
    sendMode: step.contentMode,
    inboxAccountId: step.inboxAccountId.trim() || undefined,
    ...waitFieldsFromMode(
      step.waitMode,
      step.waitDays,
      step.waitHours,
      step.waitMinutes,
      step.deadlineAt,
    ),
  };
  if (step.contentMode === "ai_draft") {
    payload.aiInstructions = buildAlternateOutreachAiInstructions(
      stepIndex,
      totalSteps,
    );
  } else if (step.contentMode === "custom") {
    payload.subject = step.customSubject.trim();
    payload.body = step.customBodyHtml;
  } else {
    payload.templateId = step.templateId;
  }
  return payload;
}

export function defaultNotOpenedAlternateStep(): NotOpenedAlternateStep {
  return {
    id: `alt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    waitMode: "2d",
    waitDays: 2,
    waitHours: 0,
    waitMinutes: 0,
    deadlineAt: defaultDatetimeLocalMinutesFromNow(2 * 24 * 60),
    contentMode: "custom",
    templateId: "",
    customSubject: "",
    customBodyHtml: "<p></p>",
    inboxAccountId: "",
  };
}

/** Active when the user added at least one alternate step (applied on schedule). */
export function isFirstOutreachEngagementActive(
  c: FirstOutreachEngagementConfig,
): boolean {
  return c.alternateSteps.length > 0;
}

/** Extra instructions for draft-person-email (follow-up cadence step). */
export function buildFollowUpStepAiInstructions(row: CadenceMilestone): string {
  const when = milestoneScheduleLabel(row);
  return [
    `Write a follow-up email for scheduled CRM automation (${when}).`,
    "It sends only after the lead has opened a prior tracked outreach email.",
    "Keep it concise (under 150 words), one clear CTA, conversational B2B tone.",
    "Do not mention automation, open tracking, or that this is a sequence.",
  ].join(" ");
}

/** Extra instructions for draft-person-email (alternate if-not-opened step). */
export function buildAlternateOutreachAiInstructions(
  stepIndex: number,
  totalSteps: number,
): string {
  return [
    `Write alternate outreach email ${stepIndex + 1} of ${totalSteps} in an "if not opened" chain.`,
    "The lead has not opened the previous tracked email from another sender/mailbox.",
    "Use a fresh angle and different subject line; still personalized and professional.",
    "This is a first-touch style message, not a passive bump email.",
  ].join(" ");
}

export function defaultFirstOutreachEngagement(): FirstOutreachEngagementConfig {
  return {
    firstWaitMode: "2d",
    firstWaitDays: 2,
    firstWaitHours: 0,
    firstWaitMinutes: 0,
    firstDeadlineAt: defaultDatetimeLocalMinutesFromNow(2 * 24 * 60),
    alternateSteps: [],
  };
}

/** @deprecated */
export const defaultFirstOutreachNotOpened = defaultFirstOutreachEngagement;

export function buildFirstOutreachEngagementApiPayload(
  c: FirstOutreachEngagementConfig,
): FirstOutreachEngagementApiPayload | undefined {
  if (!isFirstOutreachEngagementActive(c)) return undefined;
  const firstWait: NotOpenedResendApiPayload = waitFieldsFromMode(
    c.firstWaitMode,
    c.firstWaitDays,
    c.firstWaitHours,
    c.firstWaitMinutes,
    c.firstDeadlineAt,
  );
  return {
    firstWait,
    alternateSteps: c.alternateSteps.map((step, index) =>
      buildAlternateStepApiPayload(step, index, c.alternateSteps.length),
    ),
  };
}

export function firstOutreachEngagementFromApiPayload(
  payload?: FirstOutreachEngagementApiPayload | null,
): FirstOutreachEngagementConfig {
  if (!payload) return defaultFirstOutreachEngagement();
  const first = payload.firstWait || {};
  const firstMode = waitModeFromApi(first);
  return {
    firstWaitMode: firstMode,
    firstWaitDays: Number(first.waitDays) || 2,
    firstWaitHours: Number(first.waitHours) || 0,
    firstWaitMinutes: Number(first.waitMinutes) || 0,
    firstDeadlineAt: first.deadlineAt
      ? toDatetimeLocalValue(new Date(first.deadlineAt))
      : defaultDatetimeLocalMinutesFromNow(2 * 24 * 60),
    alternateSteps: (payload.alternateSteps || []).map((step, idx) => {
      const mode = waitModeFromApi(step);
      return {
        id: `alt-loaded-${idx + 1}-${Math.random().toString(36).slice(2, 7)}`,
        waitMode: mode,
        waitDays: Number(step.waitDays) || 2,
        waitHours: Number(step.waitHours) || 0,
        waitMinutes: Number(step.waitMinutes) || 0,
        deadlineAt: step.deadlineAt
          ? toDatetimeLocalValue(new Date(step.deadlineAt))
          : defaultDatetimeLocalMinutesFromNow(2 * 24 * 60),
        contentMode:
          step.sendMode === "template"
            ? "template"
            : step.sendMode === "ai_draft"
              ? "ai_draft"
              : "custom",
        templateId: step.templateId || "",
        customSubject: step.subject || "",
        customBodyHtml: step.body || "<p></p>",
        inboxAccountId: step.inboxAccountId || "",
      };
    }),
  };
}

function validateWaitFields(
  label: string,
  mode: NotOpenedWaitMode,
  days: number,
  hours: number,
  minutes: number,
  deadlineAt: string,
): string | null {
  if (
    mode === "custom_relative" &&
    days * 86400 + hours * 3600 + minutes * 60 <= 0
  ) {
    return `Set a wait time for ${label}`;
  }
  if (mode === "custom_absolute") {
    const iso = datetimeLocalToIso(deadlineAt);
    if (!iso || new Date(iso).getTime() < Date.now() + 60_000) {
      return `${label} deadline must be at least 1 minute in the future`;
    }
  }
  return null;
}

function validateAlternateStep(
  step: NotOpenedAlternateStep,
  index: number,
  firstOutreachMailboxId?: string,
  usedMailboxes?: Set<string>,
): string | null {
  const label = `Alternate step ${index + 1}`;
  if (step.contentMode === "ai_draft") {
    return null;
  }
  if (step.contentMode === "custom") {
    const bodyText = String(step.customBodyHtml || "")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (!step.customSubject.trim()) {
      return `${label} needs a subject line`;
    }
    if (!bodyText) {
      return `${label} needs a message body`;
    }
  } else if (!step.templateId) {
    return `Choose a template for ${label}`;
  }
  const mb = step.inboxAccountId.trim();
  if (!mb) {
    return `Pick a mailbox for ${label}`;
  }
  if (firstOutreachMailboxId && mb === firstOutreachMailboxId) {
    return `${label} must use a different mailbox than your first outreach`;
  }
  if (usedMailboxes?.has(mb)) {
    return `${label} must use a different mailbox than other alternate steps`;
  }
  usedMailboxes?.add(mb);
  return null;
}

export function validateFirstOutreachEngagement(
  c: FirstOutreachEngagementConfig,
  hasTrackedOutreach: boolean,
  firstOutreachMailboxId?: string,
): string | null {
  if (!isFirstOutreachEngagementActive(c)) return null;
  if (!hasTrackedOutreach) {
    return "Send a tracked outreach email to this lead first, then add alternate steps";
  }
  const firstWaitErr = validateWaitFields(
    "Step 1 wait after first outreach",
    c.firstWaitMode,
    c.firstWaitDays,
    c.firstWaitHours,
    c.firstWaitMinutes,
    c.firstDeadlineAt,
  );
  if (firstWaitErr) return firstWaitErr;
  const used = new Set<string>();
  for (let i = 0; i < c.alternateSteps.length; i++) {
    const err = validateAlternateStep(
      c.alternateSteps[i],
      i,
      firstOutreachMailboxId,
      used,
    );
    if (err) return err;
    if (i > 0) {
      const prev = c.alternateSteps[i - 1];
      const gapErr = validateWaitFields(
        `Step ${i + 1} wait after Step ${i} email`,
        prev.waitMode,
        prev.waitDays,
        prev.waitHours,
        prev.waitMinutes,
        prev.deadlineAt,
      );
      if (gapErr) return gapErr;
    }
  }
  return null;
}

/** @deprecated */
export const validateFirstOutreachNotOpened = validateFirstOutreachEngagement;

export type FollowUpCadenceApiStep = {
  delayDays: number;
  delayHours: number;
  delayMinutes: number;
  /** ISO — optional; server also accepts relative delays derived from this. */
  scheduledAt?: string;
  inboxAccountId?: string;
  email?: {
    sendMode?: "template" | "custom" | "ai_draft";
    templateId?: string;
    subject?: string;
    body?: string;
    aiInstructions?: string;
    inboxAccountId?: string;
    ifNotOpened?: {
      waitDays?: number;
      waitHours?: number;
      waitMinutes?: number;
      deadlineAt?: string;
      sendMode?: "template" | "custom";
      templateId?: string;
      subject?: string;
      body?: string;
      inboxAccountId?: string;
    };
  };
  task?: { title: string; body?: string; dueInDays?: number };
};

function delayMs(d: {
  days?: number;
  hours?: number;
  minutes?: number;
}): number {
  const days = Number(d.days) || 0;
  const hours = Number(d.hours) || 0;
  const minutes = Number(d.minutes) || 0;
  return (days * 86400 + hours * 3600 + minutes * 60) * 1000;
}

function msToDelayParts(ms: number): {
  delayDays: number;
  delayHours: number;
  delayMinutes: number;
} {
  let remaining = Math.max(0, Math.floor(ms));
  const delayDays = Math.floor(remaining / 86400000);
  remaining %= 86400000;
  const delayHours = Math.floor(remaining / 3600000);
  remaining %= 3600000;
  const delayMinutes = Math.floor(remaining / 60000);
  return { delayDays, delayHours, delayMinutes };
}

export function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function datetimeLocalToIso(local: string): string | null {
  if (!local?.trim()) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function defaultDatetimeLocalMinutesFromNow(minutes: number): string {
  return toDatetimeLocalValue(new Date(Date.now() + minutes * 60_000));
}

export function defaultCadenceMilestones(): CadenceMilestone[] {
  return FOLLOW_UP_CADENCE_DAYS.map((day) => ({
    id: `day-${day}`,
    enabled: true,
    isCustom: false,
    scheduleMode: "from_start",
    dayFromStart: day,
    hoursFromStart: 0,
    minutesFromStart: 0,
    delayDays: 0,
    delayHours: 0,
    delayMinutes: 0,
    scheduledAt: defaultDatetimeLocalMinutesFromNow(day * 24 * 60),
    sendEmail: true,
    contentMode: "custom",
    templateId: "",
    customSubject: "",
    customBodyHtml: "<p></p>",
    inboxAccountId: "",
    createTask: false,
    taskTitle: `Follow up (${day}d)`,
    taskBody: "Check in after the scheduled touchpoint.",
    taskDueInDays: 0,
    ifNotOpenedEnabled: false,
    ifNotOpenedWaitMode: "2d",
    ifNotOpenedWaitDays: 2,
    ifNotOpenedWaitHours: 0,
    ifNotOpenedWaitMinutes: 0,
    ifNotOpenedDeadlineAt: defaultDatetimeLocalMinutesFromNow(2 * 24 * 60),
    ifNotOpenedContentMode: "custom",
    ifNotOpenedTemplateId: "",
    ifNotOpenedCustomSubject: "",
    ifNotOpenedCustomBodyHtml: "<p></p>",
    ifNotOpenedInboxAccountId: "",
  }));
}

export function newCustomMilestone(): CadenceMilestone {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    enabled: true,
    isCustom: true,
    scheduleMode: "after_previous",
    dayFromStart: 0,
    hoursFromStart: 0,
    minutesFromStart: 0,
    delayDays: 3,
    delayHours: 0,
    delayMinutes: 0,
    scheduledAt: defaultDatetimeLocalMinutesFromNow(24 * 60),
    sendEmail: true,
    contentMode: "custom",
    templateId: "",
    customSubject: "",
    customBodyHtml: "<p></p>",
    inboxAccountId: "",
    createTask: false,
    taskTitle: "Follow up",
    taskBody: "",
    taskDueInDays: 0,
    ifNotOpenedEnabled: false,
    ifNotOpenedWaitMode: "2d",
    ifNotOpenedWaitDays: 2,
    ifNotOpenedWaitHours: 0,
    ifNotOpenedWaitMinutes: 0,
    ifNotOpenedDeadlineAt: defaultDatetimeLocalMinutesFromNow(2 * 24 * 60),
    ifNotOpenedContentMode: "custom",
    ifNotOpenedTemplateId: "",
    ifNotOpenedCustomSubject: "",
    ifNotOpenedCustomBodyHtml: "<p></p>",
    ifNotOpenedInboxAccountId: "",
  };
}

function buildIfNotOpenedApiPayload(m: CadenceMilestone) {
  if (!m.ifNotOpenedEnabled) return undefined;
  const payload: NonNullable<FollowUpCadenceApiStep["email"]>["ifNotOpened"] =
    {
      sendMode: m.ifNotOpenedContentMode,
      inboxAccountId: m.ifNotOpenedInboxAccountId.trim() || undefined,
    };
  if (m.ifNotOpenedWaitMode === "custom_absolute") {
    const iso = datetimeLocalToIso(m.ifNotOpenedDeadlineAt);
    if (iso) payload.deadlineAt = iso;
  } else {
    const days =
      m.ifNotOpenedWaitMode === "3d"
        ? 3
        : m.ifNotOpenedWaitMode === "2d"
          ? 2
          : m.ifNotOpenedWaitDays;
    payload.waitDays = days;
    payload.waitHours = m.ifNotOpenedWaitHours;
    payload.waitMinutes = m.ifNotOpenedWaitMinutes;
  }
  if (m.ifNotOpenedContentMode === "custom") {
    payload.subject = m.ifNotOpenedCustomSubject.trim();
    payload.body = m.ifNotOpenedCustomBodyHtml;
  } else {
    payload.templateId = m.ifNotOpenedTemplateId;
  }
  return payload;
}

export function milestoneScheduleLabel(m: CadenceMilestone): string {
  if (m.scheduleMode === "absolute" && m.scheduledAt) {
    try {
      return new Date(m.scheduledAt).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return "Specific date & time";
    }
  }
  if (m.scheduleMode === "after_previous") {
    const bits: string[] = [];
    if (m.delayDays) bits.push(`${m.delayDays}d`);
    if (m.delayHours) bits.push(`${m.delayHours}h`);
    if (m.delayMinutes) bits.push(`${m.delayMinutes}m`);
    return bits.length ? `After ${bits.join(" ")} (previous step)` : "After previous step";
  }
  const bits: string[] = [];
  if (m.dayFromStart) bits.push(`${m.dayFromStart}d`);
  if (m.hoursFromStart) bits.push(`${m.hoursFromStart}h`);
  if (m.minutesFromStart) bits.push(`${m.minutesFromStart}m`);
  return bits.length ? `After ${bits.join(" ")} from start` : "At sequence start";
}

/** @deprecated Use milestoneScheduleLabel */
export function cadenceDayLabel(day: number): string {
  if (day === 1) return "After 1 day";
  return `After ${day} days`;
}

function milestoneTargetMs(
  m: CadenceMilestone,
  sequenceStart: number,
  cursorAfterPrevious: number,
): number {
  if (m.scheduleMode === "absolute") {
    const iso = datetimeLocalToIso(m.scheduledAt);
    return iso ? new Date(iso).getTime() : cursorAfterPrevious + 60_000;
  }
  if (m.scheduleMode === "after_previous") {
    return (
      cursorAfterPrevious +
      delayMs({
        days: m.delayDays,
        hours: m.delayHours,
        minutes: m.delayMinutes,
      })
    );
  }
  return (
    sequenceStart +
    delayMs({
      days: m.dayFromStart,
      hours: m.hoursFromStart,
      minutes: m.minutesFromStart,
    })
  );
}

/** Convert milestones to API steps (sorted by time, incremental delays). */
export function cadenceToApiSteps(
  milestones: CadenceMilestone[],
): FollowUpCadenceApiStep[] {
  const enabled = milestones.filter((m) => {
    if (!m.enabled) return false;
    if (m.contentMode === "ai_draft") return true;
    if (m.contentMode === "custom") {
      const bodyText = String(m.customBodyHtml || "").replace(/<[^>]+>/g, "").trim();
      return !!m.customSubject.trim() && !!bodyText;
    }
    return !!m.templateId;
  });
  if (!enabled.length) return [];

  const sequenceStart = Date.now();
  let cursor = sequenceStart;

  const withTarget = enabled.map((m) => {
    const target = milestoneTargetMs(m, sequenceStart, cursor);
    const clamped = Math.max(target, cursor);
    cursor = clamped;
    return { m, target: clamped };
  });

  withTarget.sort((a, b) => a.target - b.target);

  let prev = sequenceStart;
  const out: FollowUpCadenceApiStep[] = [];

  for (const { m, target } of withTarget) {
    const wait = Math.max(0, target - prev);
    prev = target;
    const { delayDays, delayHours, delayMinutes } = msToDelayParts(wait);

    const step: FollowUpCadenceApiStep = {
      delayDays,
      delayHours,
      delayMinutes,
    };

    if (m.scheduleMode === "absolute" && m.scheduledAt) {
      const iso = datetimeLocalToIso(m.scheduledAt);
      if (iso) step.scheduledAt = iso;
    }

    if (m.contentMode === "custom") {
      step.email = {
        sendMode: "custom",
        subject: m.customSubject.trim(),
        body: m.customBodyHtml,
      };
    } else if (m.contentMode === "ai_draft") {
      step.email = {
        sendMode: "ai_draft",
        aiInstructions: buildFollowUpStepAiInstructions(m),
      };
    } else {
      step.email = { sendMode: "template", templateId: m.templateId };
    }
    if (m.inboxAccountId?.trim()) {
      step.inboxAccountId = m.inboxAccountId.trim();
      step.email.inboxAccountId = m.inboxAccountId.trim();
    }
    out.push(step);
  }

  return out;
}

export function cadenceFromApiSteps(
  steps: FollowUpCadenceApiStep[] | undefined | null,
): CadenceMilestone[] {
  const rows = (steps || []).map((step, idx) => {
    const email = step.email || {};
    const isAiDraft = email.sendMode === "ai_draft";
    const isTemplate = !isAiDraft && (email.sendMode === "template" || !!email.templateId);
    return {
      id: `loaded-${idx + 1}-${Math.random().toString(36).slice(2, 8)}`,
      enabled: true,
      isCustom: true,
      scheduleMode: step.scheduledAt ? ("absolute" as const) : ("after_previous" as const),
      dayFromStart: 0,
      hoursFromStart: 0,
      minutesFromStart: 0,
      delayDays: Number(step.delayDays) || 0,
      delayHours: Number(step.delayHours) || 0,
      delayMinutes: Number(step.delayMinutes) || 0,
      scheduledAt: step.scheduledAt
        ? toDatetimeLocalValue(new Date(step.scheduledAt))
        : defaultDatetimeLocalMinutesFromNow(24 * 60),
      sendEmail: true,
      contentMode: isAiDraft
        ? ("ai_draft" as const)
        : isTemplate
          ? ("template" as const)
          : ("custom" as const),
      templateId: isTemplate ? email.templateId || "" : "",
      customSubject: !isTemplate ? email.subject || "" : "",
      customBodyHtml: !isTemplate ? email.body || "<p></p>" : "<p></p>",
      inboxAccountId: email.inboxAccountId || step.inboxAccountId || "",
      createTask: false,
      taskTitle: "",
      taskBody: "",
      taskDueInDays: 0,
      ifNotOpenedEnabled: false,
      ifNotOpenedWaitMode: "2d" as const,
      ifNotOpenedWaitDays: 2,
      ifNotOpenedWaitHours: 0,
      ifNotOpenedWaitMinutes: 0,
      ifNotOpenedDeadlineAt: defaultDatetimeLocalMinutesFromNow(2 * 24 * 60),
      ifNotOpenedContentMode: "custom" as const,
      ifNotOpenedTemplateId: "",
      ifNotOpenedCustomSubject: "",
      ifNotOpenedCustomBodyHtml: "",
      ifNotOpenedInboxAccountId: "",
    };
  });
  return rows.length ? rows : defaultCadenceMilestones();
}

export function validateMilestones(
  milestones: CadenceMilestone[],
): string | null {
  const enabled = milestones.filter((m) => m.enabled);
  if (!enabled.length) {
    return "Enable at least one follow-up step";
  }

  const now = Date.now();
  const minFuture = now + 60_000;

  for (const m of enabled) {
    if (m.contentMode === "custom") {
      const bodyText = String(m.customBodyHtml || "").replace(/<[^>]+>/g, "").trim();
      if (!m.customSubject.trim()) {
        return `Enter a subject for "${milestoneScheduleLabel(m)}"`;
      }
      if (!bodyText) {
        return `Write a message body for "${milestoneScheduleLabel(m)}"`;
      }
    } else if (m.contentMode !== "ai_draft" && !m.templateId) {
      return `Choose an email template or switch to custom content for "${milestoneScheduleLabel(m)}"`;
    }
    if (m.scheduleMode === "absolute") {
      const iso = datetimeLocalToIso(m.scheduledAt);
      if (!iso) {
        return "Pick a valid date and time for the scheduled step";
      }
      if (new Date(iso).getTime() < minFuture) {
        return "Scheduled date & time must be at least 1 minute in the future";
      }
    }
    if (m.scheduleMode === "from_start") {
      const total =
        (m.dayFromStart || 0) * 86400 +
        (m.hoursFromStart || 0) * 3600 +
        (m.minutesFromStart || 0) * 60;
      if (total <= 0) {
        return "Set days and/or hours for when this step runs from sequence start";
      }
    }
    if (m.scheduleMode === "after_previous") {
      const total =
        (m.delayDays || 0) * 86400 +
        (m.delayHours || 0) * 3600 +
        (m.delayMinutes || 0) * 60;
      if (total <= 0) {
        return "Set a delay (days, hours, or minutes) after the previous step";
      }
    }
  }

  return null;
}
