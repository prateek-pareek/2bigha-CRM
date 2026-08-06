import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Contact, ContactDocument } from '../schemas/contact.schema';
import { InboxEmail } from '../schemas/inbox-email.schema';
import { InboxRule, InboxRuleDocument } from '../schemas/inbox-rules.schema';
import { Activity, ActivityDocument } from '../schemas/activity.schema';
import { Lead, LeadDocument } from '../schemas/lead.schema';
import { Deal, DealDocument } from '../schemas/deal.schema';
import { Client, ClientDocument } from '../schemas/client.schema';

@Injectable()
export class InboxClassificationService {
  private readonly logger = new Logger(InboxClassificationService.name);
  private readonly classificationVersion = 2;

  // Cache for rules with 5-minute TTL
  private rulesCache: { [userId: string]: { rules: InboxRule[]; expires: number } } = {};
  private readonly CACHE_TTL = 5 * 60 * 1000;

  constructor(
    @InjectModel(Contact.name, 'crmConnection')
    private contactModel: Model<ContactDocument>,
    @InjectModel(InboxRule.name, 'crmConnection')
    private ruleModel: Model<InboxRuleDocument>,
    @InjectModel(Activity.name, 'crmConnection')
    private activityModel: Model<ActivityDocument>,
    @InjectModel(Lead.name, 'crmConnection')
    private leadModel: Model<LeadDocument>,
    @InjectModel(Deal.name, 'crmConnection')
    private dealModel: Model<DealDocument>,
    @InjectModel(Client.name, 'crmConnection')
    private clientModel: Model<ClientDocument>,
  ) {}

  async classify(email: Partial<InboxEmail>, userId: string): Promise<{
    category: string;
    score: number;
    confidence: number;
    reasons: string[];
    version: number;
  }> {
    const reasons: string[] = [];
    const fromEmail = email.from?.toLowerCase() || '';
    const domain = this.normalizeDomain(fromEmail.split('@')[1] || '');

    // 1. Individual Email Override (Highest)
    if (email.categoryOverride) {
      return {
        category: email.categoryOverride,
        score: 100,
        confidence: 100,
        reasons: ['manual_email_override'],
        version: this.classificationVersion,
      };
    }

    // 2. Sender & Domain Rules
    const rules = await this.getRulesForUser(userId);
    
    const senderRule = rules.find(r => r.type === 'sender' && r.pattern.toLowerCase() === fromEmail);
    if (senderRule) {
      return {
        category: senderRule.category,
        score: 100,
        confidence: 100,
        reasons: ['manual_sender_rule'],
        version: this.classificationVersion,
      };
    }

    const domainRule = rules.find(r => r.type === 'domain' && this.normalizeDomain(r.pattern.toLowerCase()) === domain);
    if (domainRule) {
      return {
        category: domainRule.category,
        score: 100,
        confidence: 100,
        reasons: ['manual_domain_rule'],
        version: this.classificationVersion,
      };
    }

    // 3. Preparation
    const subject = this.normalizeSubject(email.subject || '');
    const headers = email.meta?.headers || {};
    const body = email.body || '';
    const bodyHtml = email.bodyHtml || '';
    const content = this.extractContent(subject, email.meta?.bodyPreview || '', body, bodyHtml);

    // 4. Social Detection (Anchored)
    if (this.isSocial(domain, headers, content)) {
      return {
        category: 'social',
        score: 0,
        confidence: 100,
        reasons: ['social_signals'],
        version: this.classificationVersion,
      };
    }

    // 5. Scoring
    let score = 0;

    // Business Signals
    const [isContact, isLead, isClient, isDeal] = await Promise.all([
      this.contactModel.exists({ email: fromEmail }),
      this.leadModel.exists({ email: fromEmail }),
      this.clientModel.exists({ email: fromEmail }),
      this.dealModel.exists({ 'meta.email': fromEmail }), // Some deals store email in meta
    ]);
    const isKnownContact = !!(isContact || isLead || isClient || isDeal);
    
    if (isKnownContact) {
      score += 40;
      reasons.push('known_crm_entity');
    }

    const isReply = this.detectIsReply(email, subject, headers);
    if (isReply) {
      score += 30;
      reasons.push('is_reply');
    }

    if (this.detectCrmToken(content)) {
      score += 40;
      reasons.push('crm_token_found');
    }

    const recentInteraction = await this.hasRecentInteraction(fromEmail, userId);
    if (recentInteraction) {
      score += 20;
      reasons.push('recent_interaction');
    }

    // Promotional Signals
    const hasUnsubscribe = this.hasUnsubscribeHeader(headers) || content.toLowerCase().includes('unsubscribe');
    if (hasUnsubscribe) {
      score -= 50;
      reasons.push('unsubscribe_signal');
    }

    if (this.isBulk(headers)) {
      score -= 30;
      reasons.push('bulk_header');
    }

    const densityInfo = this.getLinkDensity(content);
    if (densityInfo.high) {
      score -= 20;
      reasons.push('high_link_density');
    }

    if (this.isImageHeavy(content, bodyHtml)) {
      score -= 20;
      reasons.push('image_heavy');
    }

    // Unknown Sender Boost
    if (!isKnownContact && score >= 0 && !hasUnsubscribe && !this.isBulk(headers)) {
      score += 10;
      reasons.push('unknown_sender_positive_boost');
    }

    // 6. Guardrail for Known Contacts
    const isStrongPromotional = hasUnsubscribe && (this.isBulk(headers) || densityInfo.high || this.isImageHeavy(content, bodyHtml));
    if (isKnownContact && !isStrongPromotional) {
      return {
        category: 'business',
        score,
        confidence: this.calculateConfidence(score),
        reasons: [...reasons, 'known_contact_guardrail'],
        version: this.classificationVersion,
      };
    }

    // 7. Final Classification
    let category = 'other';
    if (score >= 40) category = 'business';
    else if (score <= -30) category = 'promotional';

    return {
      category,
      score,
      confidence: this.calculateConfidence(score),
      reasons,
      version: this.classificationVersion,
    };
  }

  normalizeDomainPattern(domain: string): string {
    return this.normalizeDomain(domain);
  }

  private normalizeDomain(domain: string): string {
    const d = domain.toLowerCase().trim().replace(/^\.+|\.+$/g, '');
    if (!d) return '';
    const parts = d.split('.').filter(Boolean);
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    return d;
  }

  private normalizeSubject(subject: string): string {
    return subject.replace(/^(re:|fwd:|fw:)\s*/gi, '').trim();
  }

  private extractContent(subject: string, preview: string, body: string, bodyHtml: string): string {
    // Protect tokens by normalizing common HTML breaks
    let normalizedHtml = bodyHtml.replace(/<\/span>\s*<span>/gi, '');
    normalizedHtml = normalizedHtml.replace(/<style[\s\S]*?<\/style>/gi, '');
    const cleanBody = normalizedHtml.replace(/<[^>]+>/g, ' ');
    
    return `${subject} ${preview} ${cleanBody} ${body}`.trim();
  }

  private isSocial(domain: string, headers: any, content: string): boolean {
    const socialDomains = ['linkedin.com', 'facebookmail.com', 'twitter.com', 't.co', 'instagram.com'];
    const socialHeaders = ['x-linkedin-class', 'x-facebook-notify', 'x-twitter-client-id'];
    const socialKeywords = [/connection/i, /profile/i, /follower/i, /mention/i, /invited you/i];

    const hasSocialIdentity = socialDomains.includes(domain) || 
      socialHeaders.some(h => headers[h] || headers[h.toLowerCase()]);
    
    if (!hasSocialIdentity) return false;

    return socialKeywords.some(kw => kw.test(content));
  }

  private detectIsReply(email: Partial<InboxEmail>, normalizedSubject: string, headers: any): boolean {
    if (email.meta?.isReplyToUser) return true;
    if (email.subject?.toLowerCase().startsWith('re:')) return true;
    if (headers['in-reply-to'] || headers['In-Reply-To'] || headers['references'] || headers['References']) return true;
    return false;
  }

  private detectCrmToken(content: string): boolean {
    const tokenRegex = /ref:\s*INT-[a-z0-9-]+/i;
    return tokenRegex.test(content);
  }

  private async hasRecentInteraction(email: string, userId: string): Promise<boolean> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Check for activities or tracking
    const activity = await this.activityModel.exists({
      userId: new Types.ObjectId(userId),
      $or: [
        { 'meta.from': email.toLowerCase() },
        { 'meta.to': email.toLowerCase() }
      ],
      createdAt: { $gte: thirtyDaysAgo }
    });

    return !!activity;
  }

  private hasUnsubscribeHeader(headers: any): boolean {
    return !!(headers['list-unsubscribe'] || headers['List-Unsubscribe']);
  }

  private isBulk(headers: any): boolean {
    const precedence = headers['precedence'] || headers['Precedence'];
    if (precedence === 'bulk' || precedence === 'list') return true;
    
    const spamScore = headers['x-microsoft-antispam'] || headers['X-Microsoft-Antispam'];
    if (spamScore && spamScore.includes('BCL:')) {
      const bclMatch = spamScore.match(/BCL:(\d+)/);
      if (bclMatch && parseInt(bclMatch[1]) > 3) return true;
    }
    return false;
  }

  private getLinkDensity(content: string): { high: boolean, ratio: number } {
    const linkRegex = /https?:\/\/[^\s]+/g;
    const links = content.match(linkRegex) || [];
    const linkCount = links.length;
    const ratio = linkCount / Math.max(content.length, 1);
    
    const high = linkCount > 5 || (content.length > 500 && ratio > 0.01);
    return { high, ratio };
  }

  private isImageHeavy(content: string, bodyHtml: string): boolean {
    const imgRegex = /<img[^>]+src=[^>]+>/g;
    const imgs = bodyHtml.match(imgRegex) || [];
    const imgCount = imgs.length;
    
    // Simple heuristic: many images in relatively short text
    return imgCount > 3 && content.length < 1000;
  }

  private calculateConfidence(score: number): number {
    return Math.min(Math.abs(score) * 1.2, 100);
  }

  private async getRulesForUser(userId: string): Promise<InboxRule[]> {
    const now = Date.now();
    if (this.rulesCache[userId] && this.rulesCache[userId].expires > now) {
      return this.rulesCache[userId].rules;
    }

    const rules = await this.ruleModel.find({ userId: new Types.ObjectId(userId) }).lean().exec();
    this.rulesCache[userId] = {
      rules,
      expires: now + this.CACHE_TTL
    };
    return rules;
  }

  invalidateCache(userId: string) {
    delete this.rulesCache[userId];
  }
}
