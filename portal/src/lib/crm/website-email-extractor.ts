import { CRM_API_URL } from '@/lib/api/config';

export type WebsiteEmailHit = {
  email: string;
  source: 'mailto' | 'text' | 'attribute' | 'json-ld';
  pageUrl: string;
};

export type WebsiteEmailExtractorResult = {
  url: string;
  title: string | null;
  emails: WebsiteEmailHit[];
  pagesScanned: string[];
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function extractEmailsFromWebsite(
  url: string,
  options?: { crawlContactPages?: boolean },
): Promise<WebsiteEmailExtractorResult> {
  const res = await fetch(`${CRM_API_URL}/crm/email-intelligence/website-emails`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      url,
      crawlContactPages: options?.crawlContactPages ?? true,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === 'string'
        ? data.message
        : Array.isArray(data?.message)
          ? data.message.join(', ')
          : 'Website email extraction failed',
    );
  }

  return data as WebsiteEmailExtractorResult;
}

export function formatEmailSource(source: WebsiteEmailHit['source']): string {
  switch (source) {
    case 'mailto':
      return 'Mailto link';
    case 'attribute':
      return 'HTML attribute';
    case 'json-ld':
      return 'Structured data';
    default:
      return 'Page text';
  }
}
