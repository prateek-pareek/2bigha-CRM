/** Map proposal pipeline stage names ↔ legacy status enum. */

export const PROPOSAL_STATUS_VALUES = [
  'draft',
  'sent',
  'accepted',
  'declined',
  'expired',
  'archived',
] as const;

export type ProposalStatusValue = (typeof PROPOSAL_STATUS_VALUES)[number];

const STAGE_TO_STATUS: Record<string, ProposalStatusValue> = {
  draft: 'draft',
  'internal review': 'draft',
  review: 'draft',
  sent: 'sent',
  negotiation: 'sent',
  accepted: 'accepted',
  won: 'accepted',
  declined: 'declined',
  lost: 'declined',
  expired: 'expired',
  archived: 'archived',
};

const STATUS_TO_DEFAULT_STAGE: Record<ProposalStatusValue, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
  archived: 'Archived',
};

export function proposalStatusFromStage(stage?: string | null): ProposalStatusValue | null {
  const key = String(stage || '')
    .trim()
    .toLowerCase();
  if (!key) return null;
  return STAGE_TO_STATUS[key] || null;
}

export function proposalStageFromStatus(status?: string | null): string {
  const key = String(status || 'draft')
    .trim()
    .toLowerCase() as ProposalStatusValue;
  return STATUS_TO_DEFAULT_STAGE[key] || 'Draft';
}

export const DEFAULT_PROPOSAL_PIPELINE_STAGES = [
  { name: 'Draft', probability: 10, order: 1, isDefault: true },
  { name: 'Internal Review', probability: 25, order: 2, isDefault: false },
  { name: 'Sent', probability: 45, order: 3, isDefault: false },
  { name: 'Negotiation', probability: 65, order: 4, isDefault: false },
  { name: 'Accepted', probability: 100, order: 5, isDefault: false },
  { name: 'Declined', probability: 0, order: 6, isDefault: false },
  { name: 'Expired', probability: 0, order: 7, isDefault: false },
  { name: 'Archived', probability: 0, order: 8, isDefault: false },
];
