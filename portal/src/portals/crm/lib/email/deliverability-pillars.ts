/**
 * What modern inbox providers weight most (Gmail, Outlook, Yahoo, etc.).
 * Content checks (spam words, links) matter — these signals matter more.
 */

export type DeliverabilityProviderPillar = {
  id: string;
  title: string;
  why: string;
  inMathionix: string;
};

export const DELIVERABILITY_PROVIDER_PILLARS: DeliverabilityProviderPillar[] = [
  {
    id: 'reply-rate',
    title: 'Reply rate',
    why: 'Replies tell providers your mail is wanted — often weighted above subject-line tricks.',
    inMathionix:
      'Write short, specific outreach; follow up when someone opens or replies; avoid identical blast copy.',
  },
  {
    id: 'spam-complaints',
    title: 'Spam complaints',
    why: 'Even a small complaint rate can throttle an entire domain for weeks.',
    inMathionix:
      'Honor unsubscribes, remove bounces from lists, and stop mailing contacts who mark you as spam.',
  },
  {
    id: 'domain-reputation',
    title: 'Domain reputation',
    why: 'Authentication and sending history follow the domain — not just the words in one email.',
    inMathionix:
      'Fix SPF/DKIM/DMARC in Deliverability Health, warm up mailboxes, and cap daily volume per inbox.',
  },
  {
    id: 'recipient-engagement',
    title: 'Recipient engagement',
    why: 'Opens, clicks, and replies train filters; ignored mail trains them to bulk or spam.',
    inMathionix:
      'Target the right leads, pause sequences when there is no engagement, and split load across mailboxes.',
  },
];

export const DELIVERABILITY_BIGGEST_SECRET_HEADLINE =
  'The biggest deliverability secret';

export const DELIVERABILITY_BIGGEST_SECRET_LEDE =
  'Modern inbox providers care most about engagement and reputation — not whether you avoided one spam phrase. Content checks in the composer still help, but optimize these four signals first:';
