import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CrmNotificationPreference,
  CrmNotificationPreferenceDocument,
} from './schemas/crm-notification-preference.schema';
import {
  CRM_NOTIFY_DEFAULT_PREFS,
  CRM_NOTIFY_EVENTS,
  CRM_NOTIFY_EVENT_LABELS,
  CrmNotifyEvent,
  CrmNotifyPreferencesMap,
} from './crm-notification-events';

@Injectable()
export class CrmNotificationPreferencesService {
  constructor(
    @InjectModel(CrmNotificationPreference.name, 'crmConnection')
    private readonly preferenceModel: Model<CrmNotificationPreferenceDocument>,
  ) {}

  private userOid(user?: any): Types.ObjectId | null {
    const raw = user?.userId ?? user?._id ?? user?.id;
    if (!raw || !Types.ObjectId.isValid(String(raw))) return null;
    return new Types.ObjectId(String(raw));
  }

  mergeWithDefaults(
    events?: CrmNotifyPreferencesMap | null,
  ): Record<CrmNotifyEvent, { inApp: boolean; email: boolean; label: string }> {
    const out = {} as Record<
      CrmNotifyEvent,
      { inApp: boolean; email: boolean; label: string }
    >;
    for (const key of CRM_NOTIFY_EVENTS) {
      const def = CRM_NOTIFY_DEFAULT_PREFS[key];
      const ov = events?.[key];
      out[key] = {
        inApp: ov?.inApp !== undefined ? Boolean(ov.inApp) : def.inApp,
        email: ov?.email !== undefined ? Boolean(ov.email) : def.email,
        label: CRM_NOTIFY_EVENT_LABELS[key],
      };
    }
    return out;
  }

  async getMine(user?: any) {
    const userId = this.userOid(user);
    if (!userId) {
      return { events: this.mergeWithDefaults(null) };
    }
    const doc = await this.preferenceModel.findOne({ userId }).lean().exec();
    return {
      userId: String(userId),
      events: this.mergeWithDefaults(doc?.events),
    };
  }

  async upsertMine(body: { events?: CrmNotifyPreferencesMap }, user?: any) {
    const userId = this.userOid(user);
    if (!userId) throw new Error('Unauthorized');

    const incoming = body?.events || {};
    const cleaned: CrmNotifyPreferencesMap = {};
    for (const key of CRM_NOTIFY_EVENTS) {
      if (incoming[key]) {
        cleaned[key] = {
          inApp: incoming[key]!.inApp !== false,
          email: Boolean(incoming[key]!.email),
        };
      }
    }

    const existing = await this.preferenceModel.findOne({ userId }).exec();
    const merged: CrmNotifyPreferencesMap = {
      ...(existing?.events || {}),
      ...cleaned,
    };

    const saved = await this.preferenceModel
      .findOneAndUpdate(
        { userId },
        { $set: { events: merged } },
        { upsert: true, new: true },
      )
      .lean()
      .exec();

    return {
      userId: String(userId),
      events: this.mergeWithDefaults(saved?.events),
    };
  }
}
