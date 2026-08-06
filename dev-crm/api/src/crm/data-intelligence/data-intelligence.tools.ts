import { AnthropicToolDef } from './data-intelligence.types';

export const DATA_INTELLIGENCE_TOOLS: AnthropicToolDef[] = [
  {
    name: 'crm_search',
    description:
      'Search CRM records by keyword: leads, deals, contacts, companies (organizations), clients, and platform opportunities. Use for “find X”, “who is Y”, record lookup.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search text (name, email, company, etc.)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'crm_dashboard',
    description:
      'CRM pipeline dashboard metrics: deal counts, lead counts, revenue, conversion trends for a time window.',
    input_schema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'Lookback days (default 30, max 365)',
        },
      },
    },
  },
  {
    name: 'crm_sales_attention',
    description:
      'Sales ops queue: leads never contacted, stale follow-ups, unopened tracked emails, replies awaiting response.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'crm_workspace',
    description:
      'Rep workspace snapshot: attention items, tasks, pipeline deals, recent activity for the current user (or team if admin).',
    input_schema: {
      type: 'object',
      properties: {
        window: {
          type: 'string',
          description: 'Optional window: today, week, month',
        },
      },
    },
  },
  {
    name: 'pm_search',
    description:
      'Search PM projects, issues, and wiki pages. Use for delivery/project questions.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text' },
      },
      required: ['query'],
    },
  },
];

export function summarizeSearchSlice(data: Record<string, unknown>): unknown {
  const pick = (rows: unknown[], fields: string[]) =>
    (Array.isArray(rows) ? rows : []).slice(0, 12).map((row) => {
      if (!row || typeof row !== 'object') return row;
      const o = row as Record<string, unknown>;
      const slim: Record<string, unknown> = { _id: o._id };
      for (const f of fields) {
        if (o[f] != null) slim[f] = o[f];
      }
      return slim;
    });

  return {
    leads: pick(data.leads as unknown[], [
      'firstName',
      'lastName',
      'email',
      'organization',
      'leadOwner',
      'status',
      'stage',
    ]),
    deals: pick(data.deals as unknown[], [
      'name',
      'stage',
      'amount',
      'dealOwner',
      'organization',
    ]),
    contacts: pick(data.contacts as unknown[], [
      'firstName',
      'lastName',
      'email',
      'organization',
      'jobTitle',
    ]),
    organizations: pick(data.organizations as unknown[], [
      'name',
      'website',
      'industry',
    ]),
    clients: pick(data.clients as unknown[], ['name', 'email', 'company']),
    platformOpportunities: pick(data.platformOpportunities as unknown[], [
      'title',
      'platform',
      'status',
    ]),
    projects: pick(data.projects as unknown[], ['key', 'name']),
    issues: pick(data.issues as unknown[], ['key', 'summary', 'status']),
    pages: pick(data.pages as unknown[], ['title']),
  };
}
