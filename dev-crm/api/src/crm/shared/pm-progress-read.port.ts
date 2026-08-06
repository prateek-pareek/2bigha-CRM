import { Types } from 'mongoose';

export const PM_PROGRESS_READ_PORT = 'PM_PROGRESS_READ_PORT';
export const PM_PROGRESS_READ_MODE = 'PM_PROGRESS_READ_MODE';

export type PmIssueStatusMove = {
  issue: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: Date | string | null;
};

export type PmIssueSummary = {
  _id: string;
  key: string;
  summary: string;
  status: string;
};

export interface PmProgressReadPort {
  findRecentStatusMoves(since: Date): Promise<PmIssueStatusMove[]>;
  findProjectIssuesByIds(
    projectId: Types.ObjectId,
    issueIds: Types.ObjectId[],
  ): Promise<PmIssueSummary[]>;
}
