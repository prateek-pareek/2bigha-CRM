import type { DealEngagementAutomationRules } from '../schemas/deal-engagement-automation-template.schema';

export type DealEngagementSystemPreset = {
  key: string;
  name: string;
  description: string;
  rules: DealEngagementAutomationRules;
  suggestedPipelineNames?: string[];
};

export const DEAL_ENGAGEMENT_SYSTEM_PRESETS: DealEngagementSystemPreset[] = [
  {
    key: 'deal_standard',
    name: 'Deal — engagement & stages',
    description:
      'On tracked email open → task for AE. On reply → Negotiation stage + task. Proposal stage entry → prep task.',
    rules: {
      onEmailOpened: {
        createTask: {
          title: 'Prospect opened deal email',
          body: 'Review engagement and plan next step.',
          dueInDays: 1,
        },
      },
      onReply: {
        stageName: 'Negotiation',
        createTask: {
          title: 'Deal reply — respond within 4h',
          dueInDays: 0,
        },
      },
      onDealStageEntered: {
        stageName: 'Proposal',
        createTask: {
          title: 'Proposal stage — send proposal & confirm receipt',
          dueInDays: 1,
        },
      },
    },
    suggestedPipelineNames: ['Standard Sales', 'Sales', 'Deals'],
  },
  {
    key: 'deal_at_risk',
    name: 'Deal — stale / at risk',
    description:
      'When deal enters At risk stage, create review task for owner.',
    rules: {
      onDealStageEntered: {
        stageName: 'At risk',
        createTask: {
          title: 'Deal at risk — recovery plan',
          body: 'No recent activity; schedule executive touch or close lost.',
          dueInDays: 0,
        },
      },
    },
    suggestedPipelineNames: ['Enterprise', 'Strategic'],
  },
];
