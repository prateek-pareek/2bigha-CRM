import { Controller, Get, UseGuards, Param, NotFoundException } from '@nestjs/common';
import { TwoBighaSubscriptionsService } from './twobigha-subscriptions.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Lead } from '../schemas/lead.schema';
import { Client } from '../schemas/client.schema';

@Controller('crm/subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: TwoBighaSubscriptionsService,
    @InjectModel(Lead.name, 'crmConnection') private readonly leadModel: Model<Lead>,
    @InjectModel(Client.name, 'crmConnection') private readonly clientModel: Model<Client>,
  ) {}

  @Get('plans')
  async getSubscriptionPlans() {
    return this.subscriptionsService.getSubscriptionPlans();
  }

  @Get('unbound/:leadId')
  async getUnboundSubscriptions(@Param('leadId') leadId: string) {
    const lead = await this.leadModel.findById(leadId).select('clientId').lean().exec();
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    if (!lead.clientId) {
      return [];
    }
    const client = await this.clientModel.findById(lead.clientId).select('twobighaUserId').lean().exec();
    if (!client || !client.twobighaUserId) {
      return [];
    }
    return this.subscriptionsService.getUnboundSubscriptions(client.twobighaUserId);
  }

  @Get('active-plan/:propertyId')
  async getActivePropertyPlan(@Param('propertyId') propertyId: string) {
    return this.subscriptionsService.getActivePropertyPlan(propertyId);
  }

  @Get('plan-history/:propertyId')
  async getPropertyPlanHistory(@Param('propertyId') propertyId: string) {
    return this.subscriptionsService.getPropertyPlanHistory(propertyId);
  }

  @Get('order-status/:orderId')
  async getPMOrderStatus(@Param('orderId') orderId: string) {
    return this.subscriptionsService.getPMOrderStatus(orderId);
  }

  @Get('managed-property/:propertyId')
  async getManagedPropertyDetail(@Param('propertyId') propertyId: string) {
    return this.subscriptionsService.getManagedPropertyDetail(propertyId);
  }
}
