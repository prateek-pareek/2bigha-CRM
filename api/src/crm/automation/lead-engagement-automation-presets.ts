import type {
  LeadEngagementAutoFollowUp,
  LeadEngagementAutomationRules,
} from '../schemas/lead-engagement-automation-template.schema';

const DEFAULT_AUTO_FOLLOW_UP: LeadEngagementAutoFollowUp = {
  enabled: false,
  cadenceDays: [2, 5, 7, 15, 30],
  cancelOnReply: true,
};

export type LeadEngagementSystemPreset = {
  key: string;
  name: string;
  description: string;
  rules: LeadEngagementAutomationRules;
  autoFollowUp: LeadEngagementAutoFollowUp;
  /** Assign to lead pipelines whose name fuzzy-matches (optional). */
  suggestedPipelineNames?: string[];
};

const baseFollowUpPattern = {
  onFollowUpSent: { stageNamePattern: 'FOLLOW-UP {n}' },
};

export const LEAD_ENGAGEMENT_SYSTEM_PRESETS: LeadEngagementSystemPreset[] = [
  {
    key: 'outreach_default',
    name: 'Outreach — open, reply & follow-ups',
    description:
      'Standard outbound: Contacted on open, Potential Leads on reply, FOLLOW-UP {n} per email, EMAIL/MESSAGE NOT OPENED when cadence ends. Auto follow-up off by default.',
    rules: {
      onEmailOpened: {
        stageName: 'Contacted',
        syncContact: true,
        onlyIfStages: ['New'],
      },
      onReply: {
        pipelineName: 'Potential Leads',
        stageNameInTargetPipeline: 'Potential Leads',
      },
      onFollowUpSent: { stageNamePattern: 'FOLLOW-UP {n}' },
      onFollowUpSequenceComplete: { stageName: 'EMAIL/MESSAGE NOT OPENED' },
    },
    autoFollowUp: { ...DEFAULT_AUTO_FOLLOW_UP },
    suggestedPipelineNames: ['Lead Qualification', 'Outbound', 'Sales'],
  },
  {
    key: 'fast_outbound',
    name: 'Fast outbound (SDR)',
    description:
      'High-velocity SDR: faster cadence (1, 3, 7, 14 days). Open → Contacted + call task. Reply → Potential Leads + respond task.',
    rules: {
      onEmailOpened: {
        stageName: 'Contacted',
        syncContact: true,
        onlyIfStages: ['New'],
        createTask: {
          title: 'Lead opened email — call today',
          body: 'They opened your outreach. Call while intent is high.',
          dueInDays: 0,
        },
      },
      onReply: {
        pipelineName: 'Potential Leads',
        stageNameInTargetPipeline: 'Potential Leads',
        createTask: {
          title: 'Reply received — respond within 2h',
          body: 'Inbound reply on lead thread.',
          dueInDays: 0,
        },
      },
      ...baseFollowUpPattern,
      onFollowUpSequenceComplete: { stageName: 'EMAIL/MESSAGE NOT OPENED' },
    },
    autoFollowUp: {
      enabled: true,
      cadenceDays: [1, 3, 7, 14],
      cancelOnReply: true,
    },
    suggestedPipelineNames: ['Outbound', 'SDR', 'New outreach'],
  },
  {
    key: 'enterprise',
    name: 'Enterprise / long cycle',
    description:
      'Slower cadence (5, 10, 20, 30, 45). Reply → Qualified or Meeting Scheduled stage. Auto follow-up optional.',
    rules: {
      onEmailOpened: {
        stageName: 'Contacted',
        syncContact: true,
        onlyIfStages: ['New', 'Contacted'],
      },
      onReply: {
        stageName: 'Qualified',
        createTask: {
          title: 'Enterprise lead replied — schedule discovery',
          body: 'Review thread and book next step.',
          dueInDays: 1,
        },
      },
      ...baseFollowUpPattern,
      onFollowUpSequenceComplete: { stageName: 'Disqualified' },
    },
    autoFollowUp: {
      enabled: false,
      cadenceDays: [5, 10, 20, 30, 45],
      cancelOnReply: true,
    },
    suggestedPipelineNames: ['Enterprise', 'Named account', 'Strategic'],
  },
  {
    key: 'inbound_hot',
    name: 'Inbound / hot leads',
    description:
      'No auto emails on create (manual first touch). Stage moves on open/reply only. Reply → Potential Leads or Qualified.',
    rules: {
      onEmailOpened: {
        stageName: 'Contacted',
        syncContact: true,
      },
      onReply: {
        pipelineName: 'Potential Leads',
        stageNameInTargetPipeline: 'Qualified',
        createTask: {
          title: 'Inbound reply — respond ASAP',
          dueInDays: 0,
        },
      },
      ...baseFollowUpPattern,
      onFollowUpSequenceComplete: { stageName: 'EMAIL/MESSAGE NOT OPENED' },
    },
    autoFollowUp: {
      enabled: false,
      cadenceDays: [2, 5, 7, 15, 30],
      cancelOnReply: true,
    },
    suggestedPipelineNames: ['Inbound', 'Webinar', 'Referral', 'Hot'],
  },
  {
    key: 're_engagement',
    name: 'Re-engagement / stale recycle',
    description:
      'Recycle lists: 7, 14, 21 day cadence. End → Nurture or Lost — no response.',
    rules: {
      onEmailOpened: { stageName: 'Contacted' },
      onReply: {
        pipelineName: 'Potential Leads',
        stageNameInTargetPipeline: 'Potential Leads',
      },
      ...baseFollowUpPattern,
      onFollowUpSequenceComplete: {
        stageName: 'Nurture',
        createTask: {
          title: 'Cadence complete — review before archive',
          body: 'No reply after full re-engagement sequence.',
          dueInDays: 2,
        },
      },
    },
    autoFollowUp: {
      enabled: true,
      cadenceDays: [7, 14, 21],
      cancelOnReply: true,
    },
    suggestedPipelineNames: ['Re-engagement', 'Recycle', 'Nurture'],
  },
  {
    key: 'content_nurture',
    name: 'Content-led nurture',
    description:
      'Standard 2/5/7/15/30 cadence; use per-day email templates in template editor. Content variety per touchpoint.',
    rules: {
      onEmailOpened: { stageName: 'Contacted', syncContact: true },
      onReply: {
        pipelineName: 'Potential Leads',
        stageNameInTargetPipeline: 'Potential Leads',
      },
      ...baseFollowUpPattern,
      onFollowUpSequenceComplete: { stageName: 'EMAIL/MESSAGE NOT OPENED' },
    },
    autoFollowUp: {
      enabled: true,
      cadenceDays: [2, 5, 7, 15, 30],
      cancelOnReply: true,
    },
    suggestedPipelineNames: ['Marketing', 'MQL', 'Content'],
  },
];
