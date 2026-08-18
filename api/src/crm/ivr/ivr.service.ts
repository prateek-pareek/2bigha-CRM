import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CallLog, CallLogDocument } from './schemas/call-log.schema';

function normalizeE164(raw: string): string {
  const cleaned = String(raw || '').trim().replace(/[^\d+]/g, '');
  if (!cleaned) return '';
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

/** 16-digit numeric session id, unique per call (Kommuno's mandatory `sessionId`). */
function generateSessionId(): string {
  const time = Date.now().toString(); // 13 digits
  const rand = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');
  return (time + rand).slice(0, 16);
}

export interface InitiateIvrCallDto {
  customerNumber: string;
  agentNumber: string;
  agentName?: string;
  relatedTo?: string;
  relatedType?: string;
  recordingFlag?: boolean;
}

export interface CallLogListQuery {
  page?: string | number;
  pageSize?: string | number;
  search?: string;
  agentNumber?: string;
  direction?: string;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable()
export class IvrService {
  private readonly logger = new Logger(IvrService.name);

  constructor(
    @InjectModel(CallLog.name, 'crmConnection')
    private readonly callLogModel: Model<CallLogDocument>,
  ) {}

  private kommunoConfigured(): boolean {
    return !!(
      process.env.KOMMUNO_API_KEY &&
      process.env.KOMMUNO_SME_ID &&
      process.env.KOMMUNO_VIRTUAL_NUMBER &&
      process.env.KOMMUNO_API_BASE_URL
    );
  }

  /**
   * Places an outbound call via Kommuno's `clickToCallWithLiveStatus` API
   * and immediately records a CallLog row (status 'Initiated'); the row is
   * later filled in with duration/status/recording by the webhook.
   *
   * API contract: KOMMUNO Developers Guide v4.9 —
   * POST {KOMMUNO_API_BASE_URL}/clickToCallWithLiveStatus
   * headers: { apikey, Content-Type: application/json }
   * body: { smeId, sessionId, customerNumber, agentNumber, recordingFlag, pilotNumber }
   */
  async initiateOutboundCall(dto: InitiateIvrCallDto, user: any) {
    if (!this.kommunoConfigured()) {
      throw new BadRequestException(
        'Kommuno is not configured. Set KOMMUNO_API_KEY, KOMMUNO_SME_ID, KOMMUNO_VIRTUAL_NUMBER, KOMMUNO_API_BASE_URL in api/.env.',
      );
    }

    const customerNumber = normalizeE164(dto.customerNumber);
    const agentNumber = normalizeE164(dto.agentNumber);
    if (!customerNumber || customerNumber.length < 8) {
      throw new BadRequestException('Enter a valid customer number with country code.');
    }
    if (!agentNumber || agentNumber.length < 8) {
      throw new BadRequestException(
        'Enter the agent number to call from — it must be pre-registered on your Kommuno account.',
      );
    }

    const sessionId = generateSessionId();
    const smeId = String(process.env.KOMMUNO_SME_ID).trim();
    const apiKey = String(process.env.KOMMUNO_API_KEY).trim();
    const pilotNumber = normalizeE164(String(process.env.KOMMUNO_VIRTUAL_NUMBER));
    const baseUrl = String(process.env.KOMMUNO_API_BASE_URL).trim().replace(/\/+$/, '');

    const payload = {
      smeId,
      sessionId,
      customerNumber,
      agentNumber,
      recordingFlag: dto.recordingFlag ? 1 : 0,
      pilotNumber,
    };

    let data: any = {};
    try {
      const res = await fetch(`${baseUrl}/clickToCallWithLiveStatus`, {
        method: 'POST',
        headers: {
          apikey: apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }
      if (!res.ok) {
        const msg = data?.message || `Kommuno error ${res.status}`;
        this.logger.error(`Kommuno call failed: ${msg}`);
        throw new BadRequestException(msg);
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Kommuno call request failed: ${err instanceof Error ? err.message : err}`);
      throw new BadRequestException('Could not reach Kommuno. Check KOMMUNO_API_BASE_URL and network access.');
    }

    await this.callLogModel.create({
      sessionId,
      direction: 'Outgoing',
      agentName: dto.agentName || [user?.firstName, user?.lastName].filter(Boolean).join(' '),
      agentNumber,
      customerNumber,
      status: 'Initiated',
      callDate: new Date(),
      initiatedByUserId:
        user?.userId && Types.ObjectId.isValid(user.userId) ? new Types.ObjectId(user.userId) : undefined,
      relatedTo:
        dto.relatedTo && Types.ObjectId.isValid(dto.relatedTo) ? new Types.ObjectId(dto.relatedTo) : undefined,
      relatedType: dto.relatedType,
      rawPayload: { request: payload, response: data },
    });

    return { sessionId, message: data?.message || 'Call initiated', raw: data };
  }

  /**
   * Upserts a CallLog from Kommuno's `call/event/callback` webhook. Defensive
   * about the exact shape of `agent_details` (not fully documented) — falls
   * back gracefully if fields are missing rather than throwing, since a
   * malformed webhook must never come back as an error to Kommuno (they may
   * retry indefinitely).
   */
  async handleKommunoCallback(body: any): Promise<void> {
    const callDetails = body?.call_details || {};
    const customerDetails = body?.customer_details || {};
    const recordingDetails = body?.recording_details || {};
    const agentDetailsRaw = Array.isArray(body?.agent_details) ? body.agent_details[0] : body?.agent_details;

    const sessionId = String(callDetails.session_id || recordingDetails.session_id || '').trim();
    if (!sessionId) {
      this.logger.warn('Kommuno callback missing session_id — skipping. Raw: ' + JSON.stringify(body).slice(0, 500));
      return;
    }

    const direction: 'Incoming' | 'Outgoing' =
      String(callDetails.call_direction || '').toUpperCase() === 'INCOMING' ? 'Incoming' : 'Outgoing';

    const rawStatus = String(callDetails.overall_call_status || '').trim();
    const status = rawStatus.toLowerCase() === 'patched' ? 'Connected' : rawStatus ? 'Completed' : 'Missed';

    const agentNumber =
      agentDetailsRaw?.agentNumber || agentDetailsRaw?.agent_number || agentDetailsRaw?.number || undefined;
    const agentName =
      agentDetailsRaw?.agentName || agentDetailsRaw?.agent_name || agentDetailsRaw?.name || undefined;

    const parseDate = (v: unknown): Date | undefined => {
      if (!v) return undefined;
      const d = new Date(String(v).replace(' ', 'T'));
      return Number.isNaN(d.getTime()) ? undefined : d;
    };

    const update: Partial<CallLog> = {
      direction,
      customerNumber: customerDetails.customer_number || callDetails.customer_number,
      customerName: customerDetails.customer_name || undefined,
      duration: Number(callDetails.duration) || 0,
      connectedDuration: Number(callDetails.connected_duration) || 0,
      ringingDuration: Number(callDetails.ringing_duration) || 0,
      rawStatus,
      status,
      callDate: parseDate(callDetails.start_date_time),
      callEndDate: parseDate(callDetails.end_date_time),
      recordingUrl: recordingDetails.recording_path || undefined,
      rawPayload: body,
    };
    if (agentNumber) update.agentNumber = normalizeE164(String(agentNumber));
    if (agentName) update.agentName = agentName;

    await this.callLogModel
      .findOneAndUpdate(
        { sessionId },
        { $set: { ...update, sessionId, direction } },
        { upsert: true, new: true },
      )
      .exec();
  }

  async listCallLogs(query: CallLogListQuery, onlyUserId?: string) {
    const page = Math.max(1, parseInt(String(query.page || 1), 10) || 1);
    const pageSize = Math.min(Math.max(1, parseInt(String(query.pageSize ?? 25), 10) || 25), 200);
    const filter: Record<string, unknown> = {};

    if (onlyUserId && Types.ObjectId.isValid(onlyUserId)) {
      filter.initiatedByUserId = new Types.ObjectId(onlyUserId);
    }
    if (query.agentNumber) filter.agentNumber = query.agentNumber;
    if (query.direction) filter.direction = query.direction;
    if (query.dateFrom || query.dateTo) {
      const range: Record<string, Date> = {};
      if (query.dateFrom) range.$gte = new Date(query.dateFrom);
      if (query.dateTo) range.$lte = new Date(query.dateTo);
      filter.callDate = range;
    }
    const search = String(query.search || '').trim();
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      Object.assign(filter, { $or: [{ customerName: re }, { customerNumber: re }, { agentName: re }] });
    }

    const [data, total] = await Promise.all([
      this.callLogModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .exec(),
      this.callLogModel.countDocuments(filter),
    ]);
    return { data, total, page, pageSize };
  }

  async getStats() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [todayIncoming, todayOutgoing, todayAnswered, totalIncoming, totalOutgoing, connected, todayAgents, todayClients] =
      await Promise.all([
        this.callLogModel.countDocuments({ direction: 'Incoming', createdAt: { $gte: startOfDay } }),
        this.callLogModel.countDocuments({ direction: 'Outgoing', createdAt: { $gte: startOfDay } }),
        this.callLogModel.countDocuments({ status: 'Connected', createdAt: { $gte: startOfDay } }),
        this.callLogModel.countDocuments({ direction: 'Incoming' }),
        this.callLogModel.countDocuments({ direction: 'Outgoing' }),
        this.callLogModel.countDocuments({ status: 'Connected' }),
        this.callLogModel.distinct('agentNumber', { createdAt: { $gte: startOfDay }, agentNumber: { $ne: null } }),
        this.callLogModel.distinct('customerNumber', { createdAt: { $gte: startOfDay }, customerNumber: { $ne: null } }),
      ]);

    return {
      todayIncoming,
      todayOutgoing,
      todayAnswered,
      todayActiveAgents: todayAgents.length,
      todayActiveClients: todayClients.length,
      totalIncoming,
      totalOutgoing,
      connected,
    };
  }

  async updateFollowUp(id: string, body: { followUpAt?: string | null; callbackScheduledAt?: string | null }) {
    const update: Record<string, unknown> = {};
    if (body.followUpAt !== undefined) update.followUpAt = body.followUpAt ? new Date(body.followUpAt) : null;
    if (body.callbackScheduledAt !== undefined)
      update.callbackScheduledAt = body.callbackScheduledAt ? new Date(body.callbackScheduledAt) : null;
    return this.callLogModel.findByIdAndUpdate(id, { $set: update }, { new: true }).exec();
  }
}
