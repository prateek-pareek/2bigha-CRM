import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { LlmClientService } from './llm-client.service';

@Controller('llm')
@UseGuards(JwtAuthGuard)
export class LlmController {
  constructor(private readonly llm: LlmClientService) { }

  @Get('status')
  getStatus() {
    return this.llm.getStatus();
  }
}
