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
  Maximize2,
  X,
  Download,
  Lock,
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
  lastMessageText?: string;
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
  const [contactsPage, setContactsPage] = useState(1);
  const [hasMoreContacts, setHasMoreContacts] = useState(true);
  const [fetchingMoreContacts, setFetchingMoreContacts] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [selectedWaId, setSelectedWaId] = useState<string | null>(
    searchParams.get("wa") || null,
  );
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [isForbidden, setIsForbidden] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [messagesPage, setMessagesPage] = useState(1);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [fetchingMoreMessages, setFetchingMoreMessages] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [sending, setSending] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const threadScrollRef = useRef<HTMLDivElement | null>(null);
  const hasLoadedContactsRef = useRef(false);
  const loadedWaIdRef = useRef<string | null>(null);
  const [linkedLead, setLinkedLead] = useState<{
    leadId?: string;
    leadName?: string;
    assignee?: { _id: string; name: string; email?: string; accessType?: "read" | "read_write" };
    temporaryGrants?: Array<{
      userId: string;
      userName?: string;
      userEmail?: string;
      accessType: "read" | "read_write";
      expiresAt: string;
    }>;
  } | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [filterAssigneeId, setFilterAssigneeId] = useState("");
  const [filterUsers, setFilterUsers] = useState<any[]>([]);
  const [grantAccessModalOpen, setGrantAccessModalOpen] = useState(false);
  const [linkLeadModalOpen, setLinkLeadModalOpen] = useState(false);
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [addPropertyModalOpen, setAddPropertyModalOpen] = useState(false);
  const [sharePropertyModalOpen, setSharePropertyModalOpen] = useState(false);
  const [sharedMediaOpen, setSharedMediaOpen] = useState(false);
  const [activeMediaPreview, setActiveMediaPreview] = useState<{
    url: string;
    type: "image" | "video" | "audio";
    filename?: string;
  } | null>(null);

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
    const userEmail = String(currentUser.email || '').trim().toLowerCase();
    if (!userId && !userEmail) return false;

    // 1. If there is an active temporary grant for this user, check its type
    if (linkedLead.temporaryGrants) {
      const activeGrant = linkedLead.temporaryGrants.find(
        (g: any) =>
          (String(g.userId) === String(userId) || (g.userEmail && String(g.userEmail).toLowerCase() === userEmail)) &&
          new Date(g.expiresAt) > new Date()
      );
      if (activeGrant) {
        return activeGrant.accessType === "read";
      }
    }

    // 2. If assigned to current user, check permanent assignee accessType
    if (linkedLead.assignee) {
      const assigneeEmail = String(linkedLead.assignee.email || '').trim().toLowerCase();
      const assigneeId = String(linkedLead.assignee._id || linkedLead.assignee);
      if (assigneeId === String(userId) || (assigneeEmail && assigneeEmail === userEmail)) {
        return linkedLead.assignee.accessType === "read";
      }
      // If assigned to someone else and no active temporary grant exists for this user, make it read-only
      return true;
    }

    return false;
  }, [currentUser, isAdminUser, linkedLead]);

  const currentAgentActiveGrant = useMemo(() => {
    if (!currentUser || !linkedLead?.temporaryGrants) return null;
    const userId = currentUser._id || currentUser.userId;
    const userEmail = String(currentUser.email || '').trim().toLowerCase();
    return (
      linkedLead.temporaryGrants.find(
        (g: any) =>
          (String(g.userId) === String(userId) ||
            (g.userEmail && String(g.userEmail).toLowerCase() === userEmail)) &&
          new Date(g.expiresAt) > new Date()
      ) || null
    );
  }, [currentUser, linkedLead]);

  const loadContacts = useCallback(async (page = 1, assigneeFilter = filterAssigneeId) => {
    if (page === 1) {
      if (!hasLoadedContactsRef.current) {
        setContactsLoading(true);
      }
    } else {
      setFetchingMoreContacts(true);
    }
    const token = localStorage.getItem("token");
    try {
      let url = `${CRM_API_URL}/crm/whatsapp/contacts?page=${page}&pageSize=20`;
      if (assigneeFilter) {
        url += `&assigneeId=${encodeURIComponent(assigneeFilter)}`;
      }
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Failed to load conversations");
        return;
      }
      const list = Array.isArray(data) ? data : (data.contacts || []);
      const total = typeof data === "object" && "total" in data ? data.total : list.length;

      setContacts((prev) => {
        hasLoadedContactsRef.current = true;
        if (page === 1) {
          setHasMoreContacts(list.length < total);
          setContactsPage(1);
          if (prev.length <= 20) {
            return list;
          } else {
            const updatedIds = new Set(list.map((c: any) => c.waId));
            const remaining = prev.filter((c: any) => !updatedIds.has(c.waId));
            return [...list, ...remaining];
          }
        } else {
          const existing = new Set(prev.map((c) => c.waId));
          const filtered = list.filter((c: any) => !existing.has(c.waId));
          const nextList = [...prev, ...filtered];
          setHasMoreContacts(nextList.length < total);
          setContactsPage(page);
          return nextList;
        }
      });
    } catch {
      toast.error("Failed to load conversations");
    } finally {
      setContactsLoading(false);
      setFetchingMoreContacts(false);
    }
  }, [filterAssigneeId]);

  const loadThread = useCallback(async (waId: string, page = 1) => {
    if (page === 1) {
      if (loadedWaIdRef.current !== waId) {
        setThreadLoading(true);
      }
    } else {
      setFetchingMoreMessages(true);
    }
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/whatsapp/conversations?waId=${encodeURIComponent(waId)}&page=${page}&pageSize=30`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        if (res.status === 403) {
          setIsForbidden(true);
        } else {
          toast.error("Failed to load conversation");
        }
        return;
      }
      setIsForbidden(false);
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data.messages) ? data.messages : [];
      const total = data.total || 0;
      const reversed = [...list].reverse();

      setMessages((prev) => {
        loadedWaIdRef.current = waId;
        if (page === 1) {
          setHasMoreMessages(list.length < total);
          setMessagesPage(1);
          // Refresh contact list to clear unread badge locally
          void loadContacts(1);
          return reversed;
        } else {
          const existing = new Set(prev.map((m) => m._id));
          const filtered = reversed.filter((m) => !existing.has(m._id));
          const nextList = [...filtered, ...prev];
          setHasMoreMessages(nextList.length < total);
          setMessagesPage(page);
          return nextList;
        }
      });
    } catch {
      toast.error("Failed to load conversation");
    } finally {
      setThreadLoading(false);
      setFetchingMoreMessages(false);
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
    void loadContacts(1, filterAssigneeId);
  }, [loadContacts, filterAssigneeId]);

  useEffect(() => {
    if (!isAdminUser) return;
    const fetchFilterUsers = async () => {
      const token = localStorage.getItem("token");
      try {
        const res = await fetch(`${CRM_API_URL}/crm-users/list/crm-portal`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json().catch(() => []);
          setFilterUsers(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error(err);
      }
    };
    void fetchFilterUsers();
  }, [isAdminUser]);

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
      setIsForbidden(false);
      return;
    }
    setIsForbidden(false);
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

      void loadContacts(1);

      if (selectedWaId && waId.replace(/\D/g, "") === selectedWaId.replace(/\D/g, "")) {
        setMessages((prev) =>
          prev.some((m) => m._id === message._id) ? prev : [...prev, message],
        );
        // Scroll to bottom on incoming message
        setTimeout(() => {
          if (threadScrollRef.current) {
            threadScrollRef.current.scrollTop = threadScrollRef.current.scrollHeight;
          }
        }, 50);
      }
    };
    window.addEventListener("crm:realtime-event", listener as EventListener);
    return () => window.removeEventListener("crm:realtime-event", listener as EventListener);
  }, [selectedWaId, loadContacts]);

  useEffect(() => {
    if (messagesPage === 1 && threadScrollRef.current) {
      threadScrollRef.current.scrollTop = threadScrollRef.current.scrollHeight;
    }
  }, [messages, messagesPage]);

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
      await loadThread(selectedWaId, 1);
      await loadContacts(1);
      setTimeout(() => {
        if (threadScrollRef.current) {
          threadScrollRef.current.scrollTop = threadScrollRef.current.scrollHeight;
        }
      }, 50);
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleSidebarScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 50) {
      if (hasMoreContacts && !contactsLoading && !fetchingMoreContacts && !contactSearch.trim()) {
        void loadContacts(contactsPage + 1);
      }
    }
  };

  const handleThreadScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollTop <= 10) {
      if (hasMoreMessages && !threadLoading && !fetchingMoreMessages && selectedWaId) {
        const prevScrollHeight = target.scrollHeight;
        void loadThread(selectedWaId, messagesPage + 1).then(() => {
          setTimeout(() => {
            if (target) {
              const diff = target.scrollHeight - prevScrollHeight;
              target.scrollTop = diff;
            }
          }, 50);
        });
      }
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
    <div className="w-full space-y-4 animate-in fade-in duration-500 h-[calc(100vh-140px)] flex flex-col pb-2">
      <div className="shrink-0">
        <h1 className="text-xl font-semibold tracking-tight text-text-main">WhatsApp</h1>
        <p className="text-sm font-medium text-text-muted">
          Chat with contacts and manage message templates.
        </p>
      </div>

      <div className="shrink-0">
        <WhatsAppNavTabs active="chats" />
      </div>

      <div className="grid flex-1 min-h-[400px] grid-cols-1 overflow-hidden rounded-[var(--radius-md)] border border-[#d1d7db] shadow-md md:grid-cols-[340px_1fr] bg-white">
        {/* Chat list pane — WhatsApp Web's light-gray sidebar */}
        <div className="flex min-h-0 flex-col border-b border-[#d1d7db] bg-white md:border-b-0 md:border-r">
          <div className="flex items-center justify-between gap-2 bg-[#f0f2f5] px-4 py-3">
            <span className="text-base font-semibold text-[#111b21]">Chats</span>
          </div>

          <div className="bg-white px-3 pb-2 pt-2 space-y-2 border-b border-[#e9edef]">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#54656f]" />
              <input
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Search or start a new chat"
                className="h-9 w-full rounded-lg border-none bg-[#f0f2f5] pl-9 pr-3 text-sm text-[#111b21] outline-none placeholder:text-[#667781]"
              />
            </div>
            {isAdminUser && (
              <div className="flex items-center gap-2 bg-[#f0f2f5] px-2.5 py-1.5 rounded-lg border border-[#e9edef]">
                <span className="text-[11px] font-semibold text-[#54656f] shrink-0">Filter Agent:</span>
                <select
                  value={filterAssigneeId}
                  onChange={(e) => setFilterAssigneeId(e.target.value)}
                  className="h-7 flex-1 rounded border-none bg-white px-2 text-xs text-[#111b21] outline-none cursor-pointer focus:ring-1 focus:ring-emerald-500 font-medium"
                >
                  <option value="">All Assigned Chats</option>
                  {filterUsers.map((u) => (
                    <option key={u._id} value={u._id}>
                      {`${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div
            onScroll={handleSidebarScroll}
            className="min-h-0 flex-1 overflow-y-auto bg-white custom-scrollbar"
          >
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
              <>
                {filteredContacts.map((c) => (
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
                          {(() => {
                            const d = new Date(c.lastMessageAt);
                            const today = new Date();
                            if (d.toDateString() === today.toDateString()) {
                              return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                            }
                            return d.toLocaleDateString([], { month: "short", day: "numeric" });
                          })()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className={cn(
                          "truncate text-xs flex-1 pr-2",
                          c.unreadCount && c.unreadCount > 0 ? "font-semibold text-[#111b21]" : "text-[#667781]"
                        )}>
                          {c.lastMessageText || "No messages"}
                        </p>
                        {c.unreadCount && c.unreadCount > 0 ? (
                          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white shadow-sm shrink-0">
                            {c.unreadCount}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                ))}
                {fetchingMoreContacts && (
                  <div className="flex items-center justify-center gap-2 py-3 text-xs text-[#667781] border-t border-[#e9edef]">
                    <Loader2 size={12} className="animate-spin" /> Loading more…
                  </div>
                )}
              </>
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
                  {currentAgentActiveGrant && (
                    <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2.5 py-1 text-[10px] font-semibold text-amber-200 border border-amber-300/30">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                      Temporary Access ({currentAgentActiveGrant.accessType === "read_write" ? "Read & Send" : "Read Only"})
                    </span>
                  )}
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
                    onClick={() => {
                      const leadIdVal = linkedLead?.leadId || "";
                      const name = linkedLead?.leadName || "";
                      const phone = selectedWaId || "";
                      const params = new URLSearchParams();
                      if (leadIdVal) params.set("leadId", leadIdVal);
                      if (name) params.set("ownerName", name);
                      if (phone) params.set("ownerPhone", phone);
                      router.push(`/crm/property-listings/new?${params.toString()}`);
                    }}
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
                ref={threadScrollRef}
                onScroll={handleThreadScroll}
                className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-10 custom-scrollbar"
                style={{
                  backgroundColor: WA_WALLPAPER,
                  backgroundImage: WA_WALLPAPER_PATTERN,
                }}
              >
                {isForbidden ? (
                  <div className="flex h-full flex-col items-center justify-center text-center p-6 bg-slate-50/20 backdrop-blur-[2px] rounded-lg">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-500 mb-4 shadow-sm animate-pulse">
                      <Lock size={28} />
                    </div>
                    <h3 className="text-base font-bold text-slate-800">Access Denied</h3>
                    <p className="mt-1.5 text-xs text-[#667781] max-w-[280px] leading-relaxed">
                      You do not have permission to access or view this WhatsApp conversation.
                    </p>
                  </div>
                ) : (
                  <>
                    {fetchingMoreMessages && (
                      <div className="flex items-center justify-center gap-2 py-3 text-xs text-[#667781] bg-white/20 rounded-md mb-4 backdrop-blur-sm">
                        <Loader2 size={14} className="animate-spin text-emerald-600" /> Loading older messages…
                      </div>
                    )}
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
                                          onClick={() => setActiveMediaPreview({ url: attachmentUrl, type: "image", filename: m.attachment?.filename || "Image" })}
                                        />
                                      </div>
                                    )}
                                    {m.attachment.type === "video" && (
                                      <div className="relative overflow-hidden rounded-md bg-black group">
                                        <video src={attachmentUrl} controls className="max-h-60 w-full" />
                                        <button
                                          type="button"
                                          onClick={() => setActiveMediaPreview({ url: attachmentUrl, type: "video", filename: m.attachment?.filename || "Video" })}
                                          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition shadow-sm z-10"
                                          title="Expand"
                                        >
                                          <Maximize2 size={12} />
                                        </button>
                                      </div>
                                    )}
                                    {m.attachment.type === "audio" && (
                                      <div className="relative p-1 rounded-md bg-slate-50 border border-slate-100 flex items-center gap-2 group">
                                        <audio src={attachmentUrl} controls className="max-w-full flex-1" />
                                        <button
                                          type="button"
                                          onClick={() => setActiveMediaPreview({ url: attachmentUrl, type: "audio", filename: m.attachment?.filename || "Audio" })}
                                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 transition"
                                          title="Expand"
                                        >
                                          <Maximize2 size={12} />
                                        </button>
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
                  </>
                )}
              </div>

              {!isForbidden && (
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
              )}

              <div className="flex items-center gap-2 bg-[#f0f2f5] px-3 py-2.5">
                <Smile size={22} className={cn("shrink-0 text-[#54656f]", isForbidden && "opacity-40")} />
                <Paperclip size={20} className={cn("shrink-0 text-[#54656f]", isForbidden && "opacity-40")} />
                <input
                  value={isForbidden ? "" : composerText}
                  disabled={isForbidden || !canSendFreeform || sending || isReadOnly}
                  onChange={(e) => setComposerText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendFreeform();
                    }
                  }}
                  placeholder={
                    isForbidden
                      ? "You do not have access to this conversation"
                      : isReadOnly
                      ? "This chat is read-only (temporary access)"
                      : canSendFreeform
                      ? "Type a message"
                      : "Outside the 24h window — send a template"
                  }
                  className={cn(
                    "h-10 flex-1 rounded-lg border-none bg-white px-4 text-sm outline-none disabled:bg-[#f0f2f5]/60 disabled:text-[#98a3a8]",
                    isForbidden ? "placeholder:text-rose-600 font-medium bg-rose-50/10" : "text-[#111b21] placeholder:text-[#667781]"
                  )}
                />
                <button
                  type="button"
                  disabled={isForbidden || !canSendFreeform || sending || !composerText.trim() || isReadOnly}
                  onClick={() => void sendFreeform()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ backgroundColor: isForbidden ? "#cbd5e1" : WA_ACCENT }}
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
        leadId={linkedLead?.leadId}
        leadName={linkedLead?.leadName}
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
          onPreviewMedia={setActiveMediaPreview}
        />
      )}

      {selectedWaId && (
        <GrantAccessModal
          isOpen={grantAccessModalOpen}
          onClose={() => setGrantAccessModalOpen(false)}
          waId={selectedWaId}
          currentAssignee={linkedLead?.assignee}
          temporaryGrants={linkedLead?.temporaryGrants}
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

      {activeMediaPreview && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          {/* Header toolbar */}
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between text-white z-10">
            <span className="text-sm font-semibold truncate max-w-xs sm:max-w-md">
              {activeMediaPreview.filename || "Media Preview"}
            </span>
            <div className="flex items-center gap-3">
              <a
                href={activeMediaPreview.url}
                target="_blank"
                rel="noopener noreferrer"
                download={activeMediaPreview.filename}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition"
                title="Download"
              >
                <Download size={16} />
              </a>
              <button
                type="button"
                onClick={() => setActiveMediaPreview(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Media Content */}
          <div className="relative flex flex-1 items-center justify-center w-full max-h-[80vh] p-2 mt-12">
            {activeMediaPreview.type === "image" && (
              <img
                src={activeMediaPreview.url}
                alt={activeMediaPreview.filename || "Preview"}
                className="max-w-full max-h-full object-contain rounded-md shadow-2xl animate-in zoom-in-95 duration-200"
              />
            )}
            {activeMediaPreview.type === "video" && (
              <video
                src={activeMediaPreview.url}
                controls
                autoPlay
                className="max-w-full max-h-full rounded-md shadow-2xl animate-in zoom-in-95 duration-200"
              />
            )}
            {activeMediaPreview.type === "audio" && (
              <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl flex flex-col gap-4 items-center animate-in zoom-in-95 duration-200">
                <ImageIcon size={48} className="text-slate-400" />
                <p className="text-sm font-semibold text-slate-800 truncate w-full text-center">
                  {activeMediaPreview.filename || "Audio Note"}
                </p>
                <audio
                  src={activeMediaPreview.url}
                  controls
                  autoPlay
                  className="w-full"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface GrantAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  waId: string;
  onSuccess: () => void;
  currentAssignee?: { _id: string; name: string; email?: string; accessType?: "read" | "read_write" };
  temporaryGrants?: Array<{
    userId: string;
    userName?: string;
    userEmail?: string;
    accessType: "read" | "read_write";
    expiresAt: string;
  }>;
}

function GrantAccessModal({
  isOpen,
  onClose,
  waId,
  onSuccess,
  currentAssignee,
  temporaryGrants = [],
}: GrantAccessModalProps) {
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [grantType, setGrantType] = useState<"temporary" | "permanent">("temporary");
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

  const handleUnassign = async () => {
    if (!confirm("Are you sure you want to remove the permanent assignment for this contact?")) return;
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp-links/${encodeURIComponent(waId)}/assign`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success("Assignment removed successfully");
        onSuccess();
        onClose();
      } else {
        toast.error("Failed to remove assignment");
      }
    } catch {
      toast.error("Failed to remove assignment");
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeGrant = async (targetUserId: string) => {
    if (!confirm("Are you sure you want to revoke this temporary access grant?")) return;
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp/revoke-temporary-access`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          waId,
          targetUserId,
        }),
      });
      if (res.ok) {
        toast.success("Temporary access revoked successfully");
        onSuccess();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || "Failed to revoke access");
      }
    } catch {
      toast.error("Failed to revoke access");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      toast.error("Please select a user");
      return;
    }
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      let res;
      if (grantType === "temporary") {
        res = await fetch(`${CRM_API_URL}/crm/whatsapp/grant-temporary-access`, {
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
      } else {
        res = await fetch(`${CRM_API_URL}/crm/whatsapp-links/${encodeURIComponent(waId)}/assign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            assigneeId: selectedUserId,
            accessType,
          }),
        });
      }

      if (res.ok) {
        toast.success(
          grantType === "temporary"
            ? "Temporary access granted successfully"
            : "Permanent assignment set successfully"
        );
        onSuccess();
        onClose();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || "Failed to update access");
      }
    } catch {
      toast.error("Failed to update access");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const activeGrants = (temporaryGrants || []).filter(
    (g) => new Date(g.expiresAt).getTime() > Date.now()
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-[var(--radius-md)] border border-border bg-white p-5 shadow-2xl">
        <h3 className="text-sm font-bold text-text-main">Manage Access & Assignment</h3>
        <p className="mt-1 text-xs text-text-muted">
          Configure temporary access grants or set the permanent assigned agent with permissions.
        </p>

        {currentAssignee && (
          <div className="mt-3 flex items-center justify-between rounded-md bg-slate-50 border border-slate-100 p-2.5 text-xs text-text-main">
            <div>
              <span className="font-semibold text-text-muted">Current Assignee:</span>{" "}
              <span className="font-bold text-emerald-600">{currentAssignee.name}</span>
              <span className="ml-1.5 text-[10px] font-medium text-emerald-700 bg-emerald-100/60 px-1.5 py-0.5 rounded">
                {currentAssignee.accessType === "read" ? "Read Only" : "Read & Send"}
              </span>
            </div>
            <button
              type="button"
              onClick={handleUnassign}
              disabled={loading}
              className="text-[10px] font-semibold text-rose-600 hover:text-rose-700 hover:underline disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        )}

        {activeGrants.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted">
              Active Temporary Grants ({activeGrants.length})
            </label>
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {activeGrants.map((g) => {
                const remainingMinutes = Math.max(
                  0,
                  Math.round((new Date(g.expiresAt).getTime() - Date.now()) / 60000)
                );
                const remainingText =
                  remainingMinutes > 60
                    ? `${Math.floor(remainingMinutes / 60)}h ${remainingMinutes % 60}m`
                    : `${remainingMinutes}m`;
                return (
                  <div
                    key={g.userId}
                    className="flex items-center justify-between rounded-md bg-amber-50/70 border border-amber-200/60 p-2 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-text-main">
                        {g.userName || g.userEmail || "Agent"}
                        {g.userEmail && g.userName && (
                          <span className="ml-1 text-[10px] text-text-muted font-normal">
                            ({g.userEmail})
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-amber-800 flex items-center gap-1.5 mt-0.5">
                        <span className="inline-block px-1.5 py-0.2 rounded bg-amber-100 font-medium">
                          {g.accessType === "read_write" ? "Read & Send" : "Read Only"}
                        </span>
                        <span>•</span>
                        <span>Expires in {remainingText}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevokeGrant(g.userId)}
                      disabled={loading}
                      className="text-[10px] font-semibold text-rose-600 hover:text-rose-700 hover:underline disabled:opacity-50 ml-2"
                    >
                      Revoke
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-main mb-1">Assignment Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGrantType("temporary")}
                className={cn(
                  "py-1.5 rounded-md text-xs font-semibold border text-center transition",
                  grantType === "temporary"
                    ? "bg-emerald-50 border-emerald-500 text-emerald-700 font-bold"
                    : "bg-white border-border text-text-muted hover:bg-slate-50"
                )}
              >
                Temporary Grant
              </button>
              <button
                type="button"
                onClick={() => setGrantType("permanent")}
                className={cn(
                  "py-1.5 rounded-md text-xs font-semibold border text-center transition",
                  grantType === "permanent"
                    ? "bg-emerald-50 border-emerald-500 text-emerald-700 font-bold"
                    : "bg-white border-border text-text-muted hover:bg-slate-50"
                )}
              >
                Permanent Owner
              </button>
            </div>
          </div>

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

          {grantType === "temporary" && (
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
          )}

          <div className="flex justify-end gap-2 pt-2">
            <CrmButton type="button" variant="secondary" onClick={onClose} disabled={loading}>
              Cancel
            </CrmButton>
            <CrmButton type="submit" disabled={loading}>
              {loading ? "Saving..." : grantType === "temporary" ? "Grant Access" : "Assign Owner"}
            </CrmButton>
          </div>
        </form>
      </div>
    </div>
  );
}
