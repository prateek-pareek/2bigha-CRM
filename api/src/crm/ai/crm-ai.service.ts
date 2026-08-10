import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  forwardRef,
} from '@nestjs/common';
import { CRMService } from '../core/crm.service';
import { CrmOutreachAiSettingsService } from './crm-outreach-ai-settings.service';
import { CrmProposalAiSettingsService } from '../proposals/crm-proposal-ai-settings.service';
import { CrmContractAiSettingsService } from '../proposals/crm-contract-ai-settings.service';
import {
  buildIssuerProfileBlock,
  PROPOSAL_HTML_STYLE_RULES,
} from './crm-proposal-ai-format.util';
import {
  buildContractIssuerBlock,
  CONTRACT_HTML_STYLE_RULES,
} from './crm-contract-ai-format.util';
import { PipelinesService } from '../core/pipelines.service';
import { InboxAccountsService } from '../inbox/inbox-accounts.service';
import { PlatformOpportunitiesService } from '../opportunities/platform-opportunities.service';
import { analyzeEmailSpamContent } from '../email/spam-word-checker';
import { buildSpamAvoidancePromptSection } from '../email/spam-word-ai-prompt';
import { AnthropicClientService } from '../../integrations/anthropic/anthropic-client.service';
import {
  checkOutreachContext,
  mergeOutreachPromptSettings,
  type MissingContextAction,
  type OutreachContextCheckResult,
  type OutreachContextFieldKey,
  type PipelineOutreachAiContext,
} from '../shared/crm-outreach-context.util';

type PersonModule = 'leads' | 'contacts';
export type ProposalSourceModule =
  | 'leads'
  | 'contacts'
  | 'deals'
  | 'platform-opportunities';
type ProposalKind = 'proposal' | 'quotation';

const TONE_HINTS: Record<string, string> = {
  consultative:
    'Use a consultative tone: curious, respectful of their time, one or two thoughtful questions, position as exploring fit—not a hard sell.',
  direct:
    'Be direct and concise: clear value proposition, specific relevance to their context, one obvious next step.',
  warm:
    'Warm and personable while staying professional; light on jargon unless the CRM context is highly technical.',
  formal:
    'Formal enterprise tone: polished, conservative, suitable for senior IT and business stakeholders.',
};

const PIPELINE_CATEGORY_CONTEXT: Record<string, string> = {
  it_consulting: 'an IT consulting / technology services organization',
  freelancer: 'an independent freelancer / solo consultant',
};

@Injectable()
export class CrmAiService {
  constructor(
    @Inject(forwardRef(() => CRMService))
    private readonly crmService: CRMService,
    private readonly outreachAiSettings: CrmOutreachAiSettingsService,
    private readonly proposalAiSettings: CrmProposalAiSettingsService,
    private readonly contractAiSettings: CrmContractAiSettingsService,
    private readonly pipelinesService: PipelinesService,
    @Inject(forwardRef(() => InboxAccountsService))
    private readonly inboxAccountsService: InboxAccountsService,
    @Inject(forwardRef(() => PlatformOpportunitiesService))
    private readonly platformOpportunitiesService: PlatformOpportunitiesService,
    private readonly anthropic: AnthropicClientService,
  ) {}

  private settingsModel(settings: Record<string, unknown>): string | undefined {
    const raw = String(settings.llmModel || settings.anthropicModel || '').trim();
    return raw || undefined;
  }

  private requireLlmConfigured(feature: string): void {
    if (!this.anthropic.isConfigured()) {
      throw new ServiceUnavailableException(
        `${feature} is not configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY/GEMINI_API_KEY on the server.`,
      );
    }
  }

  async checkPersonOutreachContext(
    user: any,
    module: PersonModule,
    entityId: string,
    options?: {
      requiredContextFields?: OutreachContextFieldKey[];
      missingContextAction?: MissingContextAction;
    },
  ): Promise<OutreachContextCheckResult> {
    const { record, context, pipelineOutreach } =
      await this.resolvePersonDraftContext(module, entityId, user);
    if (!record) {
      throw new NotFoundException('Lead or contact not found');
    }
    const required =
      options?.requiredContextFields?.length
        ? options.requiredContextFields
        : pipelineOutreach?.requiredContextFields?.length
          ? (pipelineOutreach.requiredContextFields as OutreachContextFieldKey[])
          : [];
    const action =
      options?.missingContextAction ||
      pipelineOutreach?.missingContextAction ||
      'draft_anyway';
    return checkOutreachContext(context, required, action);
  }

  async draftPersonOutreachEmail(
    user: any,
    module: PersonModule,
    entityId: string,
    instructions?: string,
    options?: {
      requiredContextFields?: OutreachContextFieldKey[];
      missingContextAction?: MissingContextAction;
      skipContextCheck?: boolean;
    },
  ): Promise<{
    subject: string;
    bodyHtml: string;
    contextCheck?: OutreachContextCheckResult;
  }> {
    this.requireLlmConfigured('AI email drafting');

    const promptSettings =
      await this.outreachAiSettings.getEffectiveForPromptSafe();
    if (promptSettings.enabled === false) {
      throw new ServiceUnavailableException(
        'AI outreach drafting is disabled. Enable it under CRM Settings → AI outreach.',
      );
    }

    const { record, context, promptSettings: mergedSettings, pipelineOutreach } =
      await this.resolvePersonDraftContext(module, entityId, user);

    if (!record) {
      throw new NotFoundException('Lead or contact not found');
    }

    const required =
      options?.requiredContextFields?.length
        ? options.requiredContextFields
        : pipelineOutreach?.requiredContextFields?.length
          ? (pipelineOutreach.requiredContextFields as OutreachContextFieldKey[])
          : [];
    const missingAction =
      options?.missingContextAction ||
      pipelineOutreach?.missingContextAction ||
      'draft_anyway';
    const contextCheck = checkOutreachContext(
      context,
      required,
      missingAction,
    );

    if (!options?.skipContextCheck && !contextCheck.canDraft) {
      throw new BadRequestException({
        message:
          'Not enough CRM context to draft outreach. Add the missing fields or change pipeline settings.',
        contextCheck,
      });
    }

    const model = this.settingsModel(mergedSettings as Record<string, unknown>);

    const pipelineInstructions = String(
      mergedSettings._pipelineAiInstructions || '',
    ).trim();
    const combinedInstructions = [
      pipelineInstructions,
      instructions?.trim() || '',
      contextCheck.missing.length
        ? `Some CRM context is missing (${contextCheck.missingLabels.join(', ')}). Write a strong email anyway; if helpful, end with one short question to gather the missing detail.`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const userPrompt = this.buildOutreachUserPrompt(
      mergedSettings,
      context,
      combinedInstructions || undefined,
      contextCheck,
    );

    const text = await this.anthropic.createMessageText({
      userPrompt,
      model,
      featureLabel: 'CRM outreach draft',
    });
    const draft = this.parseDraftJson(text);
    const safe = await this.enforceSpamSafeDraft(model, draft, userPrompt);
    return { ...safe, contextCheck };
  }

  async draftAutomatedPersonOutreachEmail(
    module: PersonModule,
    entityId: string,
    instructions?: string,
    options?: {
      requiredContextFields?: OutreachContextFieldKey[];
      missingContextAction?: MissingContextAction;
      skipContextCheck?: boolean;
    },
  ): Promise<{
    subject: string;
    bodyHtml: string;
    contextCheck?: OutreachContextCheckResult;
  }> {
    return this.draftPersonOutreachEmail(
      undefined,
      module,
      entityId,
      instructions,
      options,
    );
  }

  /** Personalized cold-DM text for X/Twitter (manual send — no API integration yet). */
  async draftPersonOutreachXDm(
    user: any,
    module: PersonModule,
    entityId: string,
    instructions?: string,
  ): Promise<{ message: string; charCount: number; twitterHandle?: string }> {
    this.requireLlmConfigured('AI drafting');

    const promptSettings =
      await this.outreachAiSettings.getEffectiveForPromptSafe();
    if (promptSettings.enabled === false) {
      throw new ServiceUnavailableException(
        'AI outreach drafting is disabled. Enable it under CRM Settings → AI outreach.',
      );
    }

    let record: Record<string, unknown> | null = null;
    if (module === 'leads') {
      const lead = await this.crmService.findOneLead(entityId, user);
      if (lead) {
        record = JSON.parse(JSON.stringify(lead)) as Record<string, unknown>;
      }
    } else {
      const contact = await this.crmService.findOneContact(entityId);
      if (contact) {
        record = JSON.parse(JSON.stringify(contact)) as Record<string, unknown>;
      }
    }

    if (!record) {
      throw new NotFoundException('Lead or contact not found');
    }

    const context = await this.buildPersonContext(module, record);
    const model = this.settingsModel(promptSettings as Record<string, unknown>);

    const userPrompt = this.buildXDmUserPrompt(
      promptSettings,
      context,
      instructions,
    );
    const text = await this.anthropic.createMessageText({
      userPrompt,
      model,
      featureLabel: 'CRM X DM draft',
    });
    const draft = this.parseXDmDraftJson(text);
    const handle =
      typeof context.twitterHandle === 'string' && context.twitterHandle.trim()
        ? context.twitterHandle.trim()
        : undefined;
    return {
      message: draft.message,
      charCount: draft.message.length,
      twitterHandle: handle,
    };
  }

  async draftInboxFollowUpReplyEmail(
    user: any,
    inboxEmailId: string,
    instructions?: string,
  ): Promise<{ subject: string; bodyHtml: string }> {
    this.requireLlmConfigured('AI email drafting');
    const promptSettings =
      await this.outreachAiSettings.getEffectiveForPromptSafe();
    if (promptSettings.enabled === false) {
      throw new ServiceUnavailableException(
        'AI outreach drafting is disabled. Enable it under CRM Settings → AI outreach.',
      );
    }

    const userId = String(user?.userId || user?._id || '').trim();
    if (!userId) {
      throw new BadRequestException('User context is required for inbox reply drafting');
    }
    const inboxEmail = await this.inboxAccountsService.getInboxEmailByIdForUser(
      userId,
      inboxEmailId,
    );
    if (!inboxEmail) {
      throw new NotFoundException('Inbox email not found');
    }

    const fromRaw = String((inboxEmail as any).from || '').trim();
    const recipientEmail = this.extractFirstEmailAddress(fromRaw);
    if (!recipientEmail) {
      throw new BadRequestException('Could not resolve sender email for reply context');
    }

    const recipients = await this.inboxAccountsService.resolveRecipientEmail(
      recipientEmail,
    );
    const person = recipients.find(
      (r) => r.module === 'leads' || r.module === 'contacts',
    );

    let personContext: Record<string, unknown> | null = null;
    if (person?.module === 'leads') {
      const lead = await this.crmService.findOneLead(person.entityId, user);
      if (lead) {
        personContext = await this.buildPersonContext(
          'leads',
          JSON.parse(JSON.stringify(lead)) as Record<string, unknown>,
        );
      }
    } else if (person?.module === 'contacts') {
      const contact = await this.crmService.findOneContact(person.entityId);
      if (contact) {
        personContext = await this.buildPersonContext(
          'contacts',
          JSON.parse(JSON.stringify(contact)) as Record<string, unknown>,
        );
      }
    }

    const model = this.settingsModel(promptSettings as Record<string, unknown>);

    const userPrompt = this.buildReplyUserPrompt(
      promptSettings,
      {
        subject: String((inboxEmail as any).subject || ''),
        bodyText: String((inboxEmail as any).body || ''),
        from: fromRaw,
        fromName: String((inboxEmail as any).fromName || ''),
        date: (inboxEmail as any).date,
      },
      personContext,
      instructions,
    );
    const text = await this.anthropic.createMessageText({
      userPrompt,
      model,
      featureLabel: 'CRM inbox reply draft',
    });
    const draft = this.parseDraftJson(text);
    return this.enforceSpamSafeDraft(model, draft, userPrompt);
  }

  async draftProposalFromRecord(
    user: any,
    module: ProposalSourceModule,
    entityId: string,
    input: {
      issuerProfile?: 'agency' | 'freelancer';
      kind?: ProposalKind;
      clientNeeds?: string;
      instructions?: string;
    },
  ): Promise<{
    title: string;
    subject: string;
    bodyHtml: string;
    clientName: string;
    clientEmail: string;
  }> {
    this.requireLlmConfigured('AI proposal drafting');
    const [outreachSettings, proposalSettings] = await Promise.all([
      this.outreachAiSettings.getEffectiveForPromptSafe(),
      this.proposalAiSettings.getEffectiveForPromptSafe(),
    ]);
    if (outreachSettings.enabled === false) {
      throw new ServiceUnavailableException(
        'AI drafting is disabled. Enable it under CRM Settings → AI outreach.',
      );
    }
    if (proposalSettings.enabled === false) {
      throw new ServiceUnavailableException(
        'AI proposal drafting is disabled. Enable it under CRM Settings → AI proposal drafter.',
      );
    }

    const { record, context } = await this.resolveProposalSourceContext(
      user,
      module,
      entityId,
    );
    if (!record) {
      throw new NotFoundException(this.proposalSourceNotFoundMessage(module));
    }
    const model = this.settingsModel(outreachSettings as Record<string, unknown>);

    const userPrompt = this.buildProposalUserPrompt(
      proposalSettings,
      context,
      input,
    );
    const text = await this.anthropic.createMessageText({
      userPrompt,
      model,
      featureLabel: 'CRM proposal draft',
    });
    const draft = this.parseProposalDraftJson(text);
    return this.enrichProposalDraftFromContext(draft, context, module);
  }

  async draftContractFromRecord(
    user: any,
    module: ProposalSourceModule,
    entityId: string,
    input: {
      issuerProfile?: 'agency' | 'freelancer';
      clientNeeds?: string;
      instructions?: string;
      contractType?: string;
    },
  ): Promise<{
    title: string;
    subject: string;
    bodyHtml: string;
    clientName: string;
    clientEmail: string;
  }> {
    this.requireLlmConfigured('AI contract drafting');
    const [outreachSettings, contractSettings] = await Promise.all([
      this.outreachAiSettings.getEffectiveForPromptSafe(),
      this.contractAiSettings.getEffectiveForPromptSafe(),
    ]);
    if (outreachSettings.enabled === false) {
      throw new ServiceUnavailableException(
        'AI drafting is disabled. Enable it under CRM Settings → AI outreach.',
      );
    }
    if (contractSettings.enabled === false) {
      throw new ServiceUnavailableException(
        'AI contract drafting is disabled. Enable it under CRM Settings → AI contract maker.',
      );
    }

    const { record, context } = await this.resolveProposalSourceContext(
      user,
      module,
      entityId,
    );
    if (!record) {
      throw new NotFoundException(this.proposalSourceNotFoundMessage(module));
    }

    const model = this.settingsModel(outreachSettings as Record<string, unknown>);

    const userPrompt = this.buildContractUserPrompt(
      contractSettings,
      context,
      input,
    );
    const text = await this.anthropic.createMessageText({
      userPrompt,
      model,
      featureLabel: 'CRM contract draft',
    });
    const draft = this.parseProposalDraftJson(text);
    const enriched = this.enrichProposalDraftFromContext(draft, context, module);
    if (!enriched.title.toLowerCase().includes('agreement')) {
      enriched.title = enriched.title.includes('Contract')
        ? enriched.title
        : `${enriched.title} — Service Agreement`;
    }
    if (!enriched.subject.toLowerCase().includes('agreement')) {
      enriched.subject = `Service agreement: ${enriched.subject}`;
    }
    return enriched;
  }

  private enrichProposalDraftFromContext(
    draft: {
      title: string;
      subject: string;
      bodyHtml: string;
      clientName: string;
      clientEmail: string;
    },
    context: Record<string, unknown>,
    module: ProposalSourceModule,
  ) {
    if (module === 'deals') {
      const first = String(context.contactFirstName || '').trim();
      const last = String(context.contactLastName || '').trim();
      const name = `${first} ${last}`.trim();
      const email = String(context.contactEmail || '').trim();
      const org = String(context.organization || '').trim();
      if (!draft.clientName && name) draft.clientName = name;
      if (!draft.clientName && org) draft.clientName = org;
      if (!draft.clientEmail && email) draft.clientEmail = email;
    }
    if (module === 'platform-opportunities') {
      const client = String(context.platformClientLabel || '').trim();
      const title = String(context.title || '').trim();
      if (!draft.clientName && client) draft.clientName = client;
      if (!draft.title && title) draft.title = `Proposal: ${title}`;
    }
    return draft;
  }

  async draftClientPortalUpdate(
    user: any,
    dealId: string,
    input: {
      cadence?: 'daily' | 'weekly' | 'general';
      instructions?: string;
      lookbackHours?: number;
    },
  ): Promise<{ title: string; body: string; cadence: 'daily' | 'weekly' | 'general' }> {
    const dealRecordId = String(dealId || '').trim();
    if (!dealRecordId) {
      throw new BadRequestException('dealId is required');
    }
    await this.crmService.assertClientPortalAccess(user, dealRecordId, 'manager');

    this.requireLlmConfigured('AI drafting');
    const promptSettings =
      await this.outreachAiSettings.getEffectiveForPromptSafe();
    if (promptSettings.enabled === false) {
      throw new ServiceUnavailableException(
        'AI outreach drafting is disabled. Enable it under CRM Settings → AI outreach.',
      );
    }

    const lookbackHours = Math.max(1, Number(input?.lookbackHours || 24));
    const [deal, baseDraft, recentUpdates] = await Promise.all([
      this.crmService.findOneDeal(dealRecordId, user),
      this.crmService.buildClientPortalDailyUpdateDraft(dealRecordId, user, lookbackHours),
      this.crmService.listClientPortalUpdates(dealRecordId, 5),
    ]);

    const requestedCadence =
      input?.cadence === 'daily' || input?.cadence === 'weekly' || input?.cadence === 'general'
        ? input.cadence
        : 'daily';

    const model = this.settingsModel(promptSettings as Record<string, unknown>);

    const prompt = [
      'You are generating a clear, client-facing project update for a client portal.',
      '',
      'CRM deal context JSON:',
      JSON.stringify(
        {
          title: (deal as any)?.title || '',
          stage: (deal as any)?.stage || '',
          portalScopeSummary: (deal as any)?.portalScopeSummary || '',
          portalMilestones: (deal as any)?.portalMilestones || [],
          portalDeadlines: (deal as any)?.portalDeadlines || [],
        },
        null,
        2,
      ),
      '',
      'Ticket-movement baseline draft JSON:',
      JSON.stringify(baseDraft, null, 2),
      '',
      'Recent already-posted portal updates (avoid repeating verbatim):',
      JSON.stringify(
        (recentUpdates || []).map((u: any) => ({
          title: u?.title || '',
          body: u?.body || '',
          cadence: u?.cadence || 'general',
          createdAt: u?.createdAt || null,
        })),
        null,
        2,
      ),
      '',
      `Requested cadence: ${requestedCadence}`,
      input?.instructions?.trim()
        ? `Additional author instructions:\n${input.instructions.trim()}`
        : '',
      '',
      'Write an update that is concise, transparent, and non-technical where possible.',
      'Include: progress snapshot, key completed/in-progress items, blockers/risks (if any), and next steps.',
      'Do not invent metrics or commitments not supported by context.',
      '',
      'Return ONLY valid JSON in this exact shape (no markdown):',
      '{"title":"...","body":"...","cadence":"daily|weekly|general"}',
    ]
      .filter(Boolean)
      .join('\n');

    const raw = await this.anthropic.createMessageText({
      userPrompt: prompt,
      model,
      featureLabel: 'Client portal update',
    });
    let parsed: { title?: unknown; body?: unknown; cadence?: unknown } | null = null;
    try {
      parsed = JSON.parse(raw) as { title?: unknown; body?: unknown; cadence?: unknown };
    } catch {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start >= 0 && end > start) {
        parsed = JSON.parse(raw.slice(start, end + 1)) as {
          title?: unknown;
          body?: unknown;
          cadence?: unknown;
        };
      }
    }
    if (!parsed) {
      throw new BadRequestException('Could not parse AI client-portal update response.');
    }

    const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
    const body = typeof parsed.body === 'string' ? parsed.body.trim() : '';
    const cadence =
      parsed.cadence === 'daily' || parsed.cadence === 'weekly' || parsed.cadence === 'general'
        ? parsed.cadence
        : requestedCadence;
    if (!title || !body) {
      throw new BadRequestException('AI response missing title or body for client-portal update.');
    }
    return { title, body, cadence };
  }

  private async resolvePersonDraftContext(
    module: PersonModule,
    entityId: string,
    user: any,
  ): Promise<{
    record: Record<string, unknown> | null;
    context: Record<string, unknown>;
    promptSettings: Record<string, unknown>;
    pipelineOutreach: PipelineOutreachAiContext | null;
  }> {
    let record: Record<string, unknown> | null = null;
    if (module === 'leads') {
      const lead = await this.crmService.findOneLead(entityId, user);
      if (lead) {
        record = JSON.parse(JSON.stringify(lead)) as Record<string, unknown>;
      }
    } else {
      const contact = await this.crmService.findOneContact(entityId);
      if (contact) {
        record = JSON.parse(JSON.stringify(contact)) as Record<string, unknown>;
      }
    }
    if (!record) {
      return {
        record: null,
        context: {},
        promptSettings: await this.outreachAiSettings.getEffectiveForPromptSafe(),
        pipelineOutreach: null,
      };
    }

    const context = await this.buildPersonContext(module, record);
    const globalSettings =
      await this.outreachAiSettings.getEffectiveForPromptSafe();
    const pipelineOutreach =
      (context.pipelineOutreachAiContext as PipelineOutreachAiContext | null) ||
      null;
    const categoryType =
      typeof context.pipelineCategoryType === 'string'
        ? context.pipelineCategoryType
        : undefined;
    const promptSettings = mergeOutreachPromptSettings(
      globalSettings,
      pipelineOutreach,
      categoryType,
    );
    return { record, context, promptSettings, pipelineOutreach };
  }

  private buildOutreachUserPrompt(
    settings: Record<string, unknown>,
    context: Record<string, unknown>,
    instructions?: string,
    contextCheck?: OutreachContextCheckResult,
  ): string {
    const toneKey = String(settings.tonePreset || 'consultative');
    const toneInstruction =
      TONE_HINTS[toneKey] || TONE_HINTS.consultative;

    const organizationGuidelines = {
      businessName: settings.businessName || '',
      positioningAndServicesContext: settings.businessSummary || '',
      servicesAndDifferentiators: settings.servicesOffered || '',
      idealCustomerProfile: settings.idealClientProfile || '',
      tonePreset: toneKey,
      toneInstruction,
      closingSignatureOrCtaHint: settings.signatureOrClosing || '',
      emphasizeWhenRelevant: settings.mustMention || '',
      avoidSaying: settings.avoidSaying || '',
      adminExtraContext: settings.additionalSystemContext || '',
    };

    const senderBusinessContext =
      typeof context.senderBusinessContext === 'string' &&
      context.senderBusinessContext.trim()
        ? context.senderBusinessContext.trim()
        : PIPELINE_CATEGORY_CONTEXT.it_consulting;

    return [
      'You are helping a business development or account executive write a first-touch outreach email.',
      `The sender works for ${senderBusinessContext}. Follow the organization guidelines below precisely.`,
      '',
      'Organization & outreach guidelines (from CRM Settings — AI outreach):',
      JSON.stringify(organizationGuidelines, null, 2),
      '',
      'Prospect CRM record (JSON):',
      JSON.stringify(context, null, 2),
      contextCheck?.missing.length
        ? `\nContext gaps (not in CRM yet): ${contextCheck.missingLabels.join(', ')}. Personalize with what is available; do not fabricate missing facts.`
        : '',
      instructions?.trim()
        ? `\nOne-off instructions from the rep composing this email:\n${instructions.trim()}`
        : '',
      '',
      'Use the LinkedIn post snippet (if present) to infer needs, pain, or topics the prospect cares about.',
      'Custom fields may include requirements, budget, timeline, or product interest — treat them as high-signal.',
      'Align the message with the services and positioning described in organization guidelines; suggest a relevant conversation, not a generic blast.',
      '',
      buildSpamAvoidancePromptSection(),
      '',
      'Respond with ONLY valid JSON (no markdown code fences) in this exact shape:',
      '{"subject":"...","bodyHtml":"<p>...</p>"}',
      'Rules:',
      '- subject: one line, no prefix like "Subject:"; compelling for an IT decision-maker when appropriate; under 60 characters when possible.',
      '- bodyHtml: use only these tags: p, br, strong, em, ul, ol, li.',
      '- Length: roughly 120–220 words unless the CRM context clearly needs more.',
      '- Personalize with first name and company where known.',
      '- Do not invent certifications, named clients, awards, or metrics not present in the CRM JSON.',
      '- If requirements are unclear, end with one short, specific clarifying question.',
      '- Must pass spam-filter rules above: no trigger phrases, no ALL CAPS subject, max one "!".',
      '- Escape any double quotes inside JSON strings properly.',
    ].join('\n');
  }

  private buildXDmUserPrompt(
    settings: Record<string, unknown>,
    context: Record<string, unknown>,
    instructions?: string,
  ): string {
    const toneKey = String(settings.tonePreset || 'consultative');
    const toneInstruction =
      TONE_HINTS[toneKey] || TONE_HINTS.consultative;

    const organizationGuidelines = {
      businessName: settings.businessName || '',
      positioningAndServicesContext: settings.businessSummary || '',
      servicesAndDifferentiators: settings.servicesOffered || '',
      idealCustomerProfile: settings.idealClientProfile || '',
      tonePreset: toneKey,
      toneInstruction,
      closingSignatureOrCtaHint: settings.signatureOrClosing || '',
      emphasizeWhenRelevant: settings.mustMention || '',
      avoidSaying: settings.avoidSaying || '',
      adminExtraContext: settings.additionalSystemContext || '',
    };

    const senderBusinessContext =
      typeof context.senderBusinessContext === 'string' &&
      context.senderBusinessContext.trim()
        ? context.senderBusinessContext.trim()
        : PIPELINE_CATEGORY_CONTEXT.it_consulting;

    return [
      'You are helping a business development rep write a first-touch cold direct message on X (Twitter).',
      `The sender works for ${senderBusinessContext}. Follow the organization guidelines below.`,
      '',
      'Organization & outreach guidelines (from CRM Settings — AI outreach):',
      JSON.stringify(organizationGuidelines, null, 2),
      '',
      'Prospect CRM record (JSON):',
      JSON.stringify(context, null, 2),
      instructions?.trim()
        ? `\nOne-off instructions from the rep:\n${instructions.trim()}`
        : '',
      '',
      'Use LinkedIn post snippet or custom fields when present. Write like a human DM — not an email.',
      '',
      'Respond with ONLY valid JSON (no markdown fences):',
      '{"message":"..."}',
      'Rules:',
      '- message: plain text only (no HTML). Max 260 characters (X DM limit is 280; leave margin).',
      '- Conversational, specific, one clear ask or question.',
      '- Personalize with first name and company when known.',
      '- No hashtags unless the prospect uses them in context.',
      '- No "Dear" or formal email openings.',
      '- Do not invent facts, clients, or metrics not in the CRM JSON.',
      '- Escape double quotes inside JSON properly.',
    ].join('\n');
  }

  private buildReplyUserPrompt(
    settings: Record<string, unknown>,
    inboxContext: Record<string, unknown>,
    personContext: Record<string, unknown> | null,
    instructions?: string,
  ): string {
    const toneKey = String(settings.tonePreset || 'consultative');
    const toneInstruction =
      TONE_HINTS[toneKey] || TONE_HINTS.consultative;

    const senderBusinessContext =
      personContext &&
      typeof personContext.senderBusinessContext === 'string' &&
      personContext.senderBusinessContext.trim()
        ? personContext.senderBusinessContext.trim()
        : PIPELINE_CATEGORY_CONTEXT.it_consulting;

    const organizationGuidelines = {
      businessName: settings.businessName || '',
      positioningAndServicesContext: settings.businessSummary || '',
      servicesAndDifferentiators: settings.servicesOffered || '',
      idealCustomerProfile: settings.idealClientProfile || '',
      tonePreset: toneKey,
      toneInstruction,
      closingSignatureOrCtaHint: settings.signatureOrClosing || '',
      emphasizeWhenRelevant: settings.mustMention || '',
      avoidSaying: settings.avoidSaying || '',
      adminExtraContext: settings.additionalSystemContext || '',
    };

    return [
      'You are helping a sales rep write a concise follow-up reply email.',
      `The sender works for ${senderBusinessContext}.`,
      '',
      'Organization & outreach guidelines:',
      JSON.stringify(organizationGuidelines, null, 2),
      '',
      'Inbox email to reply to (JSON):',
      JSON.stringify(inboxContext, null, 2),
      '',
      'Known CRM person context (JSON; may be null):',
      JSON.stringify(personContext, null, 2),
      instructions?.trim()
        ? `\nOne-off instructions from the rep composing this reply:\n${instructions.trim()}`
        : '',
      '',
      'Write a practical reply that addresses the inbound message directly and moves conversation forward.',
      '',
      buildSpamAvoidancePromptSection(),
      '',
      'Respond with ONLY valid JSON (no markdown code fences) in this exact shape:',
      '{"subject":"...","bodyHtml":"<p>...</p>"}',
      'Rules:',
      '- subject: should be a natural reply subject (you can keep/normalize Re: ...).',
      '- bodyHtml: use only these tags: p, br, strong, em, ul, ol, li.',
      '- Length: typically 80–180 words.',
      '- Keep continuity with the incoming message context.',
      '- If details are unclear, ask one short clarifying question.',
      '- Do not fabricate facts, case studies, or commitments.',
      '- Must pass spam-filter rules above: no trigger phrases, no ALL CAPS subject, max one "!".',
      '- Escape any double quotes inside JSON strings properly.',
    ].join('\n');
  }

  /** One rewrite pass when the draft scores below the deliverability threshold. */
  private async enforceSpamSafeDraft(
    model: string | undefined,
    draft: { subject: string; bodyHtml: string },
    originalUserPrompt: string,
  ): Promise<{ subject: string; bodyHtml: string }> {
    const minScore = 70;
    const check = analyzeEmailSpamContent(draft.subject, draft.bodyHtml);
    if (check.score >= minScore) return draft;

    const flaggedPhrases = [
      ...new Set(
        check.matches
          .filter((m) => m.severity === 'critical' || m.severity === 'high')
          .map((m) => m.phrase),
      ),
    ].slice(0, 25);
    const structural = check.structuralFlags.map((f) => f.label).join('; ');

    const fixPrompt = [
      originalUserPrompt,
      '',
      `The draft below scored ${check.score}/100 on our spam-word checker (minimum ${minScore} required).`,
      flaggedPhrases.length
        ? `Remove or rephrase these trigger phrases: ${flaggedPhrases.join(', ')}.`
        : '',
      structural ? `Fix: ${structural}.` : '',
      '',
      'Current draft:',
      JSON.stringify(draft),
      '',
      'Rewrite as ONLY valid JSON {"subject":"...","bodyHtml":"..."} that scores at least 70/100 while preserving intent, personalization, and B2B professionalism.',
      buildSpamAvoidancePromptSection(),
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const text = await this.anthropic.createMessageText({
        userPrompt: fixPrompt,
        model,
        featureLabel: 'Spam-safe email rewrite',
      });
      const revised = this.parseDraftJson(text);
      const check2 = analyzeEmailSpamContent(revised.subject, revised.bodyHtml);
      return check2.score >= check.score ? revised : draft;
    } catch {
      return draft;
    }
  }

  private extractFirstEmailAddress(raw: string): string {
    const t = String(raw || '').trim();
    if (!t) return '';
    const m = t.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return m ? m[0] : '';
  }

  private proposalSourceNotFoundMessage(module: ProposalSourceModule): string {
    const labels: Record<ProposalSourceModule, string> = {
      leads: 'Lead',
      contacts: 'Contact',
      deals: 'Deal',
      'platform-opportunities': 'Platform opportunity',
    };
    return `${labels[module] || 'Record'} not found`;
  }

  private async resolveProposalSourceContext(
    user: any,
    module: ProposalSourceModule,
    entityId: string,
  ): Promise<{
    record: Record<string, unknown> | null;
    context: Record<string, unknown>;
  }> {
    if (module === 'leads') {
      const lead = await this.crmService.findOneLead(entityId, user);
      if (!lead) return { record: null, context: {} };
      const record = JSON.parse(JSON.stringify(lead)) as Record<string, unknown>;
      const context = await this.buildPersonContext('leads', record);
      return { record, context };
    }
    if (module === 'contacts') {
      const contact = await this.crmService.findOneContact(entityId);
      if (!contact) return { record: null, context: {} };
      const record = JSON.parse(JSON.stringify(contact)) as Record<string, unknown>;
      const context = await this.buildPersonContext('contacts', record);
      return { record, context };
    }
    if (module === 'deals') {
      const deal = await this.crmService.findOneDeal(entityId, user);
      if (!deal) return { record: null, context: {} };
      const record = JSON.parse(JSON.stringify(deal)) as Record<string, unknown>;
      const context = await this.buildDealContext(record);
      return { record, context };
    }
    const opp = await this.platformOpportunitiesService.findOne(entityId, user);
    if (!opp) return { record: null, context: {} };
    const record = JSON.parse(JSON.stringify(opp)) as Record<string, unknown>;
    const context = this.buildPlatformOpportunityContext(record);
    return { record, context };
  }

  private async buildDealContext(o: Record<string, unknown>) {
    const customFields =
      o.customFields &&
      typeof o.customFields === 'object' &&
      o.customFields !== null &&
      !Array.isArray(o.customFields)
        ? { ...(o.customFields as Record<string, unknown>) }
        : {};

    let pipelineName: string | undefined;
    let senderBusinessContext = PIPELINE_CATEGORY_CONTEXT.it_consulting;
    const pipelineIdRaw = o.pipeline;
    const pipelineId =
      typeof pipelineIdRaw === 'string'
        ? pipelineIdRaw
        : pipelineIdRaw && typeof pipelineIdRaw === 'object'
          ? String(
              (pipelineIdRaw as { _id?: unknown })._id ||
                (pipelineIdRaw as { id?: unknown }).id ||
                '',
            )
          : '';
    if (pipelineId) {
      const pipelineDoc = await this.pipelinesService.findOne(pipelineId);
      if (pipelineDoc) {
        const pipe = pipelineDoc as unknown as {
          name?: string;
          categoryType?: string;
        };
        pipelineName = pipe.name;
        const mapped =
          typeof pipe.categoryType === 'string'
            ? PIPELINE_CATEGORY_CONTEXT[pipe.categoryType]
            : undefined;
        if (mapped) senderBusinessContext = mapped;
      }
    }

    const contact = o.contactPerson as Record<string, unknown> | undefined;
    const org = o.organization as Record<string, unknown> | string | undefined;
    const orgName =
      typeof org === 'string'
        ? org
        : org && typeof org === 'object'
          ? String(org.name || '')
          : '';

    return {
      recordType: 'deal',
      title: o.title,
      stage: o.stage,
      dealValue: o.dealValue,
      expectedDealValue: o.expectedDealValue,
      currency: o.currency,
      dealOwner: o.dealOwner,
      nextStep: o.nextStep,
      expectedClosureDate: o.expectedClosureDate,
      organization: orgName,
      pipelineName,
      pipelineCategoryType: undefined,
      senderBusinessContext,
      contactFirstName: contact?.firstName,
      contactLastName: contact?.lastName,
      contactEmail: contact?.email,
      contactJobTitle: contact?.jobTitle,
      associatedContacts: o.associatedContacts,
      customFields,
    };
  }

  private buildPlatformOpportunityContext(o: Record<string, unknown>) {
    const sm = o.sourceMetadata as Record<string, unknown> | undefined;
    return {
      recordType: 'platform_opportunity',
      title: o.title,
      opportunitySourcePlatform: o.opportunitySourcePlatform,
      platformClientLabel: o.platformClientLabel,
      opportunityListingUrl: o.opportunityListingUrl,
      platformEngagementStatus: o.platformEngagementStatus,
      notes: o.notes,
      source: o.source,
      ownerLabel: o.ownerLabel,
      linkedInPost:
        sm && typeof sm === 'object'
          ? {
              url: sm.url,
              title: sm.title,
              description: sm.description,
              authorName: sm.authorName,
              type: sm.type,
            }
          : null,
      senderBusinessContext: PIPELINE_CATEGORY_CONTEXT.freelancer,
    };
  }

  private async buildPersonContext(
    module: PersonModule,
    o: Record<string, unknown>,
  ) {
    const customFields =
      o.customFields &&
      typeof o.customFields === 'object' &&
      o.customFields !== null &&
      !Array.isArray(o.customFields)
        ? { ...(o.customFields as Record<string, unknown>) }
        : {};

    const sm = o.sourceMetadata as Record<string, unknown> | undefined;
    const linkedInPost =
      sm && typeof sm === 'object'
        ? {
            url: sm.url,
            title: sm.title,
            description: sm.description,
            authorName: sm.authorName,
            type: sm.type,
          }
        : null;

    let relatedServiceName: string | undefined;
    const rs = o.relatedService as { name?: string } | undefined;
    if (rs && typeof rs === 'object' && typeof rs.name === 'string') {
      relatedServiceName = rs.name;
    }

    let pipelineName: string | undefined;
    let pipelineCategoryType: string | undefined;
    let pipelineOutreachAiContext: PipelineOutreachAiContext | null = null;
    let senderBusinessContext = PIPELINE_CATEGORY_CONTEXT.it_consulting;
    if (module === 'leads') {
      const pipelineIdRaw = o.pipeline;
      const pipelineId =
        typeof pipelineIdRaw === 'string'
          ? pipelineIdRaw
          : pipelineIdRaw && typeof pipelineIdRaw === 'object'
            ? String(
                (pipelineIdRaw as { _id?: unknown })._id ||
                  (pipelineIdRaw as { id?: unknown }).id ||
                  '',
              )
            : '';
      if (pipelineId) {
        const pipelineDoc = await this.pipelinesService.findOne(pipelineId);
        if (pipelineDoc) {
          const pipe = pipelineDoc as unknown as {
            name?: string;
            categoryType?: string;
            outreachAiContext?: PipelineOutreachAiContext;
          };
          pipelineName = pipe.name;
          pipelineCategoryType = pipe.categoryType;
          pipelineOutreachAiContext = pipe.outreachAiContext || null;
          const mappedContext =
            typeof pipe.categoryType === 'string'
              ? PIPELINE_CATEGORY_CONTEXT[pipe.categoryType]
              : undefined;
          if (mappedContext) senderBusinessContext = mappedContext;
        }
      }
    }

    return {
      recordType: module === 'leads' ? 'lead' : 'contact',
      firstName: o.firstName,
      lastName: o.lastName,
      email: o.email,
      company: o.organization,
      jobTitle: o.jobTitle,
      industry: o.industry,
      leadSource: o.source,
      stage: o.stage,
      status: o.status,
      territory: o.territory,
      website: o.website,
      linkedInProfileUrl: o.linkedinUrl,
      twitterHandle: o.twitterHandle,
      relatedServiceName,
      pipelineName,
      pipelineCategoryType,
      pipelineOutreachAiContext,
      senderBusinessContext,
      customFields,
      linkedInPost,
    };
  }

  private buildProposalUserPrompt(
    settings: Record<string, unknown>,
    context: Record<string, unknown>,
    input: {
      issuerProfile?: 'agency' | 'freelancer';
      kind?: ProposalKind;
      clientNeeds?: string;
      instructions?: string;
    },
  ): string {
    const defaultIssuer =
      settings.defaultIssuerProfile === 'freelancer' ? 'freelancer' : 'agency';
    const issuerProfile =
      input.issuerProfile === 'freelancer' || input.issuerProfile === 'agency'
        ? input.issuerProfile
        : defaultIssuer;
    const kind = input.kind === 'quotation' ? 'quotation' : 'proposal';
    const kindLabel = kind === 'quotation' ? 'quotation' : 'proposal';
    const senderBusinessContext =
      typeof context.senderBusinessContext === 'string' &&
      context.senderBusinessContext.trim()
        ? context.senderBusinessContext.trim()
        : PIPELINE_CATEGORY_CONTEXT.it_consulting;

    const toneKey = String(settings.tonePreset || 'consultative');
    const toneInstruction =
      TONE_HINTS[toneKey] || TONE_HINTS.consultative;
    const issuer = buildIssuerProfileBlock(issuerProfile, settings);
    const sectionOutline = String(settings.sectionOutline || '').trim();

    return [
      `You are an expert ${kindLabel} writer for IT consulting businesses (software, cloud, product engineering, managed services).`,
      `Issuer profile: "${issuerProfile}" — ${issuer.voice}`,
      `Pipeline / sender context: ${senderBusinessContext}.`,
      '',
      'Issuer profile content (from CRM Settings — AI proposal drafter):',
      JSON.stringify(issuer, null, 2),
      '',
      'Document structure & tone:',
      JSON.stringify(
        {
          tonePreset: toneKey,
          toneInstruction,
          sectionOutline:
            sectionOutline ||
            '1. Introduction\n2. Project overview\n3. Scope of work\n4. Commercials\n5. Timeline\n6. Tech stack\n7. Terms\n8. Why us\n9. Next steps',
          mustInclude: settings.mustInclude || '',
          mustAvoid: settings.mustAvoid || '',
          additionalContext: settings.additionalContext || '',
        },
        null,
        2,
      ),
      '',
      PROPOSAL_HTML_STYLE_RULES,
      '',
      'CRM source record context JSON:',
      JSON.stringify(context, null, 2),
      '',
      input.clientNeeds?.trim()
        ? `Client requirements and expected scope:\n${input.clientNeeds.trim()}`
        : 'Client requirements were not explicitly provided; infer carefully from CRM context and label assumptions.',
      input.instructions?.trim()
        ? `Additional rep instructions:\n${input.instructions.trim()}`
        : '',
      '',
      kind === 'quotation'
        ? 'This is a QUOTATION: keep it shorter — title, client, line items (table or list), total, validity, payment terms from settings when provided.'
        : 'This is a full PROPOSAL: follow the section outline with styled h2 headings; include introduction using issuer intro, scope, commercials (table if pricing tiers), timeline, tech stack and portfolio when settings provide them.',
      '',
      'Output only valid JSON with this exact shape:',
      '{"title":"...","subject":"...","bodyHtml":"<h1 style=\\"...\\">...</h1>...","clientName":"...","clientEmail":"..."}',
      'Rules:',
      '- title: concise, client-specific project name.',
      '- subject: professional email subject when sending this document.',
      '- bodyHtml: beautifully formatted HTML per style rules above; all sections from outline unless quotation.',
      '- Use payment terms and tech stack from issuer profile settings when non-empty; otherwise use sensible IT consulting placeholders clearly marked [Customize].',
      '- Personalize with client first name, company, and CRM custom fields.',
      '- Do not invent certifications, named clients, or metrics not in context or settings.',
      '- Length: proposals ~400–900 words; quotations ~150–350 words.',
      '- clientName/clientEmail from CRM when available.',
      '- Escape double quotes inside JSON strings.',
    ].join('\n');
  }

  private buildContractUserPrompt(
    settings: Record<string, unknown>,
    context: Record<string, unknown>,
    input: {
      issuerProfile?: 'agency' | 'freelancer';
      clientNeeds?: string;
      instructions?: string;
      contractType?: string;
    },
  ): string {
    const defaultIssuer =
      settings.defaultIssuerProfile === 'freelancer' ? 'freelancer' : 'agency';
    const issuerProfile =
      input.issuerProfile === 'freelancer' || input.issuerProfile === 'agency'
        ? input.issuerProfile
        : defaultIssuer;
    const toneKey = String(settings.tonePreset || 'formal');
    const toneInstruction =
      TONE_HINTS[toneKey] || TONE_HINTS.formal;
    const issuer = buildContractIssuerBlock(issuerProfile, settings);
    const sectionOutline = String(settings.contractSectionOutline || '').trim();
    const governingLaw = String(settings.governingLaw || '').trim();
    const contractType =
      String(input.contractType || '').trim() ||
      (issuerProfile === 'freelancer'
        ? 'Independent Contractor Agreement'
        : 'Master Services Agreement / Statement of Work');

    return [
      'You are an expert legal-style contract drafter for IT consulting and software development engagements in India.',
      'IMPORTANT: Output is a business template for review by qualified legal counsel — not legal advice.',
      `Document type: ${contractType}`,
      `Issuer profile: "${issuerProfile}" — ${issuer.voice}`,
      '',
      'Service Provider party details (from CRM Settings — AI contract maker):',
      JSON.stringify(issuer, null, 2),
      '',
      'Contract structure & compliance hints:',
      JSON.stringify(
        {
          tonePreset: toneKey,
          toneInstruction,
          sectionOutline: sectionOutline || 'Standard MSA sections',
          governingLaw: governingLaw || 'Laws of India',
          mustInclude: settings.mustInclude || '',
          mustAvoid: settings.mustAvoid || '',
          additionalContext: settings.additionalContext || '',
        },
        null,
        2,
      ),
      '',
      CONTRACT_HTML_STYLE_RULES,
      '',
      'CRM source record context JSON (Client / project details):',
      JSON.stringify(context, null, 2),
      '',
      input.clientNeeds?.trim()
        ? `Engagement scope and commercial intent:\n${input.clientNeeds.trim()}`
        : 'Scope was not provided; use CRM context and mark commercial specifics as [●].',
      input.instructions?.trim()
        ? `Additional instructions:\n${input.instructions.trim()}`
        : '',
      '',
      'Output only valid JSON:',
      '{"title":"...","subject":"...","bodyHtml":"<h1>...</h1>...","clientName":"...","clientEmail":"..."}',
      'Rules:',
      '- title: include "Agreement" or "Contract" and project/client reference.',
      '- subject: email subject when sending contract for e-signature or review.',
      '- bodyHtml: full formal contract with all outline sections; incorporate standard clauses from settings.',
      '- Clearly label Client and Service Provider; use Client legal name from CRM when known else [Client Legal Name].',
      '- Include fees/payment only if provided in scope; otherwise use [●] placeholders.',
      '- End with signature blocks for both parties (name, title, date lines).',
      '- Length: typically 1,200–2,500 words for agency MSA/SOW; 800–1,500 for freelancer.',
      '- Do not invent registration numbers, addresses, or counsel not in settings.',
      '- Escape JSON quotes properly.',
    ].join('\n');
  }


  private parseDraftJson(text: string): { subject: string; bodyHtml: string } {
    let raw = text.trim();
    const fence = raw.match(/^```(?:json)?\s*([\s\S]*?)```$/im);
    if (fence) raw = fence[1].trim();

    let parsed: { subject?: unknown; bodyHtml?: unknown };
    try {
      parsed = JSON.parse(raw) as { subject?: unknown; bodyHtml?: unknown };
    } catch {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          parsed = JSON.parse(raw.slice(start, end + 1)) as {
            subject?: unknown;
            bodyHtml?: unknown;
          };
        } catch {
          throw new BadRequestException(
            'Could not parse AI response as JSON. Try again or shorten optional instructions.',
          );
        }
      } else {
        throw new BadRequestException(
          'Could not parse AI response. Try again.',
        );
      }
    }

    const subject =
      typeof parsed.subject === 'string' ? parsed.subject.trim() : '';
    const bodyHtml =
      typeof parsed.bodyHtml === 'string' ? parsed.bodyHtml.trim() : '';

    if (!subject || !bodyHtml) {
      throw new BadRequestException(
        'AI response was missing subject or body. Try again.',
      );
    }

    return { subject, bodyHtml };
  }

  private parseXDmDraftJson(text: string): { message: string } {
    let raw = text.trim();
    const fence = raw.match(/^```(?:json)?\s*([\s\S]*?)```$/im);
    if (fence) raw = fence[1].trim();

    let parsed: { message?: unknown };
    try {
      parsed = JSON.parse(raw) as { message?: unknown };
    } catch {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start >= 0 && end > start) {
        parsed = JSON.parse(raw.slice(start, end + 1)) as { message?: unknown };
      } else {
        throw new BadRequestException(
          'Could not parse AI X DM response. Try again.',
        );
      }
    }

    let message =
      typeof parsed.message === 'string' ? parsed.message.trim() : '';
    if (!message) {
      throw new BadRequestException('AI response was missing message text.');
    }
    if (message.length > 280) {
      message = message.slice(0, 277).trimEnd() + '…';
    }
    return { message };
  }

  private parseProposalDraftJson(text: string): {
    title: string;
    subject: string;
    bodyHtml: string;
    clientName: string;
    clientEmail: string;
  } {
    let raw = text.trim();
    const fence = raw.match(/^```(?:json)?\s*([\s\S]*?)```$/im);
    if (fence) raw = fence[1].trim();

    let parsed:
      | {
          title?: unknown;
          subject?: unknown;
          bodyHtml?: unknown;
          clientName?: unknown;
          clientEmail?: unknown;
        }
      | undefined;
    try {
      parsed = JSON.parse(raw) as {
        title?: unknown;
        subject?: unknown;
        bodyHtml?: unknown;
        clientName?: unknown;
        clientEmail?: unknown;
      };
    } catch {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start >= 0 && end > start) {
        parsed = JSON.parse(raw.slice(start, end + 1)) as {
          title?: unknown;
          subject?: unknown;
          bodyHtml?: unknown;
          clientName?: unknown;
          clientEmail?: unknown;
        };
      } else {
        throw new BadRequestException(
          'Could not parse AI proposal response. Try again.',
        );
      }
    }

    const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
    const subject =
      typeof parsed.subject === 'string' ? parsed.subject.trim() : '';
    const bodyHtml =
      typeof parsed.bodyHtml === 'string' ? parsed.bodyHtml.trim() : '';
    const clientName =
      typeof parsed.clientName === 'string' ? parsed.clientName.trim() : '';
    const clientEmail =
      typeof parsed.clientEmail === 'string' ? parsed.clientEmail.trim() : '';
    if (!title || !subject || !bodyHtml) {
      throw new BadRequestException(
        'AI proposal response missing title, subject, or body. Try again.',
      );
    }
    return { title, subject, bodyHtml, clientName, clientEmail };
  }
}
