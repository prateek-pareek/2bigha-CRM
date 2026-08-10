import { Module } from '@nestjs/common';
import { CRMModule } from '../crm.module';
import { AnthropicModule } from '../../integrations/anthropic/anthropic.module';
import { CRMUsersModule } from '../crm-users/crm-users.module';
import { DataIntelligenceController } from './data-intelligence.controller';
import { DataIntelligenceService } from './data-intelligence.service';

@Module({
  imports: [AnthropicModule, CRMModule, CRMUsersModule],
  controllers: [DataIntelligenceController],
  providers: [DataIntelligenceService],
})
export class DataIntelligenceModule {}
