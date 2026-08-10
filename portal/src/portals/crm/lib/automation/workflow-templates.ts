import type { WorkflowCanvasApiGraph } from "@/lib/crm/workflow-canvas-graph";

export type WorkflowTemplatePreset = {
  id: string;
  name: string;
  description: string;
  /** Suggested trigger; user can change. */
  trigger: string;
  graph: WorkflowCanvasApiGraph;
};

/**
 * Pre-built canvas graphs. Choose email templates and (for deliverability) enable mailbox split + jitter on Send email steps.
 */
export const WORKFLOW_CANVAS_TEMPLATES: WorkflowTemplatePreset[] = [
  {
    id: "open_followup_split",
    name: "Open tracking → branch + multi-sender follow-up",
    description:
      "First touch with optional jitter, wait for an open, then either a task (opened) or a follow-up email. On each Send email, select 2+ inboxes under “Split across mailboxes” and set send jitter to spread load.",
    trigger: "lead_created",
    graph: {
      nodes: [
        {
          id: "send-1",
          type: "wf_action",
          action: {
            type: "send_email_template",
            templateId: "",
            sendJitterSecondsMax: 45,
          },
        },
        {
          id: "wait-open",
          type: "wf_wait_email_engagement",
          waitTotalMinutes: 48 * 60,
          pollMinutes: 5,
        },
        {
          id: "task-opened",
          type: "wf_action",
          action: { type: "create_task", title: "Lead opened — call", body: "They engaged with the first email.", dueInDays: 1 },
        },
        {
          id: "send-followup",
          type: "wf_action",
          action: {
            type: "send_email_template",
            templateId: "",
            sendJitterSecondsMax: 60,
          },
        },
      ],
      edges: [
        { id: "e0", source: "__start__", target: "send-1", branch: "default" },
        { id: "e1", source: "send-1", target: "wait-open", branch: "default" },
        { id: "e2", source: "wait-open", target: "task-opened", branch: "yes" },
        { id: "e3", source: "wait-open", target: "send-followup", branch: "no" },
      ],
    },
  },
  {
    id: "follow_up_stop_on_reply",
    name: "Follow-up cadence (stop if they reply)",
    description:
      "Three template emails: first after 2 days, then +5 days, then +7 days. Remaining sends cancel automatically when the lead/contact replies. Pick templates on each Send email step.",
    trigger: "manual_enrollment",
    graph: {
      nodes: [
        {
          id: "d0",
          type: "wf_delay",
          days: 2,
          hours: 0,
          minutes: 0,
        },
        {
          id: "s1",
          type: "wf_action",
          action: {
            type: "send_email_template",
            templateId: "",
            sendJitterSecondsMax: 60,
          },
        },
        {
          id: "d1",
          type: "wf_delay",
          days: 5,
          hours: 0,
          minutes: 0,
        },
        {
          id: "s2",
          type: "wf_action",
          action: {
            type: "send_email_template",
            templateId: "",
            sendJitterSecondsMax: 60,
          },
        },
        {
          id: "d2",
          type: "wf_delay",
          days: 7,
          hours: 0,
          minutes: 0,
        },
        {
          id: "s3",
          type: "wf_action",
          action: {
            type: "send_email_template",
            templateId: "",
            sendJitterSecondsMax: 60,
          },
        },
      ],
      edges: [
        { id: "f0", source: "__start__", target: "d0", branch: "default" },
        { id: "f1", source: "d0", target: "s1", branch: "default" },
        { id: "f2", source: "s1", target: "d1", branch: "default" },
        { id: "f3", source: "d1", target: "s2", branch: "default" },
        { id: "f4", source: "s2", target: "d2", branch: "default" },
        { id: "f5", source: "d2", target: "s3", branch: "default" },
      ],
    },
  },
  {
    id: "cadence_deliverability",
    name: "Slow cadence (deliverability)",
    description:
      "Two-step nurture with a multi-day delay between sends. Add mailbox rotation on each Send email step to reduce volume per sender.",
    trigger: "lead_stage_changed",
    graph: {
      nodes: [
        {
          id: "a1",
          type: "wf_action",
          action: {
            type: "send_email_template",
            templateId: "",
            sendJitterSecondsMax: 90,
          },
        },
        { id: "d1", type: "wf_delay", days: 2, hours: 0, minutes: 0 },
        {
          id: "a2",
          type: "wf_action",
          action: {
            type: "send_email_template",
            templateId: "",
            sendJitterSecondsMax: 90,
          },
        },
      ],
      edges: [
        { id: "c0", source: "__start__", target: "a1", branch: "default" },
        { id: "c1", source: "a1", target: "d1", branch: "default" },
        { id: "c2", source: "d1", target: "a2", branch: "default" },
      ],
    },
  },
  {
    id: "open_call_task",
    name: "Open → call task (24h)",
    description:
      "When a tracked email is opened for the first time, create a call task for the rep. Enable on leads with trigger “Lead — tracked email opened”.",
    trigger: "lead_tracked_email_opened",
    graph: {
      nodes: [
        {
          id: "task-call",
          type: "wf_action",
          action: {
            type: "create_task",
            title: "Email opened — call within 24h",
            body: "Lead engaged with your email. Call while intent is high.",
            dueInDays: 1,
          },
        },
      ],
      edges: [
        { id: "o0", source: "__start__", target: "task-call", branch: "default" },
      ],
    },
  },
  {
    id: "open_move_stage",
    name: "Open → move lead stage",
    description:
      "When a tracked email is opened for the first time, update the lead stage. Pick the stage in the Set property action after applying the template.",
    trigger: "lead_tracked_email_opened",
    graph: {
      nodes: [
        {
          id: "set-stage-open",
          type: "wf_action",
          action: {
            type: "set_property",
            field: "stage",
            value: "Contacted",
          },
        },
      ],
      edges: [
        { id: "os0", source: "__start__", target: "set-stage-open", branch: "default" },
      ],
    },
  },
  {
    id: "reply_move_stage",
    name: "Reply → move lead stage",
    description:
      "When the client replies to a tracked CRM email, update pipeline stage automatically. Adjust the stage value to match your pipeline.",
    trigger: "lead_tracked_email_replied",
    graph: {
      nodes: [
        {
          id: "set-stage-reply",
          type: "wf_action",
          action: {
            type: "set_property",
            field: "stage",
            value: "Qualified",
          },
        },
      ],
      edges: [
        { id: "rs0", source: "__start__", target: "set-stage-reply", branch: "default" },
      ],
    },
  },
  {
    id: "reply_sla",
    name: "Reply SLA — task + Teams",
    description:
      "When the client replies to a tracked email, create a same-day task and optional Teams alert. Or use manual enrollment for ad-hoc runs.",
    trigger: "lead_tracked_email_replied",
    graph: {
      nodes: [
        {
          id: "task-reply",
          type: "wf_action",
          action: {
            type: "create_task",
            title: "Reply received — respond within 2h",
            body: "Check inbox thread and send a thoughtful reply.",
            dueInDays: 0,
          },
        },
        {
          id: "teams-notify",
          type: "wf_action",
          action: {
            type: "notify_teams",
            message: "CRM: recipient replied — please respond.",
            email: "",
          },
        },
      ],
      edges: [
        { id: "r0", source: "__start__", target: "task-reply", branch: "default" },
        { id: "r1", source: "task-reply", target: "teams-notify", branch: "default" },
      ],
    },
  },
  {
    id: "post_meeting_nurture",
    name: "Post-meeting nurture",
    description:
      "After lead moves to Meeting Scheduled: wait 2 days, send check-in template. Use trigger “Lead — stage changed” and filter stage = Meeting Scheduled.",
    trigger: "lead_stage_changed",
    graph: {
      nodes: [
        { id: "d-wait", type: "wf_delay", days: 2, hours: 0, minutes: 0 },
        {
          id: "send-checkin",
          type: "wf_action",
          action: {
            type: "send_email_template",
            templateId: "",
            sendJitterSecondsMax: 30,
          },
        },
      ],
      edges: [
        { id: "m0", source: "__start__", target: "d-wait", branch: "default" },
        { id: "m1", source: "d-wait", target: "send-checkin", branch: "default" },
      ],
    },
  },
  {
    id: "deal_opened_ae_alert",
    name: "Deal email opened — AE task",
    description:
      "When a tracked deal email is opened, create a task for the AE. Trigger: Deal — tracked email opened.",
    trigger: "deal_tracked_email_opened",
    graph: {
      nodes: [
        {
          id: "deal-task",
          type: "wf_action",
          action: {
            type: "create_task",
            title: "Prospect opened deal email",
            body: "Review engagement and plan next step on the deal.",
            dueInDays: 1,
          },
        },
      ],
      edges: [
        { id: "d0", source: "__start__", target: "deal-task", branch: "default" },
      ],
    },
  },
  {
    id: "cadence_deliverability_3",
    name: "3-step cadence (deliverability)",
    description:
      "Three emails with 2-day gaps and jitter. Add mailbox split on each send for volume spreading.",
    trigger: "lead_created",
    graph: {
      nodes: [
        {
          id: "s0",
          type: "wf_action",
          action: {
            type: "send_email_template",
            templateId: "",
            sendJitterSecondsMax: 60,
          },
        },
        { id: "d1", type: "wf_delay", days: 2, hours: 0, minutes: 0 },
        {
          id: "s1",
          type: "wf_action",
          action: {
            type: "send_email_template",
            templateId: "",
            sendJitterSecondsMax: 90,
          },
        },
        { id: "d2", type: "wf_delay", days: 2, hours: 0, minutes: 0 },
        {
          id: "s2",
          type: "wf_action",
          action: {
            type: "send_email_template",
            templateId: "",
            sendJitterSecondsMax: 90,
          },
        },
      ],
      edges: [
        { id: "x0", source: "__start__", target: "s0", branch: "default" },
        { id: "x1", source: "s0", target: "d1", branch: "default" },
        { id: "x2", source: "d1", target: "s1", branch: "default" },
        { id: "x3", source: "s1", target: "d2", branch: "default" },
        { id: "x4", source: "d2", target: "s2", branch: "default" },
      ],
    },
  },
  {
    id: "qualified_move_and_segment",
    name: "Move to pipeline + add to segment when qualified",
    description:
      "When a lead opens a tracked email and is in your target segment, move them to a sales pipeline/stage and add to a static segment for campaigns. Pick pipeline, stage, and segment on each action.",
    trigger: "lead_tracked_email_opened",
    graph: {
      nodes: [
        {
          id: "cond-qualified",
          type: "wf_condition",
          filters: [
            { filterKind: "segment", field: "_segment", operator: "in_segment", value: "" },
            { filterKind: "property", field: "stage", operator: "not_equals", value: "" },
          ],
        },
        {
          id: "move-pipeline",
          type: "wf_action",
          action: { type: "move_pipeline_stage", pipelineId: "", stage: "" },
        },
        {
          id: "add-segment",
          type: "wf_action",
          action: { type: "add_to_segment", segmentId: "" },
        },
      ],
      edges: [
        { id: "q0", source: "__start__", target: "cond-qualified", branch: "default" },
        { id: "q1", source: "cond-qualified", target: "move-pipeline", branch: "yes" },
        { id: "q2", source: "move-pipeline", target: "add-segment", branch: "default" },
      ],
    },
  },
];
