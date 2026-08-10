"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Loader2,
  Send,
  Sparkles,
  Settings2,
  Bot,
  User,
} from "lucide-react";
import {
  fetchDataIntelligenceStatus,
  queryDataIntelligence,
  SUGGESTED_DATA_QUESTIONS,
  type DataIntelligenceMessage,
} from "@/lib/crm/data-intelligence";

export default function DataIntelligencePage() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<DataIntelligenceMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchDataIntelligenceStatus().then((s) => setConfigured(s.configured));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const sendQuestion = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || loading) return;

    setError(null);
    setLoading(true);
    setInput("");

    const userMsg: DataIntelligenceMessage = { role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const history = [...messages, userMsg].slice(-12).map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const result = await queryDataIntelligence(question, history.slice(0, -1));
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.answer,
          toolsUsed: result.toolsUsed,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      setError(msg);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Sorry — ${msg}` },
      ]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendQuestion(input);
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-4xl flex-col px-4 py-6 md:py-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4 shrink-0">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-violet-500/10 text-violet-600">
              <Sparkles size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-main)]">
                Data intelligence
              </h1>
              <p className="text-sm text-[var(--text-muted)]">
                Ask questions about CRM pipeline, leads, deals, and PM data.
              </p>
            </div>
          </div>
        </div>
        <Link
          href="/crm/settings/ai-outreach"
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-main)] hover:bg-[var(--background)]"
        >
          <Settings2 size={14} />
          AI settings
        </Link>
      </div>

      {configured === false ? (
        <div className="mb-4 flex gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shrink-0">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <p>
            <strong>ANTHROPIC_API_KEY</strong> is not configured on the server. Add the same key
            used for CRM AI outreach (Settings → AI Outreach), then restart the API.
          </p>
        </div>
      ) : (
        <p className="mb-4 shrink-0 text-xs text-[var(--text-muted)]">
          Uses the same API key and model as CRM → Settings → AI Outreach.
        </p>
      )}

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white shadow-sm"
      >
        {messages.length === 0 ? (
          <div className="p-8 space-y-6">
            <p className="text-sm text-[var(--text-muted)] leading-relaxed max-w-xl">
              Examples: pipeline metrics, stale leads, record search, workspace attention, PM
              issues. Answers use live data from your Mathionix workspace (scoped to your access).
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_DATA_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={loading || configured === false}
                  onClick={() => void sendQuestion(q)}
                  className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-900 hover:bg-violet-100 disabled:opacity-50 text-left"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--surface-dim)] p-4 space-y-0">
            {messages.map((m, i) => (
              <li key={i} className="py-4 flex gap-3">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    m.role === "user"
                      ? "bg-slate-100 text-slate-600"
                      : "bg-violet-100 text-violet-700"
                  }`}
                >
                  {m.role === "user" ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1">
                    {m.role === "user" ? "You" : "Mathionix"}
                  </p>
                  <div className="text-sm text-[var(--text-main)] whitespace-pre-wrap leading-relaxed">
                    {m.content}
                  </div>
                  {m.toolsUsed && m.toolsUsed.length > 0 && (
                    <p className="mt-2 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                      Data sources: {m.toolsUsed.join(", ")}
                    </p>
                  )}
                </div>
              </li>
            ))}
            {loading && (
              <li className="py-4 flex gap-3 items-center text-sm text-[var(--text-muted)]">
                <Loader2 size={18} className="animate-spin text-violet-600" />
                Querying platform data…
              </li>
            )}
          </ul>
        )}
      </div>

      {error && messages.length > 0 && (
        <p className="mt-2 text-xs text-rose-600 shrink-0">{error}</p>
      )}

      <form onSubmit={handleSubmit} className="mt-4 flex gap-2 shrink-0">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading || configured === false}
          placeholder="Ask anything about leads, deals, pipeline, or projects…"
          className="flex-1 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-4 py-3 text-sm outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400/30 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || configured === false || !input.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-violet-600 px-5 py-3 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Ask
        </button>
      </form>
    </div>
  );
}
