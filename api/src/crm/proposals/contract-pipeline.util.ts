/** Map contract pipeline stage names ↔ shared document status enum. */

import {
  proposalStageFromStatus,
  proposalStatusFromStage,
  type ProposalStatusValue,
} from './proposal-pipeline.util';

const CONTRACT_STAGE_TO_STATUS: Record<string, ProposalStatusValue> = {
  draft: 'draft',
  'internal review': 'draft',
  review: 'draft',
  sent: 'sent',
  'awaiting signature': 'sent',
  negotiation: 'sent',
  signed: 'accepted',
  accepted: 'accepted',
  declined: 'declined',
  expired: 'expired',
  archived: 'archived',
};

const STATUS_TO_DEFAULT_CONTRACT_STAGE: Record<ProposalStatusValue, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Signed',
  declined: 'Declined',
  expired: 'Expired',
  archived: 'Archived',
};

export function contractStatusFromStage(stage?: string | null): ProposalStatusValue | null {
  const key = String(stage || '')
    .trim()
    .toLowerCase();
  if (!key) return null;
  return CONTRACT_STAGE_TO_STATUS[key] || proposalStatusFromStage(stage);
}

export function contractStageFromStatus(status?: string | null): string {
  const key = String(status || 'draft')
    .trim()
    .toLowerCase() as ProposalStatusValue;
  return STATUS_TO_DEFAULT_CONTRACT_STAGE[key] || proposalStageFromStatus(status);
}

export const DEFAULT_CONTRACT_PIPELINE_STAGES = [
  { name: 'Draft', probability: 10, order: 1, isDefault: true },
  { name: 'Internal Review', probability: 25, order: 2, isDefault: false },
  { name: 'Sent', probability: 45, order: 3, isDefault: false },
  { name: 'Awaiting Signature', probability: 60, order: 4, isDefault: false },
  { name: 'Negotiation', probability: 70, order: 5, isDefault: false },
  { name: 'Signed', probability: 100, order: 6, isDefault: false },
  { name: 'Declined', probability: 0, order: 7, isDefault: false },
  { name: 'Expired', probability: 0, order: 8, isDefault: false },
  { name: 'Archived', probability: 0, order: 9, isDefault: false },
];
