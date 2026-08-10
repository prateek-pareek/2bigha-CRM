import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  Delete,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Deal, DealDocument } from '../schemas/deal.schema';
import { Contact, ContactDocument } from '../schemas/contact.schema';
import {
  PaymentTerm,
  PaymentTermDocument,
} from '../schemas/payment-term.schema';
import { Activity, ActivityDocument } from '../schemas/activity.schema';
import { ClientPortalNeedsService } from './client-portal-needs.service';
import {
  ClientPortalUpdate,
  ClientPortalUpdateDocument,
} from '../schemas/client-portal-update.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import * as bcrypt from 'bcrypt';
import { CRMService } from '../core/crm.service';

@Controller('portal')
export class PortalController {
  private readonly googleClientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();

  private async verifyGoogleIdToken(idToken: string): Promise<{ email: string } | null> {
    const token = String(idToken || '').trim();
    if (!token) return null;
    try {
      const res = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`,
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        aud?: string;
        email?: string;
        email_verified?: string | boolean;
      };
      if (this.googleClientId && String(data?.aud || '') !== this.googleClientId) {
        return null;
      }
      const verified = String(data?.email_verified ?? '') === 'true' || data?.email_verified === true;
      const email = String(data?.email || '').trim().toLowerCase();
      if (!verified || !email) return null;
      return { email };
    } catch {
      return null;
    }
  }

  constructor(
    @InjectModel(Deal.name, 'crmConnection')
    private dealModel: Model<DealDocument>,
    @InjectModel(Contact.name, 'crmConnection')
    private contactModel: Model<ContactDocument>,
    @InjectModel(PaymentTerm.name, 'crmConnection')
    private paymentTermModel: Model<PaymentTermDocument>,
    @InjectModel(Activity.name, 'crmConnection')
    private activityModel: Model<ActivityDocument>,
    @InjectModel(ClientPortalUpdate.name, 'crmConnection')
    private portalUpdateModel: Model<ClientPortalUpdateDocument>,
    @InjectModel(User.name)
    private hrmsUserModel: Model<UserDocument>,
    private clientPortalNeedsService: ClientPortalNeedsService,
    private readonly crmService: CRMService,
  ) {}

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Client sign-in without the portal URL: primary contact (or associated contact) email + portal password.
   * Only deals that have a portal password set are considered (Google-only portals are excluded).
   */
  @Post('login-by-email')
  async loginPortalByEmail(
    @Body() body: { email?: string; password?: string },
  ) {
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '').trim();
    if (!email || !password) {
      throw new BadRequestException('Email and password are required');
    }
    const contacts = await this.contactModel
      .find({
        email: new RegExp(`^${this.escapeRegex(email)}$`, 'i'),
      })
      .select('_id')
      .lean()
      .exec();
    const contactIds = contacts.map((c) => c._id);
    if (contactIds.length === 0) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const deals = await this.dealModel
      .find({
        $or: [
          { contactPerson: { $in: contactIds } },
          { associatedContacts: { $in: contactIds } },
        ],
        portalToken: { $exists: true, $nin: [null, ''] },
        portalPasswordHash: { $exists: true, $nin: [null, ''] },
      })
      .sort({ updatedAt: -1 })
      .select('portalToken portalPasswordHash')
      .exec();
    for (const deal of deals) {
      if (!deal.portalPasswordHash) continue;
      const ok = await bcrypt.compare(password, deal.portalPasswordHash);
      if (ok) {
        return { portalToken: deal.portalToken };
      }
    }
    throw new UnauthorizedException('Invalid email or password');
  }

  private async resolveAuthorizedDeal(
    token: string,
    portalPassword?: string,
    portalGoogleToken?: string,
  ): Promise<DealDocument> {
    const deal = await this.dealModel
      .findOne({ portalToken: token })
      .populate('organization')
      .populate('contactPerson', 'email')
      .exec();

    if (!deal) {
      throw new NotFoundException('Invalid portal token');
    }

    const contactEmail = String((deal as any)?.contactPerson?.email || '')
      .trim()
      .toLowerCase();
    const hasPassword = Boolean(deal.portalPasswordHash);
    const passwordHash = deal.portalPasswordHash || '';
    const googleEnabled = Boolean(deal.portalGoogleLoginEnabled);

    if (hasPassword) {
      const incoming = String(portalPassword || '').trim();
      if (!incoming) {
        throw new UnauthorizedException('Portal password required');
      }
      const ok = await bcrypt.compare(incoming, passwordHash);
      if (!ok) {
        throw new UnauthorizedException('Invalid portal password');
      }
    } else if (googleEnabled) {
      const googleUser = await this.verifyGoogleIdToken(
        String(portalGoogleToken || ''),
      );
      if (!googleUser) {
        throw new UnauthorizedException('Valid Google login required');
      }
      if (contactEmail && googleUser.email !== contactEmail) {
        throw new UnauthorizedException(
          'This Google account is not allowed for this portal',
        );
      }
    }

    return deal;
  }

  @Get(':token/issues')
  async listPortalIssues(
    @Param('token') token: string,
    @Headers('x-portal-password') portalPassword?: string,
    @Headers('x-portal-google-token') portalGoogleToken?: string,
  ) {
    await this.resolveAuthorizedDeal(
      token,
      portalPassword,
      portalGoogleToken,
    );
    // PM boards are not available in CRM-only mode.
    return [];
  }

  @Post(':token/issues')
  async createPortalIssue(
    @Param('token') token: string,
    @Body()
    body: {
      summary?: string;
      description?: string;
      /** bug | feature | question | incident */
      issueType?: string;
      /** low | medium | high | urgent */
      priority?: string;
    },
    @Headers('x-portal-password') portalPassword?: string,
    @Headers('x-portal-google-token') portalGoogleToken?: string,
  ) {
    await this.resolveAuthorizedDeal(
      token,
      portalPassword,
      portalGoogleToken,
    );
    void body;
    throw new BadRequestException(
      'Issue boards are not available in CRM-only mode.',
    );
  }

  @Get(':token')
  async getPortalData(
    @Param('token') token: string,
    @Headers('x-portal-password') portalPassword?: string,
    @Headers('x-portal-google-token') portalGoogleToken?: string,
  ) {
    const deal = await this.resolveAuthorizedDeal(
      token,
      portalPassword,
      portalGoogleToken,
    );

    const [payments, clientNeeds] = await Promise.all([
      this.paymentTermModel.find({ deal: deal._id }).exec(),
      this.clientPortalNeedsService.findByDealObjectId(deal._id),
    ]);

    const dealObj = deal.toObject();
    const portalPmIssuesLinked = Boolean(deal.portalPmProjectId);
    if (dealObj && typeof dealObj === 'object' && 'portalPmProjectId' in dealObj) {
      delete (dealObj as { portalPmProjectId?: unknown }).portalPmProjectId;
    }
    if (dealObj && typeof dealObj === 'object') {
      (dealObj as { portalPmIssuesLinked?: boolean }).portalPmIssuesLinked =
        portalPmIssuesLinked;
    }
    if (dealObj && typeof dealObj === 'object' && 'portalToken' in dealObj) {
      delete (dealObj as { portalToken?: string }).portalToken;
    }
    if (
      dealObj &&
      typeof dealObj === 'object' &&
      'portalPasswordHash' in dealObj
    ) {
      delete (dealObj as { portalPasswordHash?: string }).portalPasswordHash;
    }
    const updatesRaw = await this.portalUpdateModel
      .find({ deal: deal._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
      .exec();
    const updaterIds = updatesRaw
      .map((u) => String(u.createdBy))
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    const users = await this.hrmsUserModel
      .find({ _id: { $in: updaterIds } })
      .select('firstName lastName')
      .lean()
      .exec();
    const userById = new Map(users.map((u: any) => [String(u._id), u]));
    const updates = updatesRaw.map((u: any) => {
      const person = userById.get(String(u.createdBy));
      return {
        _id: String(u._id),
        title: u.title || '',
        body: u.body || '',
        cadence: u.cadence || 'general',
        createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : null,
        createdByName:
          `${person?.firstName || ''} ${person?.lastName || ''}`.trim() ||
          'Project team',
      };
    });

    return {
      deal: dealObj,
      payments,
      clientNeeds,
      deliveryBoard: null,
      updates,
    };
  }

  @Get(':token/payments')
  async getPortalPayments(
    @Param('token') token: string,
    @Headers('x-portal-password') portalPassword?: string,
    @Headers('x-portal-google-token') portalGoogleToken?: string,
  ) {
    const deal = await this.resolveAuthorizedDeal(
      token,
      portalPassword,
      portalGoogleToken,
    );
    return this.paymentTermModel.find({ deal: deal._id }).lean().exec();
  }

  @Get(':token/needs')
  async getPortalNeeds(
    @Param('token') token: string,
    @Headers('x-portal-password') portalPassword?: string,
    @Headers('x-portal-google-token') portalGoogleToken?: string,
  ) {
    const deal = await this.resolveAuthorizedDeal(
      token,
      portalPassword,
      portalGoogleToken,
    );
    return this.clientPortalNeedsService.findByDealObjectId(deal._id as Types.ObjectId);
  }

  @Post(':token/needs')
  async submitPortalNeed(
    @Param('token') token: string,
    @Body()
    body: {
      category?: string;
      title?: string;
      description?: string;
      dueDate?: string;
    },
    @Headers('x-portal-password') portalPassword?: string,
    @Headers('x-portal-google-token') portalGoogleToken?: string,
  ) {
    const deal = await this.resolveAuthorizedDeal(
      token,
      portalPassword,
      portalGoogleToken,
    );

    const category = String(body?.category || 'other').trim().toLowerCase();
    const allowed = new Set(['asset', 'credential', 'document', 'access', 'other']);
    const safeCategory = allowed.has(category) ? category : 'other';
    const title = String(body?.title || '').trim();
    if (!title) {
      throw new BadRequestException('Need title is required');
    }

    const created = await this.clientPortalNeedsService.create(String(deal._id), {
      category: safeCategory,
      title,
      description: String(body?.description || '').trim() || undefined,
      dueDate: body?.dueDate,
      status: 'open',
    });

    return {
      success: true,
      item: created,
    };
  }

  @Get(':token/updates')
  async getPortalUpdates(
    @Param('token') token: string,
    @Headers('x-portal-password') portalPassword?: string,
    @Headers('x-portal-google-token') portalGoogleToken?: string,
  ) {
    const deal = await this.resolveAuthorizedDeal(
      token,
      portalPassword,
      portalGoogleToken,
    );
    const updatesRaw = await this.portalUpdateModel
      .find({ deal: deal._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
      .exec();
    const updaterIds = updatesRaw
      .map((u) => String(u.createdBy))
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    const users = await this.hrmsUserModel
      .find({ _id: { $in: updaterIds } })
      .select('firstName lastName')
      .lean()
      .exec();
    const userById = new Map(users.map((u: any) => [String(u._id), u]));
    return updatesRaw.map((u: any) => {
      const person = userById.get(String(u.createdBy));
      return {
        _id: String(u._id),
        title: u.title || '',
        body: u.body || '',
        cadence: u.cadence || 'general',
        createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : null,
        createdByName:
          `${person?.firstName || ''} ${person?.lastName || ''}`.trim() ||
          'Project team',
      };
    });
  }

  @Get(':token/documents')
  async getPortalDocuments(
    @Param('token') token: string,
    @Headers('x-portal-password') portalPassword?: string,
    @Headers('x-portal-google-token') portalGoogleToken?: string,
  ) {
    const deal = await this.resolveAuthorizedDeal(
      token,
      portalPassword,
      portalGoogleToken,
    );
    return Array.isArray(deal.portalDocuments) ? deal.portalDocuments : [];
  }

  @Get(':token/auth-config')
  async getPortalAuthConfig(@Param('token') token: string) {
    const deal = await this.dealModel
      .findOne({ portalToken: token })
      .populate('contactPerson', 'email')
      .populate('pipeline', 'categoryType')
      .exec();
    if (!deal) {
      throw new NotFoundException('Invalid portal token');
    }
    const pipeline = (deal as any)?.pipeline as
      | { categoryType?: string }
      | null
      | undefined;
    const cat = String(pipeline?.categoryType || '').trim();
    const portalMarket =
      cat === 'freelancer' ? ('freelancer' as const) : ('agency' as const);
    return {
      requiresPassword: Boolean(deal.portalPasswordHash),
      googleLoginEnabled: Boolean(deal.portalGoogleLoginEnabled),
      contactEmailHint: String((deal as any)?.contactPerson?.email || '').trim().toLowerCase() || null,
      portalDomain: String((deal as any)?.portalDomain || '').trim() || null,
      portalMarket,
      pmIssuesBoardLinked: Boolean(deal.portalPmProjectId),
    };
  }

  @Post(':token/verify-password')
  async verifyPortalPassword(
    @Param('token') token: string,
    @Body() body: { password?: string },
  ) {
    const deal = await this.dealModel.findOne({ portalToken: token }).exec();
    if (!deal) {
      throw new NotFoundException('Invalid portal token');
    }
    if (!deal.portalPasswordHash) {
      return {
        success: true,
        requiresPassword: false,
      };
    }
    const incoming = String(body?.password || '').trim();
    if (!incoming) {
      throw new UnauthorizedException('Portal password required');
    }
    const ok = await bcrypt.compare(incoming, deal.portalPasswordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid portal password');
    }
    return {
      success: true,
      requiresPassword: true,
    };
  }

  @Post(':token/verify-google')
  async verifyPortalGoogle(
    @Param('token') token: string,
    @Body() body: { idToken?: string },
  ) {
    const deal = await this.dealModel
      .findOne({ portalToken: token })
      .populate('contactPerson', 'email')
      .exec();
    if (!deal) {
      throw new NotFoundException('Invalid portal token');
    }
    if (!deal.portalGoogleLoginEnabled) {
      throw new UnauthorizedException('Google login is not enabled for this portal');
    }
    const googleUser = await this.verifyGoogleIdToken(String(body?.idToken || ''));
    if (!googleUser) {
      throw new UnauthorizedException('Invalid Google token');
    }
    const contactEmail = String((deal as any)?.contactPerson?.email || '').trim().toLowerCase();
    if (contactEmail && googleUser.email !== contactEmail) {
      throw new UnauthorizedException('This Google account is not allowed for this portal');
    }
    return {
      success: true,
      email: googleUser.email,
    };
  }

  @Post(':token/inquiry')
  async submitInquiry(
    @Param('token') token: string,
    @Body() body: { name: string; email: string; message: string },
  ) {
    const deal = await this.dealModel.findOne({ portalToken: token }).exec();

    if (!deal) {
      throw new NotFoundException('Invalid portal token');
    }

    const activity = new this.activityModel({
      type: 'Note',
      content: `📩 **Client Inquiry from ${body.name} (${body.email})**\n\n${body.message}`,
      relatedTo: deal._id,
      relatedType: 'Deal',
      metadata: {
        source: 'client-portal',
        clientName: body.name,
        clientEmail: body.email,
      },
    });

    await activity.save();

    return {
      success: true,
      message: 'Your inquiry has been submitted successfully.',
    };
  }

  @Post(':token/documents')
  async uploadDocument(
    @Param('token') token: string,
    @Body() body: { name: string; url: string; uploadedBy?: string; needId?: string },
    @Headers('x-portal-password') portalPassword?: string,
    @Headers('x-portal-google-token') portalGoogleToken?: string,
  ) {
    const deal = await this.resolveAuthorizedDeal(
      token,
      portalPassword,
      portalGoogleToken,
    );

    if (!body.name || !body.url) {
      throw new UnauthorizedException('Document name and url are required');
    }

    const doc = {
      name: String(body.name).trim(),
      url: String(body.url).trim(),
      uploadedBy: String(body.uploadedBy || 'Client').trim(),
      type: 'client_uploaded' as const,
      satisfiedNeedId: body.needId ? String(body.needId).trim() : undefined,
      createdAt: new Date(),
    };

    await this.dealModel.updateOne(
      { _id: deal._id },
      { $push: { portalDocuments: doc } },
    );

    if (body.needId) {
      try {
        await this.clientPortalNeedsService.update(body.needId, {
          status: 'received',
          satisfiedDocUrl: doc.url,
          satisfiedAt: doc.createdAt,
        });
      } catch (err) {
        console.error('Failed to update satisfied document request status:', err);
      }
    }

    return {
      success: true,
      message: 'Document uploaded successfully',
      doc,
    };
  }

  @Delete(':token/documents/:index')
  async deleteDocument(
    @Param('token') token: string,
    @Param('index') index: string,
    @Headers('x-portal-password') portalPassword?: string,
    @Headers('x-portal-google-token') portalGoogleToken?: string,
  ) {
    const deal = await this.resolveAuthorizedDeal(
      token,
      portalPassword,
      portalGoogleToken,
    );

    const idx = parseInt(index, 10);
    const docs = [...(deal.portalDocuments || [])];

    if (isNaN(idx) || idx < 0 || idx >= docs.length) {
      throw new BadRequestException('Invalid document index');
    }

    if (docs[idx].type !== 'client_uploaded') {
      throw new UnauthorizedException('Cannot delete admin-provided documents');
    }

    const deletedDoc = docs[idx];
    docs.splice(idx, 1);

    await this.dealModel.updateOne(
      { _id: deal._id },
      { $set: { portalDocuments: docs } },
    );

    if (deletedDoc.satisfiedNeedId) {
      try {
        await this.clientPortalNeedsService.update(deletedDoc.satisfiedNeedId, {
          status: 'open',
          satisfiedDocUrl: null,
          satisfiedAt: null,
        });
      } catch (err) {
        console.error('Failed to reset document request status on delete:', err);
      }
    }

    return {
      success: true,
      message: 'Document deleted successfully',
    };
  }

  @Get(':token/messages')
  async getPortalMessages(
    @Param('token') token: string,
    @Headers('x-portal-password') portalPassword?: string,
    @Headers('x-portal-google-token') portalGoogleToken?: string,
  ) {
    const deal = await this.resolveAuthorizedDeal(
      token,
      portalPassword,
      portalGoogleToken,
    );
    return this.crmService.getDealMessages(deal._id.toString());
  }

  @Post(':token/messages')
  async sendPortalMessage(
    @Param('token') token: string,
    @Body() body: { text?: string },
    @Headers('x-portal-password') portalPassword?: string,
    @Headers('x-portal-google-token') portalGoogleToken?: string,
  ) {
    const deal = await this.resolveAuthorizedDeal(
      token,
      portalPassword,
      portalGoogleToken,
    );
    return this.crmService.sendClientPortalChatMessage(deal._id.toString(), body?.text || '');
  }

  @Post(':token/resolve')
  async resolveDealInternal(
    @Param('token') token: string,
    @Headers('x-portal-password') portalPassword?: string,
    @Headers('x-portal-google-token') portalGoogleToken?: string,
  ) {
    const deal = await this.resolveAuthorizedDeal(
      token,
      portalPassword,
      portalGoogleToken,
    );
    return deal.toObject();
  }
}
