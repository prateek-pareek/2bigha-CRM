import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HrmsIntegrationService } from './hrms-integration.service';

@Injectable()
export class HrmsAvailabilityCronService {
  private readonly logger = new Logger(HrmsAvailabilityCronService.name);

  constructor(private readonly hrmsIntegration: HrmsIntegrationService) {}

  /** Clear "Unavailable Today" from previous days at start of each day. */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async revertStaleAvailability() {
    try {
      const n = await this.hrmsIntegration.revertStaleAvailability();
      if (n > 0) {
        this.logger.log(`Reverted stale unavailable flags for ${n} CRM user(s)`);
      }
    } catch (err) {
      this.logger.error('Failed to revert stale HRMS availability', err as Error);
    }
  }
}
