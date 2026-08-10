/**
 * Email deliverability audit (authentication, sending, content, monitoring).
 * Provider priorities (reply rate, complaints, reputation, engagement) are highlighted in-app.
 * @see https://www.trulyinbox.com/free-tools/deliverability-checklist/
 */

export type DeliverabilityChecklistCategoryId =
  | 'domain_auth'
  | 'reputation'
  | 'infrastructure'
  | 'sending'
  | 'content'
  | 'monitoring';

export type DeliverabilityAutoCheckKey =
  | 'spf'
  | 'dkim'
  | 'dmarc'
  | 'send_limits'
  | 'list_unsubscribe'
  | 'connected_mailboxes'
  | 'workflow_jitter';

export type DeliverabilityChecklistItem = {
  id: string;
  label: string;
  description: string;
  action: string;
  categoryId: DeliverabilityChecklistCategoryId;
  /** In-app link */
  href?: string;
  /** External tool / docs */
  externalHref?: string;
  autoCheckKey?: DeliverabilityAutoCheckKey;
};

export type DeliverabilityChecklistCategory = {
  id: DeliverabilityChecklistCategoryId;
  title: string;
  description: string;
};

export const DELIVERABILITY_CHECKLIST_CATEGORIES: DeliverabilityChecklistCategory[] = [
  {
    id: 'domain_auth',
    title: 'Domain Authentication',
    description: 'SPF, DKIM, DMARC, and DNS alignment so providers trust your mail.',
  },
  {
    id: 'reputation',
    title: 'Domain & IP Reputation',
    description: 'Blacklists, postmaster tools, and sender reputation signals.',
  },
  {
    id: 'infrastructure',
    title: 'Email Infrastructure',
    description: 'IPs, TLS, bounces, unsubscribe headers, and tracking domains.',
  },
  {
    id: 'sending',
    title: 'Sending Practices',
    description: 'Warmup, volume limits, scheduling, and list hygiene.',
  },
  {
    id: 'content',
    title: 'Email Content',
    description: 'Subject lines, HTML, links, personalization, and compliance.',
  },
  {
    id: 'monitoring',
    title: 'Monitoring & Maintenance',
    description: 'Ongoing tests, dashboards, and complaint/bounce thresholds.',
  },
];

export const DELIVERABILITY_CHECKLIST_ITEMS: DeliverabilityChecklistItem[] = [
  // Domain Authentication (7)
  {
    id: 'spf-record',
    categoryId: 'domain_auth',
    label: 'SPF record published and valid (max 10 DNS lookups)',
    description:
      'SPF lists which servers may send mail for your domain. Missing or invalid SPF makes mail look suspicious.',
    action: 'Add a TXT record in DNS for each sending domain. Verify in Deliverability Health.',
    href: '/crm/settings/email-deliverability/health',
    autoCheckKey: 'spf',
  },
  {
    id: 'dkim-signing',
    categoryId: 'domain_auth',
    label: 'DKIM signing enabled for all sending domains',
    description:
      'DKIM is a cryptographic signature proving the message was not altered in transit.',
    action: 'Enable DKIM in your mail host (Google, Microsoft, Hostinger, etc.) and publish the DNS record.',
    href: '/crm/settings/email-deliverability/health',
    autoCheckKey: 'dkim',
  },
  {
    id: 'dmarc-record',
    categoryId: 'domain_auth',
    label: 'DMARC record published (start with p=none, move to quarantine)',
    description:
      'DMARC tells receivers what to do when SPF or DKIM fails. Start monitoring, then enforce.',
    action: 'Publish a DMARC TXT record; begin with p=none, then p=quarantine after stable sending.',
    href: '/crm/settings/email-deliverability/health',
    autoCheckKey: 'dmarc',
  },
  {
    id: 'return-path',
    categoryId: 'domain_auth',
    label: 'Custom return-path aligned with From domain',
    description:
      'Return-path (envelope sender) should align with your From domain for authentication alignment.',
    action: 'Ask your provider to set a custom return-path / bounce domain on your sending domain.',
  },
  {
    id: 'mx-records',
    categoryId: 'domain_auth',
    label: 'MX records configured for all sending domains',
    description:
      'Domains that only send but cannot receive mail look suspicious to filters.',
    action: 'Ensure MX records exist for every domain you send from.',
    externalHref: 'https://mxtoolbox.com/SuperTool.aspx',
  },
  {
    id: 'bimi',
    categoryId: 'domain_auth',
    label: 'BIMI record published with brand logo (optional)',
    description:
      'BIMI can show your logo in supporting inboxes when DMARC is enforced and a VMC is in place.',
    action: 'Add BIMI after DMARC is at quarantine/reject and you have an approved logo certificate.',
  },
  {
    id: 'domain-history',
    categoryId: 'domain_auth',
    label: 'Domain history reviewed if recently purchased',
    description:
      'Previously abused domains inherit bad reputation.',
    action: 'Check web.archive.org and blacklist tools before cold outreach on a new domain.',
    externalHref: 'https://mxtoolbox.com/blacklists.aspx',
  },

  // Domain & IP Reputation (6)
  {
    id: 'domain-blacklist',
    categoryId: 'reputation',
    label: 'Domain checked against major blacklists',
    description: 'Listed domains are often blocked or filtered to spam.',
    action: 'Run a blacklist check for each sending domain; request delisting if listed.',
    externalHref: 'https://mxtoolbox.com/blacklists.aspx',
  },
  {
    id: 'ip-blacklist',
    categoryId: 'reputation',
    label: 'Sending IP checked against blacklists',
    description: 'Shared or dedicated IPs can be listed independently of your domain.',
    action: 'Find your outbound IP from your host and check blacklists.',
    externalHref: 'https://mxtoolbox.com/blacklists.aspx',
  },
  {
    id: 'google-postmaster',
    categoryId: 'reputation',
    label: 'Google Postmaster Tools set up and monitored',
    description: 'Free Gmail visibility into spam rate, domain reputation, and authentication.',
    action: 'Verify your domain at postmaster.google.com and review weekly.',
    externalHref: 'https://postmaster.google.com/',
  },
  {
    id: 'microsoft-snds',
    categoryId: 'reputation',
    label: 'Microsoft SNDS enrolled',
    description: 'Shows how Outlook/Hotmail rates your sending IPs.',
    action: 'Register sending IPs in Microsoft SNDS.',
    externalHref: 'https://sendersupport.olc.protection.outlook.com/snds/',
  },
  {
    id: 'domain-age',
    categoryId: 'reputation',
    label: 'Domain age > 30 days before cold outreach',
    description: 'Brand-new domains blasting volume look like spam.',
    action: 'Warm the domain 30+ days with authentication and low volume before large campaigns.',
  },
  {
    id: 'sender-score',
    categoryId: 'reputation',
    label: 'Sender Score / Talos reputation reviewed',
    description: 'Low IP reputation scores correlate with spam folder placement.',
    action: 'Check sender score for your outbound IP; improve via warmup and list hygiene.',
    externalHref: 'https://senderscore.org/',
  },

  // Email Infrastructure (7)
  {
    id: 'dedicated-ip',
    categoryId: 'infrastructure',
    label: 'Dedicated IP or reputable shared pool',
    description: 'High-volume senders benefit from isolated reputation.',
    action: 'Confirm with your provider whether you are on shared or dedicated IPs.',
  },
  {
    id: 'ptr-record',
    categoryId: 'infrastructure',
    label: 'Valid reverse DNS (PTR) for sending IP',
    description: 'PTR links IP to hostname; many servers reject mail without it.',
    action: 'Ask hosting or ESP to set PTR to your sending hostname.',
  },
  {
    id: 'tls-outbound',
    categoryId: 'infrastructure',
    label: 'TLS encryption enabled for outbound mail',
    description: 'Unencrypted transport can trigger warnings or rejection.',
    action: 'Confirm TLS is enabled on SMTP / provider outbound settings.',
  },
  {
    id: 'bounce-handling',
    categoryId: 'infrastructure',
    label: 'Hard bounces removed immediately',
    description: 'Repeated sends to dead addresses damage reputation.',
    action: 'Stop mailing hard bounces; clean lists before each campaign.',
  },
  {
    id: 'list-unsubscribe',
    categoryId: 'infrastructure',
    label: 'List-Unsubscribe header and visible opt-out',
    description: 'Gmail and Yahoo expect one-click or mailto unsubscribe on bulk mail.',
    action: 'CRM outbound mail includes List-Unsubscribe — keep opt-out footer in templates.',
    autoCheckKey: 'list_unsubscribe',
  },
  {
    id: 'feedback-loops',
    categoryId: 'infrastructure',
    label: 'Feedback loops enrolled (Yahoo, Microsoft, etc.)',
    description: 'FBLs notify you when recipients mark mail as spam.',
    action: 'Register domains/IPs with major provider feedback loop programs.',
  },
  {
    id: 'tracking-domain',
    categoryId: 'infrastructure',
    label: 'Custom tracking domain configured',
    description: 'Shared tracking domains used by many senders are often filtered.',
    action: 'Use a branded subdomain (e.g. track.yourdomain.com) for open/click tracking.',
  },

  // Sending Practices (6)
  {
    id: 'warmup-ramp',
    categoryId: 'sending',
    label: 'New domain/IP warmed gradually (20–50/day, ramp 2–4 weeks)',
    description: 'Sudden high volume from a cold mailbox is a top spam signal.',
    action: 'Increase daily sends slowly; use low caps in Email Deliverability settings first.',
    href: '/crm/settings/email-deliverability',
  },
  {
    id: 'daily-sending-limits',
    categoryId: 'sending',
    label: 'Daily sending within provider and CRM limits',
    description: 'Exceeding Gmail/Workspace or CRM caps causes blocks and reputation hits.',
    action: 'Enable enforce send limits and stay under per-account hourly/daily caps.',
    href: '/crm/settings/email-deliverability',
    autoCheckKey: 'send_limits',
  },
  {
    id: 'spread-sends',
    categoryId: 'sending',
    label: 'Sends spread across the day (not one burst)',
    description: 'Robotic bursts at the same minute look automated.',
    action: 'Use workflow send jitter / random delays between messages.',
    href: '/crm/settings/workflows',
    autoCheckKey: 'workflow_jitter',
  },
  {
    id: 'reply-handling',
    categoryId: 'sending',
    label: 'Replies go to a monitored inbox (avoid no-reply@)',
    description: 'Replies signal real conversations and improve placement.',
    action: 'Send from connected CRM inboxes you sync and read in CRM Inbox.',
    href: '/crm/inbox',
    autoCheckKey: 'connected_mailboxes',
  },
  {
    id: 'list-cleaning',
    categoryId: 'sending',
    label: 'Contact list verified — invalid addresses removed',
    description: 'High bounce rates quickly damage domain reputation.',
    action: 'Verify emails before outreach; remove hard bounces from CRM lists.',
  },
  {
    id: 'separate-domains',
    categoryId: 'sending',
    label: 'Separate domains for transactional vs marketing vs cold',
    description: 'Cold outreach reputation should not block password resets or invoices.',
    action: 'Use a dedicated outreach subdomain or domain for sales sequences.',
  },

  // Email Content (9)
  {
    id: 'subject-spam-check',
    categoryId: 'content',
    label: 'Subject under 60 characters, no spam trigger words',
    description: 'Subject lines are weighted heavily by filters.',
    action: 'Use the in-composer Subject & body tester and spam checker before sending.',
    href: '/crm/inbox',
  },
  {
    id: 'plain-text-alt',
    categoryId: 'content',
    label: 'Plain-text part included with HTML',
    description: 'Multipart mail looks more legitimate to filters.',
    action: 'Ensure your provider or templates send multipart/alternative where possible.',
  },
  {
    id: 'text-image-ratio',
    categoryId: 'content',
    label: 'Text-to-image ratio healthy (> 60% text)',
    description: 'Image-only emails are a common spam pattern.',
    action: 'Write substantive copy; avoid single large banner images.',
  },
  {
    id: 'no-shorteners',
    categoryId: 'content',
    label: 'No public URL shorteners (bit.ly, etc.)',
    description: 'Short links hide destinations and are heavily filtered.',
    action: 'Use full branded URLs or your own short domain.',
  },
  {
    id: 'personalization',
    categoryId: 'content',
    label: 'Personalization in subject and body (merge tags)',
    description: 'Generic blasts score worse than targeted messages.',
    action: 'Use {{firstName}}, {{companyName}}, etc. in templates; preview merged output.',
    href: '/crm/settings/email-templates',
  },
  {
    id: 'valid-html',
    categoryId: 'content',
    label: 'No broken HTML in templates',
    description: 'Malformed HTML is a spam-filter signal.',
    action: 'Use the CRM template editor; avoid pasted broken markup.',
    href: '/crm/settings/email-templates',
  },
  {
    id: 'link-count',
    categoryId: 'content',
    label: 'At most 3–4 links per email',
    description: 'Link-heavy mail resembles phishing.',
    action: 'One primary CTA link is ideal for cold mail; trim footer links.',
  },
  {
    id: 'consistent-from',
    categoryId: 'content',
    label: 'Consistent From name and address per campaign',
    description: 'Frequent From changes confuse filters and recipients.',
    action: 'Pick one sender identity per sequence and stick to it.',
  },
  {
    id: 'can-spam-address',
    categoryId: 'content',
    label: 'Physical mailing address in commercial footer (CAN-SPAM)',
    description: 'Required for US commercial email and builds trust.',
    action: 'Add company address to email template footers.',
    href: '/crm/settings/email-templates',
  },

  // Provider priorities (what Gmail/Outlook weight most)
  {
    id: 'provider-reply-rate',
    categoryId: 'sending',
    label: 'Reply rate prioritized over volume',
    description:
      'Inbox providers treat replies as the strongest signal that mail is wanted — more than clever subject lines alone.',
    action:
      'Target qualified leads, ask one clear question, and follow up when someone engages instead of blasting identical copy.',
    href: '/crm/outreach',
  },
  {
    id: 'provider-spam-complaints',
    categoryId: 'monitoring',
    label: 'Spam complaint rate monitored and kept near zero',
    description:
      'A small spike in “Report spam” clicks can suppress an entire domain for weeks.',
    action:
      'Remove complainers and hard bounces immediately; never re-mail suppressed contacts.',
    href: '/crm/settings/email-deliverability/undeliverable',
  },
  {
    id: 'provider-domain-reputation',
    categoryId: 'reputation',
    label: 'Domain reputation healthy (auth + sending history)',
    description:
      'Reputation follows your domain and mailboxes — not a single email’s wording.',
    action:
      'Keep SPF/DKIM/DMARC green, warm up new mailboxes, and stay under per-inbox send caps.',
    href: '/crm/settings/email-deliverability/health',
  },
  {
    id: 'provider-recipient-engagement',
    categoryId: 'sending',
    label: 'Recipient engagement tracked (opens / replies)',
    description:
      'Low engagement teaches filters to bulk-folder or spam future mail from the same sender.',
    action:
      'Pause or narrow sequences with no opens; use follow-up automation only after tracked engagement.',
    href: '/crm/leads',
  },

  // Monitoring & Maintenance (6)
  {
    id: 'warmup-ongoing',
    categoryId: 'monitoring',
    label: 'Mailbox reputation maintained (ongoing warmup / low-risk sends)',
    description: 'Reputation decays when mailboxes go idle or only blast cold mail.',
    action: 'Keep regular low-volume sends and monitor Deliverability Health weekly.',
    href: '/crm/settings/email-deliverability/health',
  },
  {
    id: 'inbox-placement-test',
    categoryId: 'monitoring',
    label: 'Inbox placement tested before major campaigns',
    description: 'Seed tests show inbox vs spam before you email prospects.',
    action: 'Send a test to mail-tester.com or GlockApps before large sends.',
    externalHref: 'https://www.mail-tester.com/',
  },
  {
    id: 'weekly-dashboard',
    categoryId: 'monitoring',
    label: 'Deliverability dashboard reviewed weekly',
    description: 'Early detection prevents reputation snowballs.',
    action: 'Review CRM Deliverability Health and provider postmaster tools every week.',
    href: '/crm/settings/email-deliverability/health',
  },
  {
    id: 'blacklist-monitoring',
    categoryId: 'monitoring',
    label: 'Blacklist monitoring alerts configured',
    description: 'Immediate notice if you are listed.',
    action: 'Set up HetrixTools or MXToolbox monitoring for domains and IPs.',
    externalHref: 'https://hetrixtools.com/',
  },
  {
    id: 'bounce-complaint-rates',
    categoryId: 'monitoring',
    label: 'Bounce rate < 3%, spam complaints < 0.1%',
    description: 'Providers throttle or bulk-filter when rates exceed thresholds.',
    action: 'Track bounces in your ESP; tighten targeting if complaints rise.',
  },
  {
    id: 'spam-scoring-test',
    categoryId: 'monitoring',
    label: 'Content scored with spam tools before campaigns',
    description: 'Pre-send scoring catches content issues early.',
    action: 'Use in-composer spam + subject checks; run mail-tester for full MIME review.',
    externalHref: 'https://www.mail-tester.com/',
  },
];

export const DELIVERABILITY_CHECKLIST_STORAGE_KEY = 'crm-deliverability-checklist-v1';

export const DELIVERABILITY_CHECKLIST_TOTAL = DELIVERABILITY_CHECKLIST_ITEMS.length;

export function itemsByCategory(
  categoryId: DeliverabilityChecklistCategoryId,
): DeliverabilityChecklistItem[] {
  return DELIVERABILITY_CHECKLIST_ITEMS.filter((i) => i.categoryId === categoryId);
}

export type DeliverabilityHealthSnapshot = {
  domains: Array<{ spf: string; dkim: string; dmarc: string }>;
  summary: {
    totalAccounts: number;
    enforceSendLimits: boolean;
  };
  compliance?: {
    listUnsubscribeEnabled?: boolean;
    oneClickUnsubscribeSupported?: boolean;
    enforceSendLimits?: boolean;
    enableWarmupRamp?: boolean;
    commercialMailingAddressConfigured?: boolean;
    workflowSendJitterConfigured?: boolean;
    inboundBounceSuppressionEnabled?: boolean;
    inboundUnsubscribeDetectionEnabled?: boolean;
  };
};

/** IDs the CRM can suggest as complete based on live settings / health API. */
export function detectAutoCompletedCheckIds(
  health: DeliverabilityHealthSnapshot | null,
): Set<string> {
  const ids = new Set<string>();
  const c = health?.compliance;

  if (c?.listUnsubscribeEnabled !== false) {
    ids.add('list-unsubscribe');
  }
  if (c?.oneClickUnsubscribeSupported) {
    ids.add('list-unsubscribe');
  }

  if (health?.summary.enforceSendLimits || c?.enforceSendLimits) {
    ids.add('daily-sending-limits');
  }
  if (c?.enableWarmupRamp) {
    ids.add('warmup-ramp');
  }

  if ((health?.summary.totalAccounts ?? 0) > 0) {
    ids.add('reply-handling');
  }

  if (c?.workflowSendJitterConfigured) {
    ids.add('spread-sends');
  }
  if (c?.inboundBounceSuppressionEnabled) {
    ids.add('bounce-handling');
  }
  if (c?.commercialMailingAddressConfigured) {
    ids.add('can-spam-address');
  }

  const domains = health?.domains ?? [];
  if (domains.length > 0) {
    if (domains.every((d) => d.spf === 'verified')) ids.add('spf-record');
    if (domains.every((d) => d.dkim === 'verified')) ids.add('dkim-signing');
    if (domains.every((d) => d.dmarc === 'verified')) ids.add('dmarc-record');
  }

  return ids;
}

export function formatChecklistExport(
  checked: Record<string, boolean>,
  format: 'text' | 'markdown',
): string {
  const lines: string[] = [];
  const done = DELIVERABILITY_CHECKLIST_ITEMS.filter((i) => checked[i.id]).length;

  if (format === 'markdown') {
    lines.push('# Email Deliverability Checklist', '');
    lines.push(`**Progress:** ${done}/${DELIVERABILITY_CHECKLIST_TOTAL} completed`, '');
    lines.push(`_Exported from 2Bigha CRM · ${new Date().toLocaleString()}_`, '');
  } else {
    lines.push('Email Deliverability Checklist');
    lines.push(`Progress: ${done}/${DELIVERABILITY_CHECKLIST_TOTAL} completed`);
    lines.push(`Exported: ${new Date().toLocaleString()}`);
    lines.push('');
  }

  for (const cat of DELIVERABILITY_CHECKLIST_CATEGORIES) {
    const items = itemsByCategory(cat.id);
    const catDone = items.filter((i) => checked[i.id]).length;
    if (format === 'markdown') {
      lines.push(`## ${cat.title} (${catDone}/${items.length})`, '');
    } else {
      lines.push(`${cat.title} (${catDone}/${items.length})`);
      lines.push(cat.description);
    }
    for (const item of items) {
      const mark = checked[item.id] ? 'x' : ' ';
      if (format === 'markdown') {
        lines.push(`- [${mark}] **${item.label}**`);
        lines.push(`  - ${item.description}`);
        lines.push(`  - _Action:_ ${item.action}`);
      } else {
        lines.push(`[${mark}] ${item.label}`);
        lines.push(`    ${item.action}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}
