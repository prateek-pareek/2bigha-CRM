import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { ContactDuplicatesService } from './contact-duplicates.service';

/**
 * Own prefix (not `contacts/duplicates`) so these static routes can never be
 * shadowed by `contacts/:id`. Cluster listing and merging are admin-only,
 * enforced in the service.
 */
@Controller('crm/contact-duplicates')
@UseGuards(JwtAuthGuard, RbacGuard)
export class ContactDuplicatesController {
  constructor(private readonly contactDuplicates: ContactDuplicatesService) {}

  /** Duplicate check for the Add / Edit Contact form (name / email / phone). */
  @Get('check')
  @Permissions('contacts:read')
  check(
    @Query('firstName') firstName?: string,
    @Query('lastName') lastName?: string,
    @Query('email') email?: string,
    @Query('phone') phone?: string,
    @Query('mobileNo') mobileNo?: string,
    @Query('excludeId') excludeId?: string,
  ) {
    return this.contactDuplicates.check({
      firstName,
      lastName,
      email,
      phone,
      mobileNo,
      excludeId,
    });
  }

  @Get('summary')
  @Permissions('contacts:read')
  summary(@Request() req: any) {
    return this.contactDuplicates.summary(req.user);
  }

  @Get('groups')
  @Permissions('contacts:write')
  groups(@Request() req: any) {
    return this.contactDuplicates.listGroups(req.user);
  }

  @Post('merge')
  @Permissions('contacts:write')
  merge(
    @Body() body: { masterId: string; duplicateIds: string[] },
    @Request() req: any,
  ) {
    return this.contactDuplicates.merge(body?.masterId, body?.duplicateIds || [], req.user);
  }

  @Post('merge-bulk')
  @Permissions('contacts:write')
  mergeBulk(
    @Body() body: { groups: Array<{ masterId: string; duplicateIds: string[] }> },
    @Request() req: any,
  ) {
    return this.contactDuplicates.mergeGroups(body?.groups || [], req.user);
  }
}
