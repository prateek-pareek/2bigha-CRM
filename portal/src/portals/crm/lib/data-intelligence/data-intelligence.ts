import { CRM_API_URL } from '@/lib/crm/config';

export type DataIntelligenceStatus = {
  configured: boolean;
  features: string[];
};

export type DataIntelligenceMessage = {
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: string[];
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function fetchDataIntelligenceStatus(): Promise<DataIntelligenceStatus> {
  const res = await fetch(`${CRM_API_URL}/crm/data-intelligence/status`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    return { configured: false, features: [] };
  }
  return res.json();
}

export async function queryDataIntelligence(
  question: string,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<{ answer: string; toolsUsed: string[]; model: string }> {
  const res = await fetch(`${CRM_API_URL}/crm/data-intelligence/query`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ question, history }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      Array.isArray(data?.message)
        ? data.message.join(', ')
        : data?.message || 'Data Intelligence request failed',
    );
  }
  return data;
}

export const SUGGESTED_DATA_QUESTIONS = [
  'How many leads do we have in the last 30 days?',
  'Which leads have never been contacted?',
  'Search for leads at Acme Corp',
  'What needs my attention in the sales workspace today?',
  'Find open leads in negotiation stage',
  'Search PM issues about authentication',
];
