import { Body, Controller, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { OwnershipTransferService, OwnershipTransferDto } from './ownership-transfer.service';

@Controller('crm')
@UseGuards(JwtAuthGuard, RbacGuard)
export class OwnershipTransferController {
  constructor(private readonly transferService: OwnershipTransferService) {}

  @Post('leads/:id/transfer')
  @Permissions('leads:write')
  transferLead(@Param('id') id: string, @Body() dto: OwnershipTransferDto, @Request() req: any) {
    return this.transferService.transfer('Lead', id, dto, req.user);
  }

  @Post('legal-cases/:id/transfer')
  @Permissions('legal:write')
  transferLegalCase(@Param('id') id: string, @Body() dto: OwnershipTransferDto, @Request() req: any) {
    return this.transferService.transfer('LegalCase', id, dto, req.user);
  }
}
