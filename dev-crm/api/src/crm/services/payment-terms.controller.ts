import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { PaymentTermsService } from './payment-terms.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { RbacGuard } from '../crm-users/rbac.guard';
import { canViewCrmRevenue } from '../shared/crm-admin-access.util';

@Controller('crm/payment-terms')
@UseGuards(JwtAuthGuard, RbacGuard)
export class PaymentTermsController {
  constructor(private readonly service: PaymentTermsService) {}

  private assertRevenueAccess(user: any) {
    if (!canViewCrmRevenue(user)) {
      throw new ForbiddenException(
        'Payment terms are restricted to the platform super administrator.',
      );
    }
  }

  @Get('deal/:dealId')
  @Permissions('admin:manage')
  findByDeal(@Param('dealId') dealId: string, @Request() req: any) {
    this.assertRevenueAccess(req.user);
    return this.service.findByDeal(dealId);
  }

  @Post()
  @Permissions('admin:manage')
  create(@Body() dto: any, @Request() req: any) {
    this.assertRevenueAccess(req.user);
    return this.service.create(dto);
  }

  @Put(':id')
  @Permissions('admin:manage')
  update(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    this.assertRevenueAccess(req.user);
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions('admin:manage')
  remove(@Param('id') id: string, @Request() req: any) {
    this.assertRevenueAccess(req.user);
    return this.service.remove(id);
  }
}
