import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CRMModule } from '../crm.module';
import { AnthropicModule } from '../../integrations/anthropic/anthropic.module';
import { CRMUsersModule } from '../crm-users/crm-users.module';
import { SalesAgentController, SalesCopilotController } from './sales-agent.controller';
import { SalesAgentService } from './sales-agent.service';
import { SalesAgentPolicyService } from './sales-agent-policy.service';
import {
  SalesAgentCronService,
  SalesAgentTriggerService,
} from './sales-agent-cron.service';
import {
  SalesAgentRun,
  SalesAgentRunSchema,
} from './schemas/sales-agent-run.schema';
import {
  SalesAgentApproval,
  SalesAgentApprovalSchema,
} from './schemas/sales-agent-approval.schema';
import {
  SalesAgentSettings,
  SalesAgentSettingsSchema,
} from './schemas/sales-agent-settings.schema';
import { Lead, LeadSchema } from '../schemas/lead.schema';
import { Deal, DealSchema } from '../schemas/deal.schema';

@Module({
  imports: [
    AnthropicModule,
    CRMUsersModule,
    forwardRef(() => CRMModule),
    MongooseModule.forFeature(
      [
        { name: SalesAgentRun.name, schema: SalesAgentRunSchema },
        { name: SalesAgentApproval.name, schema: SalesAgentApprovalSchema },
        { name: SalesAgentSettings.name, schema: SalesAgentSettingsSchema },
        { name: Lead.name, schema: LeadSchema },
        { name: Deal.name, schema: DealSchema },
      ],
      'crmConnection',
    ),
  ],
  controllers: [SalesAgentController, SalesCopilotController],
  providers: [
    SalesAgentService,
    SalesAgentPolicyService,
    SalesAgentTriggerService,
    SalesAgentCronService,
  ],
  exports: [SalesAgentService, SalesAgentTriggerService],
})
export class SalesAgentModule {}
