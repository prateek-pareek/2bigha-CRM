import type { PageTourEntry } from './types';

export const SOCIAL_PAGE_TOURS: PageTourEntry[] = [
  {
    prefix: '/social/compose',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Compose',
        description:
          'Draft social posts and blog content. Pick channels, preview formatting, and schedule or publish when ready.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/social/images',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Image studio',
        description:
          'Create and edit visuals for social and blog posts. Manage assets used across campaigns.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/social/ai-content',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'AI content',
        description:
          'Generate draft copy with AI assistance. Refine tone and length, then send to Compose for publishing.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/social/calendar',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Content calendar',
        description:
          'Plan posts by date and channel. Drag to reschedule and spot gaps in your publishing cadence.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/social/seo',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'SEO & rankings',
        description:
          'Track keyword positions and content performance. Use insights to prioritise topics that drive traffic.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/social/blog',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Blog',
        description:
          'Manage blog posts—drafts, SEO metadata, and publish to your public site via the blog API.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/social/portfolio',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Portfolio & case studies',
        description:
          'Showcase completed work for the marketing site. Add case studies with outcomes and visuals.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/social/approvals',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Content approvals',
        description:
          'Review posts awaiting sign-off before they go live. Approve or send back with feedback.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/social/inbox',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Social inbox',
        description:
          'Engagement and messages across connected social accounts in one place.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/social/analytics',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Analytics',
        description:
          'Reach, engagement, and channel breakdowns for published content.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/social/library',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Media library',
        description:
          'Central store of images and assets reused across compose, blog, and portfolio.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/social',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Social desk overview',
        description:
          'Marketing hub—recent activity, quick links to compose and calendar, and a snapshot of publishing status.',
        side: 'top',
      },
    ],
  },
];
