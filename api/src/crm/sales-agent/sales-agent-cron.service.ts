import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SalesAgentService } from './sales-agent.service';
import { SalesAgentEvent } from './sales-agent.types';

@Injectable()
export class SalesAgentTriggerService {
  private readonly logger = new Logger(SalesAgentTriggerService.name);

  constructor(private readonly salesAgent: SalesAgentService) {}

  onEvent(event: SalesAgentEvent): void {
    this.salesAgent.handleEvent(event);
  }
}

@Injectable()
export class SalesAgentCronService {
  private readonly logger = new Logger(SalesAgentCronService.name);
  private running = false;

  constructor(private readonly salesAgent: SalesAgentService) {}

  @Cron('*/15 * * * *')
  async scanSalesAttention(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const count = await this.salesAgent.scanAndEnqueueFromSalesAttention();
      if (count > 0) {
        this.logger.log(`Enqueued ${count} sales agent run(s) from sales attention scan`);
      }
    } catch (err) {
      this.logger.warn(
        `Sales agent cron failed: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      this.running = false;
    }
  }
}
