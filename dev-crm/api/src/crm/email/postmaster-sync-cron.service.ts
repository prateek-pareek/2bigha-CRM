import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PostmasterService } from './postmaster.service';

@Injectable()
export class PostmasterSyncCronService {
  private readonly logger = new Logger(PostmasterSyncCronService.name);

  constructor(private readonly postmasterService: PostmasterService) {}

  @Cron('0 2 * * *')
  async syncDailyStats(): Promise<void> {
    try {
      this.logger.log('Starting Postmaster Tools daily sync...');
      const config = await this.postmasterService.getConfig();
      if (!config?.isActive) {
        this.logger.debug('Postmaster Tools not active, skipping sync');
        return;
      }
      await this.postmasterService.syncAllDomains();
      this.logger.log('Postmaster Tools daily sync completed successfully');
    } catch (error) {
      this.logger.error(
        `Postmaster Tools daily sync failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
