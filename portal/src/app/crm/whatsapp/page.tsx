"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, MessageCircle, Plus, Search, Send, Clock, FileText } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { cn } from "@/lib/utils";
import { CrmButton } from "@/components/crm/ui";
import WhatsAppTemplatePicker from "@/components/crm/inbox/WhatsAppTemplatePicker";
import WhatsAppNavTabs from "@/components/crm/whatsapp/WhatsAppNavTabs";
import {
  formatWaWindowCountdown,
  getWhatsAppCareWindow,
} from "@/lib/crm/whatsapp/care-window";

interface WhatsAppMessage {
  _id: string;
  waId: string;
  direction: "inbound" | "outbound";
  body: string;
  createdAt: string;
  status?: string;
}

interface WhatsAppContact {
  waId: string;
  lastMessageAt: string;
}

const THREAD_POLL_MS = 20000;

function formatPhone(waId: string): string {
  return `+${waId.replace(/\D/g, "")}`;
}

export default function WhatsAppChatsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [contacts, setContacts] = useState<WhatsAppContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [contactSearch, setContactSearch] = useState("");
  const [selectedWaId, setSelectedWaId] = useState<string | null>(
    searchParams.get("wa") || null,
  );
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [sending, setSending] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp/contacts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        toast.error("Failed to load conversations");
        return;
      }
      setContacts(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load conversations");
    } finally {
      setContactsLoading(false);
    }
  }, []);

  const loadThread = useCallback(async (waId: string) => {
    setThreadLoading(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/whatsapp/conversations?waId=${encodeURIComponent(waId)}&pageSize=100`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Failed to load conversation");
        return;
      }
      const list = Array.isArray(data.messages) ? data.messages : [];
      // API returns newest-first; render oldest-first like a chat thread.
      setMessages([...list].reverse());
    } catch {
      toast.error("Failed to load conversation");
    } finally {
      setThreadLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    if (!selectedWaId) {
      setMessages([]);
      return;
    }
    void loadThread(selectedWaId);
    const interval = setInterval(() => void loadThread(selectedWaId), THREAD_POLL_MS);
    return () => clearInterval(interval);
  }, [selectedWaId, loadThread]);

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectContact = (waId: string) => {
    setSelectedWaId(waId);
    router.replace(`/crm/whatsapp?wa=${encodeURIComponent(waId)}`);
  };

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => c.waId.toLowerCase().includes(q));
  }, [contacts, contactSearch]);

  const careWindow = useMemo(() => getWhatsAppCareWindow(messages, nowMs), [messages, nowMs]);
  const canSendFreeform = careWindow.status === "open" || careWindow.status === "expiring_soon";

  const sendFreeform = async () => {
    if (!selectedWaId || !composerText.trim()) return;
    setSending(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ to: selectedWaId, body: composerText.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.success) {
        toast.error(data.error || "Failed to send message");
        return;
      }
      setComposerText("");
      await loadThread(selectedWaId);
      await loadContacts();
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const startNewChat = () => {
    const phone = newChatPhone.replace(/\D/g, "");
    if (phone.length < 10) {
      toast.error("Enter a valid phone number with country code");
      return;
    }
    setSelectedWaId(phone);
    setNewChatOpen(false);
    setNewChatPhone("");
    setTemplatePickerOpen(true);
    router.replace(`/crm/whatsapp?wa=${encodeURIComponent(phone)}`);
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 animate-in fade-in duration-500 pb-10">
      <div>
        <h1 className="text-xl font-medium tracking-tight text-text-main">WhatsApp</h1>
        <p className="text-sm font-medium text-text-muted">
          Chat with contacts and manage message templates.
        </p>
      </div>

      <WhatsAppNavTabs active="chats" />

      <div className="grid min-h-[560px] grid-cols-1 overflow-hidden rounded-[var(--radius-md)] border border-border bg-white shadow-sm md:grid-cols-[300px_1fr]">
        <div className="flex min-h-0 flex-col border-b border-border md:border-b-0 md:border-r">
          <div className="flex items-center gap-2 border-b border-border p-3">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Search chats…"
                className="h-9 w-full rounded-[var(--radius-md)] border border-border bg-slate-50 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <button
              type="button"
              onClick={() => setNewChatOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
              title="New chat"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {contactsLoading ? (
              <div className="flex items-center justify-center gap-2 p-8 text-xs text-text-muted">
                <Loader2 size={14} className="animate-spin" /> Loading…
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="p-8 text-center">
                <MessageCircle className="mx-auto mb-2 text-text-muted opacity-30" size={24} />
                <p className="text-xs font-semibold text-text-main">No conversations yet</p>
                <p className="mt-1 text-xs text-text-muted">Start a new chat to get going.</p>
              </div>
            ) : (
              filteredContacts.map((c) => (
                <button
                  key={c.waId}
                  type="button"
                  onClick={() => selectContact(c.waId)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 border-b border-border/40 px-4 py-3 text-left transition",
                    selectedWaId === c.waId ? "bg-emerald-50" : "hover:bg-slate-50",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text-main">{formatPhone(c.waId)}</p>
                    <p className="text-[11px] text-text-muted">
                      {new Date(c.lastMessageAt).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col">
          {!selectedWaId ? (
            <div className="flex flex-1 items-center justify-center p-10 text-center">
              <div>
                <MessageCircle className="mx-auto mb-3 text-text-muted opacity-30" size={32} />
                <p className="text-sm font-semibold text-text-main">Select a conversation</p>
                <p className="mt-1 text-xs text-text-muted">
                  Or start a new chat with a phone number.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <p className="text-sm font-bold text-text-main">{formatPhone(selectedWaId)}</p>
                <CrmButton
                  variant="secondary"
                  onClick={() => setTemplatePickerOpen(true)}
                  className="h-8 gap-1.5 px-3 text-xs"
                >
                  <FileText size={12} /> Send template
                </CrmButton>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 p-5">
                {threadLoading && messages.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-xs text-text-muted">
                    <Loader2 size={14} className="animate-spin" /> Loading…
                  </div>
                ) : (
                  <div className="space-y-2">
                    {messages.map((m) => (
                      <div
                        key={m._id}
                        className={cn(
                          "flex",
                          m.direction === "outbound" ? "justify-end" : "justify-start",
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[70%] rounded-[var(--radius-md)] px-3 py-2 text-sm whitespace-pre-wrap shadow-sm",
                            m.direction === "outbound"
                              ? "bg-emerald-600 text-white"
                              : "bg-white text-text-main",
                          )}
                        >
                          {m.body}
                          <div
                            className={cn(
                              "mt-1 text-[10px]",
                              m.direction === "outbound" ? "text-emerald-100" : "text-text-muted",
                            )}
                          >
                            {new Date(m.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={threadEndRef} />
                  </div>
                )}
              </div>

              <div className="border-t border-border px-5 py-2">
                {careWindow.status === "open" && (
                  <p className="flex items-center gap-1.5 text-[11px] text-emerald-700">
                    <Clock size={11} /> Free-form replies open — window expires in{" "}
                    {formatWaWindowCountdown(careWindow.remainingMs)}
                  </p>
                )}
                {careWindow.status === "expiring_soon" && (
                  <p className="flex items-center gap-1.5 text-[11px] text-amber-700">
                    <Clock size={11} /> Messaging window expires in{" "}
                    {formatWaWindowCountdown(careWindow.remainingMs)}. Reply soon, or use a template.
                  </p>
                )}
                {careWindow.status === "expired" && (
                  <p className="flex items-center gap-1.5 text-[11px] text-rose-700">
                    <Clock size={11} /> 24-hour window expired. Send an approved template to continue.
                  </p>
                )}
                {careWindow.status === "no_inbound" && (
                  <p className="flex items-center gap-1.5 text-[11px] text-text-muted">
                    <Clock size={11} /> No inbound message yet — send an approved template to start.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 border-t border-border p-3">
                <input
                  value={composerText}
                  disabled={!canSendFreeform || sending}
                  onChange={(e) => setComposerText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendFreeform();
                    }
                  }}
                  placeholder={
                    canSendFreeform ? "Type a message…" : "Outside the 24h window — send a template"
                  }
                  className="h-11 flex-1 rounded-[var(--radius-md)] border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50 disabled:text-text-muted"
                />
                <CrmButton
                  variant="primary"
                  disabled={!canSendFreeform || sending || !composerText.trim()}
                  onClick={() => void sendFreeform()}
                  className="h-11 gap-2 bg-emerald-600 hover:bg-emerald-700"
                >
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Send
                </CrmButton>
              </div>
            </>
          )}
        </div>
      </div>

      {newChatOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-[var(--radius-md)] border border-border bg-white p-5 shadow-2xl">
            <h3 className="text-sm font-bold text-text-main">Start a new chat</h3>
            <p className="mt-1 text-xs text-text-muted">
              Enter the full phone number with country code. Since there&apos;s no prior message from
              this contact, you&apos;ll need to open with an approved template.
            </p>
            <input
              autoFocus
              value={newChatPhone}
              onChange={(e) => setNewChatPhone(e.target.value)}
              placeholder="+1 555 000 0000"
              className="mt-3 h-10 w-full rounded-[var(--radius-md)] border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <CrmButton variant="secondary" onClick={() => setNewChatOpen(false)} className="h-9">
                Cancel
              </CrmButton>
              <CrmButton
                variant="primary"
                onClick={startNewChat}
                className="h-9 bg-emerald-600 hover:bg-emerald-700"
              >
                Continue
              </CrmButton>
            </div>
          </div>
        </div>
      )}

      <WhatsAppTemplatePicker
        open={templatePickerOpen}
        to={selectedWaId || ""}
        onClose={() => setTemplatePickerOpen(false)}
        onSent={() => {
          if (selectedWaId) void loadThread(selectedWaId);
          void loadContacts();
        }}
      />
    </div>
  );
}
