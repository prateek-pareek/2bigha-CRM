import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { DuplicatesService } from './duplicates.service';

@Controller('crm/admin/duplicates')
@UseGuards(JwtAuthGuard, RbacGuard)
export class DuplicatesController {
  constructor(private readonly duplicatesService: DuplicatesService) {}

  @Get('rules')
  @Permissions('admin:manage')
  getRules() {
    return this.duplicatesService.getMergeRules();
  }

  @Get('scan')
  @Permissions('admin:manage')
  scan(@Query('entityType') entityType?: string) {
    const t = (entityType || 'lead').toLowerCase();
    if (t === 'contact') return this.duplicatesService.scanContacts();
    return this.duplicatesService.scanLeads();
  }

  @Post('merge')
  @Permissions('admin:manage')
  merge(
    @Body()
    body: {
      entityType: 'lead' | 'contact';
      masterId: string;
      duplicateIds: string[];
    },
  ) {
    const t = (body?.entityType || 'lead').toLowerCase();
    if (t === 'contact') {
      return this.duplicatesService.mergeContacts(
        body.masterId,
        body.duplicateIds || [],
      );
    }
    return this.duplicatesService.mergeLeads(
      body.masterId,
      body.duplicateIds || [],
    );
  }
}
