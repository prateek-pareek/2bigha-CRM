import { randomUUID } from 'crypto';

/** Blueprints for “Create from template” — not stored until instantiated. */
export const PLAYBOOK_TEMPLATE_KEYS = [
  'discovery-deal',
  'qualification-contact',
] as const;

export type PlaybookTemplateKey = (typeof PLAYBOOK_TEMPLATE_KEYS)[number];

export function buildPlaybookFromTemplate(
  key: PlaybookTemplateKey,
): Record<string, unknown> {
  const sid = () => randomUUID();
  const qid = () => randomUUID();

  if (key === 'discovery-deal') {
    return {
      name: 'Discovery call (Deal)',
      description: 'Template: discovery questions and fields mapped to the deal.',
      appliesTo: 'Deal',
      status: 'draft',
      category: 'Sales',
      team: '',
      salesStages: ['Qualification'],
      sections: [
        {
          id: sid(),
          type: 'script',
          order: 0,
          title: 'Opening script',
          html: '<p>Thanks for taking the time. I would like to understand your goals and timeline.</p>',
        },
        {
          id: sid(),
          type: 'checklist',
          order: 1,
          title: 'Pre-call checklist',
          html: '<ul><li><p>Review account notes</p></li><li><p>Confirm attendees</p></li></ul>',
        },
        {
          id: sid(),
          type: 'qa',
          order: 2,
          title: 'Discovery prompts',
          html: '<p>What problem are you trying to solve? Who else is involved in the decision?</p>',
        },
        {
          id: sid(),
          type: 'notes',
          order: 3,
          title: 'Notes',
          html: '<p></p>',
        },
      ],
      runnerQuestions: [
        {
          id: qid(),
          order: 0,
          prompt: 'What is the primary pain point?',
          answerType: 'text',
          options: [],
          crmTarget: 'Deal',
          crmFieldPath: 'customFields.painPoint',
        },
        {
          id: qid(),
          order: 1,
          prompt: 'Budget range',
          answerType: 'dropdown',
          options: ['< 10k', '10k–50k', '50k+', 'Unknown'],
          crmTarget: 'Deal',
          crmFieldPath: 'customFields.budgetBand',
        },
        {
          id: qid(),
          order: 2,
          prompt: 'Confirmed decision timeline?',
          answerType: 'checkbox',
          options: ['This quarter', 'Next quarter', 'Exploring only'],
          crmTarget: 'Deal',
          crmFieldPath: 'customFields.timelineSignals',
        },
      ],
      recommendationTrigger: {
        recordType: 'Deal',
        fieldPath: 'stage',
        operator: 'eq',
        values: ['Qualification'],
      },
    };
  }

  // qualification-contact
  return {
    name: 'Qualification (Contact)',
    description: 'Template for qualifying a contact record.',
    appliesTo: 'Contact',
    status: 'draft',
    category: 'Sales',
    team: '',
    salesStages: ['New'],
    sections: [
      {
        id: sid(),
        type: 'script',
        order: 0,
        title: 'Intro',
        html: '<p>Quick qualification to see if we are a fit.</p>',
      },
    ],
    runnerQuestions: [
      {
        id: qid(),
        order: 0,
        prompt: 'Role / title confirmed?',
        answerType: 'text',
        options: [],
        crmTarget: 'Contact',
        crmFieldPath: 'jobTitle',
      },
      {
        id: qid(),
        order: 1,
        prompt: 'Interest level',
        answerType: 'dropdown',
        options: ['High', 'Medium', 'Low'],
        crmTarget: 'Contact',
        crmFieldPath: 'customFields.interestLevel',
      },
    ],
    recommendationTrigger: {
      recordType: 'Contact',
      fieldPath: 'stage',
      operator: 'eq',
      values: ['New'],
    },
  };
}

export function listTemplateSummaries() {
  return [
    {
      key: 'discovery-deal' as const,
      name: 'Discovery call (Deal)',
      appliesTo: 'Deal',
      category: 'Sales',
    },
    {
      key: 'qualification-contact' as const,
      name: 'Qualification (Contact)',
      appliesTo: 'Contact',
      category: 'Sales',
    },
  ];
}
