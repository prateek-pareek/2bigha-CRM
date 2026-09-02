import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { TwoBighaSubscriptionsService } from './twobigha-subscriptions.service';
import { TwoBighaPmWorkflowService } from '../property-listings/twobigha-pm-workflow.service';
import { PmActivityLogService } from './pm-activity-log.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Lead } from '../schemas/lead.schema';
import { Client } from '../schemas/client.schema';
import { Contact } from '../schemas/contact.schema';
import { CreatePmOrderDto, VerifyPmPaymentDto } from './dto/pm-order.dto';
import { resolveTwobighaUserIdForLeadId } from '../shared/twobigha-lead-client.util';

@Controller('crm/subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: TwoBighaSubscriptionsService,
    private readonly pmWorkflow: TwoBighaPmWorkflowService,
    private readonly pmActivityLog: PmActivityLogService,
    @InjectModel(Lead.name, 'crmConnection') private readonly leadModel: Model<Lead>,
    @InjectModel(Client.name, 'crmConnection') private readonly clientModel: Model<Client>,
    @InjectModel(Contact.name, 'crmConnection') private readonly contactModel: Model<Contact>,
  ) {}

  @Get('plans')
  async getSubscriptionPlans() {
    return this.subscriptionsService.getSubscriptionPlans();
  }

  @Get('pm-plans')
  async getPMPlans() {
    return this.subscriptionsService.getPMPlans();
  }

  @Get('pm-plans/variant/:variantId')
  async getPMPlanVariant(@Param('variantId') variantId: string) {
    return this.subscriptionsService.getPMPlanVariant(Number(variantId));
  }

  @Get('unbound/:leadId')
  async getUnboundSubscriptions(@Param('leadId') leadId: string) {
    const userId = await this.resolveTwobighaUserId(leadId);
    if (!userId) return [];
    return this.subscriptionsService.getUnboundSubscriptions(userId);
  }

  @Get('pm-payments/:leadId')
  async getPmPayments(@Param('leadId') leadId: string) {
    const search = await this.resolveLeadSearchTerm(leadId);
    if (!search) return { payments: [], totalCount: 0 };
    return this.subscriptionsService.getPmPaymentHistory(search, 1, 20);
  }

  @Get('pm-activity/:leadId')
  async getPmActivity(@Param('leadId') leadId: string) {
    return this.pmActivityLog.listForLead(leadId, 40);
  }

  @Get('pm-activity/property/:listingId')
  async getPmActivityForProperty(@Param('listingId') listingId: string) {
    return this.pmActivityLog.listForProperty(listingId, 40);
  }

  @Get('assignment/:userPropertyId')
  async getPropertyAssignmentDetails(@Param('userPropertyId') userPropertyId: string) {
    return this.pmWorkflow.getPropertyAssignmentDetails(userPropertyId);
  }

  @Post('pm-order')
  async createPmOrder(@Body() dto: CreatePmOrderDto, @Req() req: any) {
    const userId = await this.resolveTwobighaUserId(dto.leadId);
    if (!userId) {
      throw new NotFoundException('Lead has no synced 2bigha user (link a client with twobighaUserId).');
    }
    const variant = await this.subscriptionsService.getPMPlanVariant(dto.planVariantId);
    const order = await this.subscriptionsService.createPmOrderForUser({
      userId,
      planId: dto.planId,
      planVariantId: dto.planVariantId,
      billingCycle: dto.billingCycle,
      gstDetails: dto.gstDetails,
    });
    void this.pmActivityLog.log({
      leadId: dto.leadId,
      authorId: req.user?.userId,
      eventType: 'pm_payment_order_created',
      title: 'PM payment order created',
      content: `Razorpay checkout opened for ${variant?.planName || 'PM plan'} (${variant?.billingCycle || dto.billingCycle || 'plan'}).`,
      metadata: {
        planId: dto.planId,
        planVariantId: dto.planVariantId,
        planName: variant?.planName,
        orderId: order.orderId,
        razorpayOrderId: order.razorpayOrderId || order.orderId,
        amount: order.amount,
      },
    });
    return order;
  }

  @Post('pm-order/verify')
  async verifyPmPayment(@Body() dto: VerifyPmPaymentDto, @Req() req: any) {
    const userId = await this.resolveTwobighaUserId(dto.leadId);
    if (!userId) {
      throw new NotFoundException('Lead has no synced 2bigha user.');
    }
    const result = await this.subscriptionsService.verifyPmPaymentForUser({
      userId,
      planId: dto.planId,
      billingCycle: dto.billingCycle,
      razorpayOrderId: dto.razorpayOrderId,
      razorpayPaymentId: dto.razorpayPaymentId,
      razorpaySignature: dto.razorpaySignature,
    });
    void this.pmActivityLog.log({
      leadId: dto.leadId,
      authorId: req.user?.userId,
      eventType: result.success ? 'pm_payment_verified' : 'pm_payment_failed',
      title: result.success ? 'PM payment verified' : 'PM payment verification failed',
      content: result.success
        ? `Payment confirmed — subscription credit is now active (order ${dto.razorpayOrderId}).`
        : result.message || `Payment verification failed for order ${dto.razorpayOrderId}.`,
      metadata: {
        planId: dto.planId,
        razorpayOrderId: dto.razorpayOrderId,
        razorpayPaymentId: dto.razorpayPaymentId,
        success: result.success,
        subscriptionId: result.subscriptionId,
      },
    });
    return result;
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

  private resolveTwobighaUserId(leadId: string): Promise<string | null> {
    return resolveTwobighaUserIdForLeadId(leadId, {
      leadModel: this.leadModel,
      clientModel: this.clientModel,
      contactModel: this.contactModel,
    });
  }

  private async resolveLeadSearchTerm(leadId: string): Promise<string | null> {
    const lead = await this.leadModel
      .findById(leadId)
      .select('email mobileNo phone associatedContacts')
      .lean()
      .exec();
    if (!lead) return null;
    const email = (lead as any).email?.trim();
    if (email) return email;
    const contactIds = (lead as any).associatedContacts || [];
    if (contactIds.length) {
      const contact = await this.contactModel.findById(contactIds[0]).select('email').lean().exec();
      if ((contact as any)?.email?.trim()) return (contact as any).email.trim();
    }
    const phone = String((lead as any).mobileNo || (lead as any).phone || '').replace(/\D/g, '');
    return phone.length >= 10 ? phone.slice(-10) : null;
  }
}
