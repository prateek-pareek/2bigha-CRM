import { Global, Module } from '@nestjs/common';
import { CrmOutreachAiSettingsModule } from '../../crm/crm-outreach-ai-settings.module';
import { LlmClientService } from './llm-client.service';
import { LlmConfigService } from './llm-config.service';
import { LlmController } from './llm.controller';

@Global()
@Module({
  imports: [CrmOutreachAiSettingsModule],
  controllers: [LlmController],
  providers: [LlmConfigService, LlmClientService],
  exports: [LlmConfigService, LlmClientService],
})
export class LlmModule {}
