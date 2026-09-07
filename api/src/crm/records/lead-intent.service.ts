import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  LeadIntentEvent,
  LeadIntentEventDocument,
  LeadIntentEventSource,
} from './schemas/lead-intent-event.schema';
import { Lead, LeadDocument } from './schemas/lead.schema';

const LEAD_LIST_PROJECTION =
  '_id firstName lastName email organization phone mobileNo callStatus leadOwner createdByName leadCategory group leadIntents leadIntentFollowUpAt createdAt';

@Injectable()
export class LeadIntentService {
  constructor(
    @InjectModel(LeadIntentEvent.name, 'crmConnection')
    private eventModel: Model<LeadIntentEventDocument>,
    @InjectModel(Lead.name, 'crmConnection')
    private leadModel: Model<LeadDocument>,
  ) {}

  /**
   * Sets/replaces a lead's current intent(s) and appends one history row per
   * intent for the analytics dashboard. Called from the Add Lead form
   * (source: 'add_lead_form') and the Call Activity Form (source: 'call_activity').
   */
  async recordIntent(
    leadId: string,
    intents: string[],
    followUpAt: Date | string | undefined,
    source: LeadIntentEventSource,
    user?: any,
  ) {
    if (!Types.ObjectId.isValid(leadId)) {
      throw new BadRequestException('Invalid lead id');
    }
    const cleanIntents = Array.from(
      new Set((intents || []).map((i) => String(i || '').trim()).filter(Boolean)),
    );
    const followUpDate = followUpAt ? new Date(followUpAt) : undefined;
    const leadOid = new Types.ObjectId(leadId);
    const setByName = user
      ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
      : undefined;
    const setBy = user?.userId || user?._id;

    await this.leadModel
      .findByIdAndUpdate(leadOid, {
        $set: {
          leadIntents: cleanIntents,
          ...(followUpDate ? { leadIntentFollowUpAt: followUpDate } : {}),
        },
      })
      .exec();

    if (cleanIntents.length) {
      await this.eventModel.insertMany(
        cleanIntents.map((intentLabel) => ({
          leadId: leadOid,
          intentLabel,
          followUpAt: followUpDate,
          source,
          setBy,
          setByName,
        })),
      );
    }

    return { leadId, intents: cleanIntents, followUpAt: followUpDate };
  }

  /** Lead Intent List page — paginated leads filtered by current intent + owner + search. */
  async listByIntent(query: {
    intent?: string;
    owner?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
    const filter: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (query.intent) filter.leadIntents = query.intent;
    else filter.leadIntents = { $exists: true, $ne: [] };
    if (query.owner) filter.leadOwner = query.owner;

    if (query.search && query.search.trim()) {
      const sanitized = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reg = new RegExp(sanitized, 'i');
      filter.$or = [
        { firstName: reg },
        { lastName: reg },
        { email: reg },
        { phone: reg },
        { mobileNo: reg },
        { organization: reg },
        { leadOwner: reg },
      ];
    }

    const baseFilter = { isDeleted: { $ne: true }, leadIntents: { $exists: true, $ne: [] } };
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [items, total, statsAgg] = await Promise.all([
      this.leadModel
        .find(filter)
        .select(LEAD_LIST_PROJECTION)
        .sort({ leadIntentFollowUpAt: 1, createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec(),
      this.leadModel.countDocuments(filter),
      this.leadModel.aggregate([
        { $match: baseFilter },
        {
          $facet: {
            total: [{ $count: 'count' }],
            buyers: [{ $match: { leadIntents: 'Buyer' } }, { $count: 'count' }],
            sellers: [{ $match: { leadIntents: 'Seller' } }, { $count: 'count' }],
            investors: [{ $match: { leadIntents: 'Investor' } }, { $count: 'count' }],
            farms: [{ $match: { leadIntents: 'Farm' } }, { $count: 'count' }],
            pm: [{ $match: { leadIntents: 'Property Management' } }, { $count: 'count' }],
            subscriptions: [{ $match: { leadIntents: 'Subscription' } }, { $count: 'count' }],
            dueToday: [
              {
                $match: {
                  leadIntentFollowUpAt: { $exists: true, $ne: null, $lte: todayEnd },
                },
              },
              { $count: 'count' },
            ],
          },
        },
      ]),
    ]);

    const facet = statsAgg?.[0] || {};
    const stats = {
      total: facet.total?.[0]?.count || 0,
      buyers: facet.buyers?.[0]?.count || 0,
      sellers: facet.sellers?.[0]?.count || 0,
      investors: facet.investors?.[0]?.count || 0,
      farms: facet.farms?.[0]?.count || 0,
      pm: facet.pm?.[0]?.count || 0,
      subscriptions: facet.subscriptions?.[0]?.count || 0,
      dueToday: facet.dueToday?.[0]?.count || 0,
    };

    return { items, total, stats, page, pageSize };
  }

  /** Lead Intent Analytics dashboard — counts by intent label, filterable by date range + agent. */
  async getAnalytics(query: { dateFrom?: string; dateTo?: string; agentId?: string }) {
    const match: Record<string, unknown> = {};
    if (query.dateFrom || query.dateTo) {
      const range: Record<string, Date> = {};
      if (query.dateFrom) range.$gte = new Date(query.dateFrom);
      if (query.dateTo) range.$lte = new Date(query.dateTo);
      match.createdAt = range;
    }
    if (query.agentId && Types.ObjectId.isValid(query.agentId)) {
      match.setBy = new Types.ObjectId(query.agentId);
    }

    const [byIntent, byDay, totalAgents] = await Promise.all([
      this.eventModel.aggregate([
        { $match: match },
        { $group: { _id: '$intentLabel', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.eventModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      this.eventModel.aggregate([
        { $match: match },
        { $group: { _id: '$setBy', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    return {
      byIntent: byIntent.map((r) => ({ intent: r._id, count: r.count })),
      byDay: byDay.map((r) => ({ date: r._id, count: r.count })),
      byAgent: totalAgents.map((r) => ({ agentId: r._id, count: r.count })),
    };
  }
}
