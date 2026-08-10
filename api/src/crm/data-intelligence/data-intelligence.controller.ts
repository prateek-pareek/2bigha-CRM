import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { DataIntelligenceService } from './data-intelligence.service';
import { QueryDataIntelligenceDto } from './dto/query-data-intelligence.dto';

@Controller('crm/data-intelligence')
@UseGuards(JwtAuthGuard, RbacGuard)
export class DataIntelligenceController {
  constructor(private readonly dataIntelligence: DataIntelligenceService) {}

  @Get('status')
  @Permissions('dashboard:read', 'settings:read', 'admin:read')
  getStatus() {
    return this.dataIntelligence.getStatus();
  }

  @Post('query')
  @Permissions('dashboard:read')
  query(@Body() dto: QueryDataIntelligenceDto, @Request() req: any) {
    return this.dataIntelligence.query(
      dto,
      req.user,
      req.crmDbUser ?? req.user?.crmDbUser,
    );
  }
}
