import { Body, Controller, Get, Put, Request, UseGuards } from '@nestjs/common';
import { ProposalBrandingService } from './proposal-branding.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';

@Controller('crm/proposal-branding')
@UseGuards(JwtAuthGuard, RbacGuard)
export class ProposalBrandingController {
  constructor(private readonly brandingService: ProposalBrandingService) {}

  @Get('me')
  @Permissions(
    'proposals:read',
    'proposals:write',
    'deals:read',
    'leads:read',
  )
  async getMine(@Request() req: any) {
    const row = await this.brandingService.findForUser(req.user.userId);
    return (
      row ?? {
        agency: {},
        freelancer: {},
      }
    );
  }

  @Put('me')
  @Permissions('proposals:write', 'deals:write', 'leads:write')
  putMine(@Request() req: any, @Body() body: any) {
    return this.brandingService.upsertForUser(req.user.userId, {
      agency: body.agency,
      freelancer: body.freelancer,
    });
  }
}
