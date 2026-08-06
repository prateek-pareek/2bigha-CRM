import { Global, Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { AnthropicClientService } from './anthropic-client.service';

@Global()
@Module({
  imports: [LlmModule],
  providers: [AnthropicClientService],
  exports: [AnthropicClientService],
})
export class AnthropicModule {}
