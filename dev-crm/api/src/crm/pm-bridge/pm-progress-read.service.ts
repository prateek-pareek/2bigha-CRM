import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  PmIssueStatusMove,
  PmIssueSummary,
  PmProgressReadPort,
} from '../shared/pm-progress-read.port';

/**
 * No-op PM progress reader — this CRM standalone repo has no PM module.
 */
@Injectable()
export class PmProgressReadService implements PmProgressReadPort {
  async findRecentStatusMoves(_since: Date): Promise<PmIssueStatusMove[]> {
    return [];
  }

  async findProjectIssuesByIds(
    _projectId: Types.ObjectId,
    _issueIds: Types.ObjectId[],
  ): Promise<PmIssueSummary[]> {
    return [];
  }
}
