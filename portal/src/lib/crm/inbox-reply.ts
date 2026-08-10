import { stripCrmEmailTrackingFromHtmlForPreview } from '@/lib/crm/email-preview-iframe';

/** Minimal shape for building an inbox-style reply (list item or GET emails/:id). */
export interface InboxEmailLike {
  _id: string;
  from: string;
  fromName?: string;
  to: string;
  toName?: string;
  subject: string;
  body: string;
  bodyHtml?: string;
  date: string;
  accountId: { _id: string; email: string; displayName?: string; provider: string };
}

export function emailSnippet(text: string | undefined, max = 140) {
  if (!text) return '';
  const plain = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

export function getInboxReplyTarget(item: InboxEmailLike, accountEmail: string) {
  const acc = (accountEmail || '').toLowerCase().trim();
  const fromAddr = (item.from || '').toLowerCase().trim();
  if (fromAddr === acc) {
    return { email: item.to, name: (item.toName || item.to || '').trim() };
  }
  return { email: item.from, name: (item.fromName || item.from || '').trim() };
}

export function buildReplyPresetFromInboxItem(
  item: InboxEmailLike,
  accountEmail: string,
) {
  const { email: recipientEmail, name: recipientName } = getInboxReplyTarget(
    item,
    accountEmail,
  );
  const subj = item.subject || '';
  const reSub = /^re:\s*/i.test(subj) ? subj : `Re: ${subj}`;
  const rawHtml = (item.bodyHtml || '').trim();
  if (rawHtml) {
    const quotedHtml = stripCrmEmailTrackingFromHtmlForPreview(rawHtml);
    return {
      subject: reSub,
      body: '<p></p>',
      recipientEmail,
      recipientName,
      quotedHtml,
      quotedMeta: {
        fromLabel: (item.fromName || '').trim() || item.from,
        dateLabel: new Date(item.date).toLocaleString(),
      },
    };
  }
  const plain = emailSnippet(item.body, 12000);
  const quoted = `\n\n---------- Original message ----------\nFrom: ${item.fromName || item.from}\nDate: ${new Date(item.date).toLocaleString()}\n\n${plain}`;
  return { subject: reSub, body: quoted, recipientEmail, recipientName };
}
