import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MetaLeadAdsService } from './meta-lead-ads.service';

/**
 * Safety net for MetaLeadAdsWebhookController — catches leads Meta never
 * delivered a webhook for (dropped delivery, an outage window, a
 * re-subscription gap) by periodically asking the Graph API directly for
 * anything created since the last successful pass. All of the actual
 * fetch/map/dedupe/create logic lives in MetaLeadAdsService.pollForNewLeads
 * (shared with the webhook path) — this service is just the schedule.
 * A no-op (near-instant) when Meta Lead Ads isn't configured/active.
 */
@Injectable()
export class MetaLeadAdsPollingCronService {
  private readonly logger = new Logger(MetaLeadAdsPollingCronService.name);

  constructor(private readonly metaLeadAdsService: MetaLeadAdsService) {}

  @Cron('0 */15 * * * *') // every 15 minutes — not a built-in CronExpression preset
  async pollForMissedLeads() {
    try {
      const { created, formsPolled, error } = await this.metaLeadAdsService.pollForNewLeads();
      if (error) {
        this.logger.warn(`Meta Lead Ads polling fallback skipped: ${error}`);
        return;
      }
      if (created > 0) {
        this.logger.log(
          `Meta Lead Ads polling fallback created ${created} lead(s) across ${formsPolled} form(s) the webhook missed.`,
        );
      }
    } catch (e: any) {
      this.logger.error(`Meta Lead Ads polling fallback error: ${e?.message}`);
    }
  }
}
