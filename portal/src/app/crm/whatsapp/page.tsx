"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Check,
  CheckCheck,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  MessageCircle,
  Paperclip,
  Phone,
  Plus,
  Search,
  Send,
  Share2,
  Smile,
  User,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { isAdmin as isHrmsAdmin } from "@/lib/suite/auth";
import { CRM_API_URL } from "@/lib/crm/config";
import { cn } from "@/lib/utils";
import { CrmButton } from "@/components/crm/ui";
import WhatsAppTemplatePicker from "@/components/crm/inbox/WhatsAppTemplatePicker";
import WhatsAppNavTabs from "@/components/crm/whatsapp/WhatsAppNavTabs";
import LinkLeadModal from "@/components/crm/whatsapp/LinkLeadModal";
import CallLeadModal from "@/components/crm/records/detail/CallLeadModal";
import AddPropertyModal from "@/components/crm/records/detail/AddPropertyModal";
import SharePropertyModal from "@/components/crm/whatsapp/SharePropertyModal";
import SharedMediaPanel from "@/components/crm/whatsapp/SharedMediaPanel";
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
  attachment?: {
    type: "image" | "document" | "video" | "audio";
    url: string;
    filename?: string;
  };
}

interface WhatsAppContact {
  waId: string;
  lastMessageAt: string;
  unreadCount?: number;
  leadName?: string;
  leadId?: string;
}

const THREAD_POLL_MS = 20000;

// WhatsApp's own palette — dark header teal, mint outgoing bubble, chat
// wallpaper tan, and the light-blue "read" tick color.
const WA_HEADER = "#008069";
const WA_ACCENT = "#00a884";
const WA_OUTGOING_BUBBLE = "#d9fdd3";
const WA_WALLPAPER = "#efeae2";
const WA_READ_TICK = "#53bdeb";

const AVATAR_PALETTE = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-sky-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-fuchsia-500",
];

function avatarColor(waId: string): string {
  let hash = 0;
  for (let i = 0; i < waId.length; i++) hash = (hash * 31 + waId.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

/** Subtle tiled doodle wallpaper, in the spirit of WhatsApp's chat background. */
const WA_WALLPAPER_PATTERN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cg fill='none' stroke='%23c4b8a0' stroke-width='1.2' opacity='0.35'%3E%3Ccircle cx='12' cy='14' r='5'/%3E%3Cpath d='M40 10c4 4 4 10 0 14-4-4-4-10 0-14z'/%3E%3Cpath d='M70 20l6 6-6 6-6-6z'/%3E%3Ccircle cx='85' cy='55' r='4'/%3E%3Cpath d='M20 60c4 4 4 10 0 14-4-4-4-10 0-14z'/%3E%3Cpath d='M55 70l6 6-6 6-6-6z'/%3E%3Ccircle cx='45' cy='90' r='4'/%3E%3C/g%3E%3C/svg%3E\")";

function formatPhone(waId: string): string {
  return `+${waId.replace(/\D/g, "")}`;
}

function StatusTicks({ status }: { status?: string }) {
  if (status === "failed") return null;
  if (status === "read") return <CheckCheck size={14} style={{ color: WA_READ_TICK }} />;
  if (status === "delivered") return <CheckCheck size={14} className="text-slate-400" />;
  return <Check size={14} className="text-slate-400" />;
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
  const [linkedLead, setLinkedLead] = useState<{
    leadId?: string;
    leadName?: string;
    assignee?: string;
    temporaryGrants?: Array<{
      userId: string;
      accessType: "read" | "read_write";
      expiresAt: string;
    }>;
  } | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [grantAccessModalOpen, setGrantAccessModalOpen] = useState(false);
  const [linkLeadModalOpen, setLinkLeadModalOpen] = useState(false);
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [addPropertyModalOpen, setAddPropertyModalOpen] = useState(false);
  const [sharePropertyModalOpen, setSharePropertyModalOpen] = useState(false);
  const [sharedMediaOpen, setSharedMediaOpen] = useState(false);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const isAdminUser = useMemo(() => {
    if (!currentUser) return false;
    if (isHrmsAdmin(currentUser)) return true;
    const roleKey = String(currentUser.role || "").trim().toUpperCase();
    if (["ADMIN", "SUPERADMIN", "CEO", "CTO", "OWNER"].includes(roleKey)) return true;
    const perms = Array.isArray(currentUser.crmPermissions) ? currentUser.crmPermissions : [];
    if (perms.includes("admin:manage") || perms.includes("leads:read:all") || perms.includes("contacts:read:all")) return true;
    return false;
  }, [currentUser]);

  const isReadOnly = useMemo(() => {
    if (!currentUser || isAdminUser) return false;
    
    // If not linked to a lead and has no assignee, it's a direct enquiry (not restricted)
    if (!linkedLead?.leadId && !linkedLead?.assignee) {
      return false;
    }

    const userId = currentUser._id || currentUser.userId;
    if (!userId) return false;

    // If there is an active temporary grant for this user, check its type
    if (linkedLead.temporaryGrants) {
      const activeGrant = linkedLead.temporaryGrants.find(
        (g) =>
          String(g.userId) === String(userId) &&
          new Date(g.expiresAt) > new Date()
      );
      if (activeGrant) {
        return activeGrant.accessType === "read";
      }
    }

    return false;
  }, [currentUser, isAdminUser, linkedLead]);

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
      // Refresh contact list to clear unread badge locally
      void loadContacts();
    } catch {
      toast.error("Failed to load conversation");
    } finally {
      setThreadLoading(false);
    }
  }, [loadContacts]);

  useEffect(() => {
    const fetchProfile = async () => {
      const token = localStorage.getItem("token");
      try {
        const res = await fetch(`${CRM_API_URL}/crm-users/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setCurrentUser(data);
        }
      } catch (err) {}
    };
    void fetchProfile();
  }, []);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    if (!selectedWaId) {
      setLinkedLead(null);
      return;
    }
    let cancelled = false;
    const token = localStorage.getItem("token");
    fetch(`${CRM_API_URL}/crm/whatsapp-links/by-wa/${encodeURIComponent(selectedWaId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled) return;
        setLinkedLead(body ? {
          leadId: body.leadId,
          leadName: body.leadName,
          assignee: body.assignee,
          temporaryGrants: body.temporaryGrants,
        } : null);
      })
      .catch(() => {
        if (!cancelled) setLinkedLead(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedWaId]);

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

  // Bi-directional live sync: RealtimeManager forwards the backend's
  // `whatsapp:message` socket event (emitted on every inbound webhook
  // message and outbound send — see WhatsAppService.emitWhatsAppEvent) as
  // this browser CustomEvent. Append instantly if it's the open thread,
  // and always refresh the contact list so previews/ordering stay current.
  // The THREAD_POLL_MS interval above stays on as a fallback in case the
  // socket is ever unavailable (blocked by a proxy, brief disconnect, etc).
  useEffect(() => {
    const listener = (event: Event) => {
      const custom = event as CustomEvent<{ event?: string; payload?: { waId?: string; message?: WhatsAppMessage } }>;
      if (custom.detail?.event !== "whatsapp:message") return;
      const { waId, message } = custom.detail.payload || {};
      if (!waId || !message) return;

      void loadContacts();

      if (selectedWaId && waId.replace(/\D/g, "") === selectedWaId.replace(/\D/g, "")) {
        setMessages((prev) =>
          prev.some((m) => m._id === message._id) ? prev : [...prev, message],
        );
      }
    };
    window.addEventListener("crm:realtime-event", listener as EventListener);
    return () => window.removeEventListener("crm:realtime-event", listener as EventListener);
  }, [selectedWaId, loadContacts]);

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

      <div className="grid min-h-[620px] grid-cols-1 overflow-hidden rounded-[var(--radius-md)] border border-[#d1d7db] shadow-sm md:grid-cols-[320px_1fr]">
        {/* Chat list pane — WhatsApp Web's light-gray sidebar */}
        <div className="flex min-h-0 flex-col border-b border-[#d1d7db] bg-white md:border-b-0 md:border-r">
          <div className="flex items-center justify-between gap-2 bg-[#f0f2f5] px-4 py-3">
            <span className="text-base font-semibold text-[#111b21]">Chats</span>
          </div>

          <div className="bg-white px-3 py-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#54656f]" />
              <input
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Search or start a new chat"
                className="h-9 w-full rounded-lg border-none bg-[#f0f2f5] pl-9 pr-3 text-sm text-[#111b21] outline-none placeholder:text-[#667781]"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-white">
            {contactsLoading ? (
              <div className="flex items-center justify-center gap-2 p-8 text-xs text-[#667781]">
                <Loader2 size={14} className="animate-spin" /> Loading…
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="p-8 text-center">
                <MessageCircle className="mx-auto mb-2 text-[#667781] opacity-40" size={24} />
                <p className="text-xs font-semibold text-[#111b21]">No conversations yet</p>
                <p className="mt-1 text-xs text-[#667781]">Start a new chat to get going.</p>
              </div>
            ) : (
              filteredContacts.map((c) => (
                <button
                  key={c.waId}
                  type="button"
                  onClick={() => selectContact(c.waId)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-3 text-left transition",
                    selectedWaId === c.waId ? "bg-[#f0f2f5]" : "hover:bg-[#f5f6f6]",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white",
                      avatarColor(c.waId),
                    )}
                  >
                    <User size={18} />
                  </div>
                  <div className="min-w-0 flex-1 border-b border-[#e9edef] pb-3 pt-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={cn(
                        "truncate text-sm text-[#111b21]",
                        c.unreadCount && c.unreadCount > 0 ? "font-bold" : "font-medium"
                      )}>
                        {c.leadName || formatPhone(c.waId)}
                      </p>
                      <span className={cn(
                        "shrink-0 text-[11px]",
                        c.unreadCount && c.unreadCount > 0 ? "font-bold text-emerald-600" : "text-[#667781]"
                      )}>
                        {new Date(c.lastMessageAt).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <p className="truncate text-xs text-[#667781]">
                        {new Date(c.lastMessageAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      {c.unreadCount && c.unreadCount > 0 ? (
                        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white shadow-sm">
                          {c.unreadCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Conversation pane */}
        <div className="flex min-h-0 flex-col" style={{ backgroundColor: WA_WALLPAPER }}>
          {!selectedWaId ? (
            <div className="flex flex-1 items-center justify-center bg-[#f8f9fa] p-10 text-center">
              <div>
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm">
                  <MessageCircle style={{ color: WA_ACCENT }} size={30} />
                </div>
                <p className="text-sm font-semibold text-[#41525d]">Select a conversation</p>
                <p className="mt-1 text-xs text-[#667781]">
                  Or start a new chat with a phone number.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-white"
                style={{ backgroundColor: WA_HEADER }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white",
                      avatarColor(selectedWaId),
                    )}
                  >
                    <User size={16} />
                  </div>
                  <div>
                    {linkedLead?.leadId ? (
                      <>
                        <p className="text-sm font-semibold">{linkedLead.leadName || formatPhone(selectedWaId)}</p>
                        <div className="flex items-center gap-2 text-[11px] text-white/75">
                          <span>{formatPhone(selectedWaId)}</span>
                          <span>•</span>
                          <Link
                            href={`/crm/leads/${linkedLead.leadId}`}
                            className="flex items-center gap-0.5 text-white/90 hover:text-white hover:underline"
                          >
                            <Link2 size={10} /> View Lead
                          </Link>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold">{formatPhone(selectedWaId)}</p>
                        <button
                          type="button"
                          onClick={() => setLinkLeadModalOpen(true)}
                          className="flex items-center gap-1 text-[11px] text-white/70 hover:text-white hover:underline"
                        >
                          <Link2 size={10} /> Link to lead
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CrmButton
                    variant="secondary"
                    disabled={isReadOnly}
                    onClick={() => setSharePropertyModalOpen(true)}
                    className="h-8 gap-1.5 border-none bg-white/15 px-3 text-xs text-white hover:bg-white/25 disabled:opacity-45"
                    title="Share property"
                  >
                    <Share2 size={14} /> Share property
                  </CrmButton>
                  <CrmButton
                    variant="secondary"
                    disabled={isReadOnly}
                    onClick={() => setAddPropertyModalOpen(true)}
                    className="h-8 gap-1.5 border-none bg-white/15 px-3 text-xs text-white hover:bg-white/25 disabled:opacity-45"
                    title="Add property"
                  >
                    <Building2 size={14} /> Add property
                  </CrmButton>
                  <CrmButton
                    variant="secondary"
                    onClick={() => setCallModalOpen(true)}
                    className="h-8 gap-1.5 border-none bg-white/15 px-3 text-xs text-white hover:bg-white/25"
                    title="Call via IVR"
                  >
                    <Phone size={14} /> Call
                  </CrmButton>
                  {isAdminUser && (
                    <CrmButton
                      variant="secondary"
                      onClick={() => setGrantAccessModalOpen(true)}
                      className="h-8 gap-1.5 border-none bg-white/15 px-3 text-xs text-white hover:bg-white/25"
                      title="Grant temporary access to another agent"
                    >
                      <UserPlus size={14} /> Grant Access
                    </CrmButton>
                  )}
                  <CrmButton
                    variant="secondary"
                    disabled={isReadOnly}
                    onClick={() => setTemplatePickerOpen(true)}
                    className="h-8 gap-1.5 border-none bg-white/15 px-3 text-xs text-white hover:bg-white/25 disabled:opacity-45"
                  >
                    Send template
                  </CrmButton>
                  <button
                    type="button"
                    onClick={() => setSharedMediaOpen(true)}
                    title="Shared media"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
                  >
                    <ImageIcon size={14} />
                  </button>
                </div>
              </div>

              <div
                className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-10"
                style={{
                  backgroundColor: WA_WALLPAPER,
                  backgroundImage: WA_WALLPAPER_PATTERN,
                }}
              >
                {threadLoading && messages.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-xs text-[#667781]">
                    <Loader2 size={14} className="animate-spin" /> Loading…
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {messages.map((m) => {
                      const attachmentUrl = m.attachment?.url
                        ? m.attachment.url.startsWith("http")
                          ? m.attachment.url
                          : `${CRM_API_URL}${m.attachment.url}`
                        : "";
                      return (
                        <div
                          key={m._id}
                          className={cn(
                            "flex",
                            m.direction === "outbound" ? "justify-end" : "justify-start",
                          )}
                        >
                          <div
                            className={cn(
                              "relative max-w-[75%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]",
                              m.direction === "outbound"
                                ? "rounded-tr-none text-[#111b21]"
                                : "rounded-tl-none bg-white text-[#111b21]",
                            )}
                            style={
                              m.direction === "outbound"
                                ? { backgroundColor: WA_OUTGOING_BUBBLE }
                                : undefined
                            }
                          >
                            {m.attachment && (
                              <div className="mb-2 max-w-sm">
                                {m.attachment.type === "image" && (
                                  <div className="overflow-hidden rounded-md">
                                    <img
                                      src={attachmentUrl}
                                      alt={m.attachment.filename || "Image"}
                                      className="max-h-60 w-full object-cover cursor-pointer hover:opacity-95 transition"
                                      onClick={() => window.open(attachmentUrl, "_blank")}
                                    />
                                  </div>
                                )}
                                {m.attachment.type === "video" && (
                                  <div className="overflow-hidden rounded-md bg-black">
                                    <video src={attachmentUrl} controls className="max-h-60 w-full" />
                                  </div>
                                )}
                                {m.attachment.type === "audio" && (
                                  <div className="p-1">
                                    <audio src={attachmentUrl} controls className="max-w-full" />
                                  </div>
                                )}
                                {m.attachment.type === "document" && (
                                  <div className="flex items-center gap-2 rounded-md bg-black/5 p-2 text-xs">
                                    <FileText size={18} className="text-slate-500 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate font-semibold text-[#111b21]">
                                        {m.attachment.filename || "Document"}
                                      </p>
                                      <a
                                        href={attachmentUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[10px] text-sky-600 hover:underline"
                                      >
                                        Download
                                      </a>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            {m.body && <div>{m.body}</div>}
                            <span className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-[#667781]">
                              {new Date(m.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {m.direction === "outbound" && <StatusTicks status={m.status} />}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={threadEndRef} />
                  </div>
                )}
              </div>

              <div className="bg-[#f0f2f5] px-4 py-1.5">
                {careWindow.status === "open" && (
                  <p className="text-[11px] font-medium text-[#008069]">
                    Free-form replies open — window expires in{" "}
                    {formatWaWindowCountdown(careWindow.remainingMs)}
                  </p>
                )}
                {careWindow.status === "expiring_soon" && (
                  <p className="text-[11px] font-medium text-amber-700">
                    Messaging window expires in {formatWaWindowCountdown(careWindow.remainingMs)}.
                    Reply soon, or use a template.
                  </p>
                )}
                {careWindow.status === "expired" && (
                  <p className="text-[11px] font-medium text-rose-700">
                    24-hour window expired. Send an approved template to continue.
                  </p>
                )}
                {careWindow.status === "no_inbound" && (
                  <p className="text-[11px] font-medium text-[#667781]">
                    No inbound message yet — send an approved template to start.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 bg-[#f0f2f5] px-3 py-2.5">
                <Smile size={22} className="shrink-0 text-[#54656f]" />
                <Paperclip size={20} className="shrink-0 text-[#54656f]" />
                <input
                  value={composerText}
                  disabled={!canSendFreeform || sending || isReadOnly}
                  onChange={(e) => setComposerText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendFreeform();
                    }
                  }}
                  placeholder={
                    isReadOnly
                      ? "This chat is read-only (temporary access)"
                      : canSendFreeform
                      ? "Type a message"
                      : "Outside the 24h window — send a template"
                  }
                  className="h-10 flex-1 rounded-lg border-none bg-white px-4 text-sm text-[#111b21] outline-none placeholder:text-[#667781] disabled:bg-[#f0f2f5]/60 disabled:text-[#98a3a8]"
                />
                <button
                  type="button"
                  disabled={!canSendFreeform || sending || !composerText.trim() || isReadOnly}
                  onClick={() => void sendFreeform()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ backgroundColor: WA_ACCENT }}
                >
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
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

      {selectedWaId && (
        <LinkLeadModal
          open={linkLeadModalOpen}
          onClose={() => setLinkLeadModalOpen(false)}
          waId={selectedWaId}
          onSuccess={(lead) => setLinkedLead(lead)}
        />
      )}

      {selectedWaId && (
        <CallLeadModal
          open={callModalOpen}
          onClose={() => setCallModalOpen(false)}
          phone={formatPhone(selectedWaId)}
          leadId={linkedLead?.leadId}
          leadName={linkedLead?.leadName}
          relatedType="Lead"
        />
      )}

      {selectedWaId && (
        <AddPropertyModal
          open={addPropertyModalOpen}
          onClose={() => setAddPropertyModalOpen(false)}
          leadId={linkedLead?.leadId}
          leadName={linkedLead?.leadName}
        />
      )}

      {selectedWaId && (
        <SharePropertyModal
          open={sharePropertyModalOpen}
          onClose={() => setSharePropertyModalOpen(false)}
          waId={selectedWaId}
          leadId={linkedLead?.leadId}
          leadName={linkedLead?.leadName}
          onSuccess={() => {
            if (selectedWaId) void loadThread(selectedWaId);
          }}
        />
      )}

      {selectedWaId && (
        <SharedMediaPanel
          open={sharedMediaOpen}
          onClose={() => setSharedMediaOpen(false)}
          waId={selectedWaId}
        />
      )}

      {selectedWaId && (
        <GrantAccessModal
          isOpen={grantAccessModalOpen}
          onClose={() => setGrantAccessModalOpen(false)}
          waId={selectedWaId}
          onSuccess={() => {
            if (selectedWaId) {
              const token = localStorage.getItem("token");
              fetch(`${CRM_API_URL}/crm/whatsapp-links/by-wa/${encodeURIComponent(selectedWaId)}`, {
                headers: { Authorization: `Bearer ${token}` },
              })
                .then((res) => (res.ok ? res.json() : null))
                .then((body) => {
                  setLinkedLead(body ? {
                    leadId: body.leadId,
                    leadName: body.leadName,
                    assignee: body.assignee,
                    temporaryGrants: body.temporaryGrants,
                  } : null);
                });
            }
          }}
        />
      )}
    </div>
  );
}

interface GrantAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  waId: string;
  onSuccess: () => void;
}

function GrantAccessModal({ isOpen, onClose, waId, onSuccess }: GrantAccessModalProps) {
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [accessType, setAccessType] = useState<"read" | "read_write">("read");
  const [duration, setDuration] = useState("60"); // 1 hour default
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const fetchUsers = async () => {
      const token = localStorage.getItem("token");
      try {
        const res = await fetch(`${CRM_API_URL}/crm-users/list/crm-portal`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json().catch(() => []);
          setUsers(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error(err);
      }
    };
    void fetchUsers();
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      toast.error("Please select a user");
      return;
    }
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp/grant-temporary-access`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          waId,
          targetUserId: selectedUserId,
          accessType,
          durationMinutes: parseInt(duration, 10),
        }),
      });
      if (res.ok) {
        toast.success("Temporary access granted successfully");
        onSuccess();
        onClose();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || "Failed to grant access");
      }
    } catch {
      toast.error("Failed to grant access");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-[var(--radius-md)] border border-border bg-white p-5 shadow-2xl">
        <h3 className="text-sm font-bold text-text-main">Grant Temporary Access</h3>
        <p className="mt-1 text-xs text-text-muted">
          Grant temporary access to this chat thread for another agent.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-main mb-1">Select Agent</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-xs outline-none focus:border-primary text-text-main"
            >
              <option value="">-- Choose Agent --</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.firstName || ""} {u.lastName || ""} ({u.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-main mb-1">Access Type</label>
            <select
              value={accessType}
              onChange={(e) => setAccessType(e.target.value as any)}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-xs outline-none focus:border-primary text-text-main"
            >
              <option value="read">Read Only</option>
              <option value="read_write">Read and Send</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-main mb-1">Duration</label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-xs outline-none focus:border-primary text-text-main"
            >
              <option value="60">1 Hour</option>
              <option value="240">4 Hours</option>
              <option value="1440">24 Hours</option>
              <option value="10080">7 Days</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <CrmButton type="button" variant="secondary" onClick={onClose} disabled={loading}>
              Cancel
            </CrmButton>
            <CrmButton type="submit" disabled={loading}>
              {loading ? "Granting..." : "Grant Access"}
            </CrmButton>
          </div>
        </form>
      </div>
    </div>
  );
}
