'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Bot, Check, ExternalLink, Loader2, Send, User, X } from 'lucide-react';
import {
  approveSalesAgentAction,
  rejectSalesAgentAction,
  type SalesAgentApproval,
} from '@/lib/crm/sales-agent';
import {
  fetchSalesCopilotStatus,
  querySalesCopilot,
  resumeSalesCopilotSession,
  SUGGESTED_COPILOT_PROMPTS,
  type SalesCopilotMessage,
} from '@/lib/crm/sales-copilot';
import { cn } from '@/lib/utils';

function recordHref(approval: SalesAgentApproval) {
  if (!approval.recordType || !approval.recordId) return null;
  const base =
    approval.recordType === 'Lead'
      ? '/crm/leads'
      : approval.recordType === 'Deal'
        ? '/crm/deals'
        : '/crm/contacts';
  return `${base}/${approval.recordId}`;
}

function ApprovalCard({
  approval,
  onDecided,
}: {
  approval: SalesAgentApproval;
  onDecided: () => void;
}) {
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const href = recordHref(approval);

  const approve = async () => {
    setLoading('approve');
    setError(null);
    try {
      await approveSalesAgentAction(approval._id);
      onDecided();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setLoading(null);
    }
  };

  const reject = async () => {
    setLoading('reject');
    setError(null);
    try {
      await rejectSalesAgentAction(approval._id);
      onDecided();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reject failed');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
        Approval required · {approval.action.replace(/_/g, ' ')}
      </p>
      <p className="mt-1 text-sm text-slate-800">{approval.previewSummary || approval.action}</p>
      {approval.action === 'send_email' || approval.action === 'send_proposal' ? (
        <div className="mt-2 space-y-1 text-xs text-slate-600">
          <p>
            <span className="font-medium">To:</span> {String(approval.payload?.to || '—')}
          </p>
          <p>
            <span className="font-medium">Subject:</span> {String(approval.payload?.subject || '—')}
          </p>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void approve()}
          disabled={!!loading}
          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading === 'approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Approve
        </button>
        <button
          type="button"
          onClick={() => void reject()}
          disabled={!!loading}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-[var(--surface-dim)] disabled:opacity-50"
        >
          {loading === 'reject' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          Reject
        </button>
        {href ? (
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            View record
            <ExternalLink className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

type SalesCopilotChatProps = {
  className?: string;
  compact?: boolean;
  showHeader?: boolean;
  suggestedPrompts?: string[];
};

export function SalesCopilotChat({
  className,
  compact = false,
  showHeader = true,
  suggestedPrompts = SUGGESTED_COPILOT_PROMPTS,
}: SalesCopilotChatProps) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<SalesCopilotMessage[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem('sales_copilot_state');
        if (stored) return JSON.parse(stored).messages || [];
      } catch (e) {}
    }
    return [];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem('sales_copilot_state');
        if (stored) return JSON.parse(stored).sessionId || undefined;
      } catch (e) {}
    }
    return undefined;
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchSalesCopilotStatus().then((s) => setConfigured(s.configured));
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('sales_copilot_state', JSON.stringify({ messages, sessionId }));
    }
  }, [messages, sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const appendAssistant = useCallback((payload: Partial<SalesCopilotMessage> & { content: string }) => {
    setMessages((prev) => [...prev, { role: 'assistant', ...payload }]);
  }, []);

  const startNewChat = useCallback(() => {
    setMessages([]);
    setSessionId(undefined);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('sales_copilot_state');
    }
    setError(null);
  }, []);

  const handleResume = useCallback(
    async (sid: string) => {
      const result = await resumeSalesCopilotSession(sid);
      if (result.answer) {
        appendAssistant({
          content: result.answer,
          toolsUsed: result.toolsUsed,
          pendingApprovals: result.pendingApprovals,
          status: result.status,
        });
      }
      if (result.status !== 'pending_approval' && result.pendingApprovals.length === 0) {
        setSessionId(result.sessionId);
      }
    },
    [appendAssistant],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || loading) return;

      setError(null);
      setLoading(true);
      setInput('');

      const userMsg: SalesCopilotMessage = { role: 'user', content: message };
      setMessages((prev) => [...prev, userMsg]);

      try {
        const history = [...messages, userMsg].slice(-8).map((m) => ({
          role: m.role,
          content: m.content,
        }));
        const result = await querySalesCopilot(message, {
          sessionId,
          history: history.slice(0, -1),
        });
        setSessionId(result.sessionId);
        appendAssistant({
          content: result.answer,
          toolsUsed: result.toolsUsed,
          pendingApprovals: result.pendingApprovals,
          status: result.status,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Request failed';
        setError(msg);
        appendAssistant({ content: `Sorry — ${msg}` });
      } finally {
        setLoading(false);
      }
    },
    [appendAssistant, loading, messages, sessionId],
  );

  const handleApprovalDecided = useCallback(
    async (messageIndex: number) => {
      if (!sessionId) return;
      setLoading(true);
      try {
        await handleResume(sessionId);
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex ? { ...m, pendingApprovals: [] } : m,
          ),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Resume failed');
      } finally {
        setLoading(false);
      }
    },
    [handleResume, sessionId],
  );

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {showHeader ? (
        <div className={cn('shrink-0', compact ? 'mb-3' : 'mb-4')}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-violet-500/10 text-violet-600">
                <Bot size={20} />
              </div>
              <div>
                <h2 className={cn('font-semibold text-[var(--text-main)]', compact ? 'text-base' : 'text-xl')}>
                  Sales Copilot
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Add leads · outreach · follow-ups · search · tasks (sends need approval)
                </p>
              </div>
            </div>
            {messages.length > 0 ? (
              <button
                type="button"
                onClick={startNewChat}
                className="text-xs font-medium text-violet-600 hover:text-violet-700 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                New Chat
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {configured === false ? (
        <div className="mb-3 flex gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 shrink-0">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <p>
            No LLM API key on the server. Set <strong>ANTHROPIC_API_KEY</strong>,{' '}
            <strong>OPENAI_API_KEY</strong>, or <strong>GOOGLE_API_KEY</strong> /{' '}
            <strong>GEMINI_API_KEY</strong> and optional <strong>AI_LLM_PROVIDER</strong> (auto
            picks the first configured provider).
          </p>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className={cn(
          'flex-1 min-h-0 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white shadow-sm',
          compact ? 'min-h-[280px]' : '',
        )}
      >
        {messages.length === 0 ? (
          <div className={cn('space-y-4', compact ? 'p-4' : 'p-6')}>
            <p className="text-sm text-[var(--text-muted)] leading-relaxed max-w-xl">
              Add leads from chat, run outreach with approval, schedule follow-up cadences, search pipeline data,
              create tasks, and update stages — all from one assistant.
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestedPrompts.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={loading || configured === false}
                  onClick={() => void sendMessage(q)}
                  className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-left text-xs font-medium text-violet-900 hover:bg-violet-100 disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--surface-dim)] p-3 sm:p-4">
            {messages.map((m, i) => (
              <li key={i} className="flex gap-3 py-3">
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    m.role === 'user' ? 'bg-slate-100 text-slate-600' : 'bg-violet-100 text-violet-700',
                  )}
                >
                  {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {m.role === 'user' ? 'You' : 'Sales Copilot'}
                  </p>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-main)]">
                    {m.content}
                  </div>
                  {m.toolsUsed && m.toolsUsed.length > 0 ? (
                    <p className="mt-2 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                      Tools: {m.toolsUsed.join(', ')}
                    </p>
                  ) : null}
                  {m.pendingApprovals?.map((approval) => (
                    <ApprovalCard
                      key={approval._id}
                      approval={approval}
                      onDecided={() => void handleApprovalDecided(i)}
                    />
                  ))}
                </div>
              </li>
            ))}
            {loading ? (
              <li className="flex items-center gap-2 py-3 text-sm text-[var(--text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Thinking…
              </li>
            ) : null}
          </ul>
        )}
      </div>

      {error ? <p className="mt-2 shrink-0 text-xs text-red-600">{error}</p> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage(input);
        }}
        className="mt-3 flex shrink-0 gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading || configured === false}
          placeholder="Ask a question or describe a task…"
          className="flex-1 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-4 py-2.5 text-sm text-[var(--text-main)] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
        <button
          type="submit"
          disabled={loading || configured === false || !input.trim()}
          className="inline-flex items-center justify-center rounded-[var(--radius-md)] bg-violet-600 px-4 py-2.5 text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}
