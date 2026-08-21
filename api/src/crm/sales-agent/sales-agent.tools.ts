import { AnthropicToolDef } from './sales-agent.types';

export const SALES_AGENT_TOOLS: AnthropicToolDef[] = [
  {
    name: 'crm_search',
    description:
      'Search CRM records by keyword (leads, deals, contacts, organizations, clients).',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text' },
      },
      required: ['query'],
    },
  },
  {
    name: 'crm_sales_attention',
    description:
      'Sales ops queue: never contacted leads, stale follow-ups, replies awaiting response.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_lead',
    description: 'Fetch a lead by MongoDB id with pipeline, stage, and custom fields.',
    input_schema: {
      type: 'object',
      properties: { leadId: { type: 'string' } },
      required: ['leadId'],
    },
  },
  {
    name: 'get_deal',
    description: 'Fetch a deal by MongoDB id with pipeline, stage, value, and associations.',
    input_schema: {
      type: 'object',
      properties: { dealId: { type: 'string' } },
      required: ['dealId'],
    },
  },
  {
    name: 'get_record_context',
    description:
      'Rich context for the current record: agent memory, email engagement summary, recent activities.',
    input_schema: {
      type: 'object',
      properties: {
        recordType: { type: 'string', enum: ['Lead', 'Deal', 'Contact'] },
        recordId: { type: 'string' },
      },
      required: ['recordType', 'recordId'],
    },
  },
  {
    name: 'draft_outreach_email',
    description: 'AI-draft an outreach email for a lead or contact (does not send).',
    input_schema: {
      type: 'object',
      properties: {
        module: { type: 'string', enum: ['leads', 'contacts'] },
        entityId: { type: 'string' },
        instructions: { type: 'string' },
      },
      required: ['module', 'entityId'],
    },
  },
  {
    name: 'draft_inbox_reply',
    description: 'AI-draft a reply to an inbox email thread (does not send).',
    input_schema: {
      type: 'object',
      properties: {
        inboxEmailId: { type: 'string' },
        instructions: { type: 'string' },
      },
      required: ['inboxEmailId'],
    },
  },
  {
    name: 'draft_proposal',
    description: 'AI-draft a proposal or quotation HTML for a lead, contact, or deal.',
    input_schema: {
      type: 'object',
      properties: {
        module: {
          type: 'string',
          enum: ['leads', 'contacts', 'deals'],
        },
        entityId: { type: 'string' },
        kind: { type: 'string', enum: ['proposal', 'quotation'] },
        instructions: { type: 'string' },
      },
      required: ['module', 'entityId'],
    },
  },
  {
    name: 'draft_contract',
    description: 'AI-draft a contract HTML for a lead, contact, or deal.',
    input_schema: {
      type: 'object',
      properties: {
        module: {
          type: 'string',
          enum: ['leads', 'contacts', 'deals'],
        },
        entityId: { type: 'string' },
        instructions: { type: 'string' },
      },
      required: ['module', 'entityId'],
    },
  },
  {
    name: 'create_task',
    description: 'Create a CRM task linked to the record.',
    input_schema: {
      type: 'object',
      properties: {
        recordType: { type: 'string', enum: ['Lead', 'Deal', 'Contact'] },
        recordId: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
        dueDate: { type: 'string', description: 'ISO date optional' },
      },
      required: ['recordType', 'recordId', 'title'],
    },
  },
  {
    name: 'create_note',
    description: 'Create an internal note on the record.',
    input_schema: {
      type: 'object',
      properties: {
        recordType: { type: 'string', enum: ['Lead', 'Deal', 'Contact'] },
        recordId: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['recordType', 'recordId', 'content'],
    },
  },
  {
    name: 'update_lead_stage',
    description: 'Move a lead to a pipeline stage.',
    input_schema: {
      type: 'object',
      properties: {
        leadId: { type: 'string' },
        stageName: { type: 'string' },
      },
      required: ['leadId', 'stageName'],
    },
  },
  {
    name: 'update_deal_stage',
    description: 'Move a deal to a pipeline stage.',
    input_schema: {
      type: 'object',
      properties: {
        dealId: { type: 'string' },
        stageName: { type: 'string' },
      },
      required: ['dealId', 'stageName'],
    },
  },
  {
    name: 'enroll_workflow',
    description: 'Enroll a lead or contact into an existing CRM workflow.',
    input_schema: {
      type: 'object',
      properties: {
        workflowId: { type: 'string' },
        entityType: { type: 'string', enum: ['Lead', 'Contact'] },
        entityId: { type: 'string' },
      },
      required: ['workflowId', 'entityType', 'entityId'],
    },
  },
  {
    name: 'send_email',
    description:
      'Send an outbound email from a connected inbox account. Requires human approval.',
    input_schema: {
      type: 'object',
      properties: {
        accountId: { type: 'string' },
        to: { type: 'string' },
        subject: { type: 'string' },
        bodyHtml: { type: 'string' },
        module: { type: 'string', enum: ['leads', 'contacts', 'deals'] },
        entityId: { type: 'string' },
        replyToInboxEmailId: { type: 'string' },
      },
      required: ['accountId', 'to', 'subject', 'bodyHtml'],
    },
  },
  {
    name: 'convert_lead',
    description:
      'Convert a lead to contact, organization, deal, or client. Requires approval.',
    input_schema: {
      type: 'object',
      properties: {
        leadId: { type: 'string' },
        type: {
          type: 'string',
          enum: ['contact', 'organization', 'deal', 'client'],
        },
        pipelineId: { type: 'string' },
        stage: { type: 'string' },
      },
      required: ['leadId', 'type'],
    },
  },
  {
    name: 'create_deal',
    description: 'Create a new deal from lead context. Requires approval.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        leadId: { type: 'string' },
        pipelineId: { type: 'string' },
        stage: { type: 'string' },
        value: { type: 'number' },
        expectedCloseDate: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'send_proposal',
    description:
      'Email a proposal draft to the prospect. Requires approval. Provide subject and bodyHtml from draft_proposal.',
    input_schema: {
      type: 'object',
      properties: {
        accountId: { type: 'string' },
        module: {
          type: 'string',
          enum: ['leads', 'contacts', 'deals'],
        },
        entityId: { type: 'string' },
        to: { type: 'string' },
        subject: { type: 'string' },
        bodyHtml: { type: 'string' },
      },
      required: ['accountId', 'module', 'entityId', 'to', 'subject', 'bodyHtml'],
    },
  },
  {
    name: 'update_deal_value',
    description: 'Update deal amount and/or expected close date. Requires approval.',
    input_schema: {
      type: 'object',
      properties: {
        dealId: { type: 'string' },
        value: { type: 'number' },
        expectedCloseDate: { type: 'string' },
        probability: { type: 'number' },
      },
      required: ['dealId'],
    },
  },
  {
    name: 'assign_owner',
    description: 'Assign leadOwner or dealOwner. Requires approval.',
    input_schema: {
      type: 'object',
      properties: {
        recordType: { type: 'string', enum: ['Lead', 'Deal'] },
        recordId: { type: 'string' },
        ownerName: { type: 'string' },
      },
      required: ['recordType', 'recordId', 'ownerName'],
    },
  },
  {
    name: 'list_pipelines',
    description: 'List CRM pipelines and stages (optionally filter by type: leads, deals).',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['leads', 'deals'] },
      },
    },
  },
  {
    name: 'list_workflows',
    description: 'List enabled CRM workflows available for enrollment.',
    input_schema: {
      type: 'object',
      properties: {
        entityType: { type: 'string', enum: ['Lead', 'Contact', 'Deal'] },
      },
    },
  },
  {
    name: 'list_inbox_accounts',
    description: 'List connected inbox accounts the user can send from (returns account ids).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_email_thread',
    description: 'Tracked email send/open/reply history for a lead, deal, or contact record.',
    input_schema: {
      type: 'object',
      properties: {
        module: { type: 'string', enum: ['leads', 'deals', 'contacts'] },
        entityId: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['module', 'entityId'],
    },
  },
  {
    name: 'schedule_call',
    description: 'Schedule a call/meeting task on a record with optional due date.',
    input_schema: {
      type: 'object',
      properties: {
        recordType: { type: 'string', enum: ['Lead', 'Deal', 'Contact'] },
        recordId: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
        dueDate: { type: 'string' },
      },
      required: ['recordType', 'recordId', 'title'],
    },
  },
  {
    name: 'create_lead',
    description:
      'Create a new CRM lead. Search first to avoid duplicates. Requires firstName; email strongly recommended for outreach.',
    input_schema: {
      type: 'object',
      properties: {
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string' },
        organization: { type: 'string' },
        phone: { type: 'string' },
        mobileNo: { type: 'string' },
        jobTitle: { type: 'string' },
        source: { type: 'string', description: 'Lead source e.g. Referral, LinkedIn, Copilot' },
        pipelineId: { type: 'string', description: 'MongoDB pipeline id; use list_pipelines if unsure' },
        stage: { type: 'string', description: 'Pipeline stage name; defaults to New' },
        notes: { type: 'string', description: 'Internal note saved on the new lead' },
      },
      required: ['firstName'],
    },
  },
  {
    name: 'extract_website_emails',
    description:
      'Scan a company website for publicly visible email addresses (homepage plus contact/about pages). Use when a lead or contact has a website but no email, or when the user asks to find emails from a domain.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Website URL or domain' },
        crawlContactPages: {
          type: 'boolean',
          description: 'Also scan contact/about/team pages (default true)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'get_upcoming_follow_ups',
    description:
      'List scheduled follow-up emails and tasks for leads/contacts in the user workspace (pending workflow jobs).',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max items (default 30)' },
        daysAhead: { type: 'number', description: 'Horizon in days (default 30)' },
      },
    },
  },
  {
    name: 'start_follow_up_sequence',
    description:
      'Schedule a multi-step follow-up cadence for a lead or contact. Each step needs custom email (subject + bodyHtml) and/or a task. Use after initial outreach or when user asks to automate follow-ups.',
    input_schema: {
      type: 'object',
      properties: {
        entityType: { type: 'string', enum: ['Lead', 'Contact'] },
        entityId: { type: 'string' },
        inboxAccountId: { type: 'string', description: 'Default mailbox for all steps; use list_inbox_accounts' },
        cancelOnReply: { type: 'boolean', description: 'Stop sequence when prospect replies (default true)' },
        steps: {
          type: 'array',
          description: 'Ordered follow-up steps',
          items: {
            type: 'object',
            properties: {
              delayDays: { type: 'number', description: 'Days after previous step (default 3)' },
              inboxAccountId: { type: 'string' },
              email: {
                type: 'object',
                properties: {
                  subject: { type: 'string' },
                  bodyHtml: { type: 'string' },
                },
                required: ['subject', 'bodyHtml'],
              },
              task: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  body: { type: 'string' },
                  dueInDays: { type: 'number' },
                },
                required: ['title'],
              },
            },
          },
        },
      },
      required: ['entityType', 'entityId', 'steps'],
    },
  },
];

export { buildSystemPrompt, ROLE_PROMPTS } from './sales-agent.prompts';
