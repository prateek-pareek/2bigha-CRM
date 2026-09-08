"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  CheckCheck,
  ChevronUp,
  Download,
  FileText,
  Loader2,
  Maximize2,
  MessageCircle,
  Minus,
  Phone,
  Send,
  Share2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { cn } from "@/lib/utils";
import WhatsAppTemplatePicker from "@/components/crm/inbox/WhatsAppTemplatePicker";
import CallLeadModal from "@/components/crm/records/detail/CallLeadModal";
import SharePropertyModal from "@/components/crm/whatsapp/SharePropertyModal";
import { useWhatsAppSideChatStore } from "@/portals/crm/stores/whatsappSideChatStore";

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

const WA_HEADER = "#008069";
const WA_HEADER_SUB = "#00705c";
const WA_OUTGOING_BUBBLE = "#d9fdd3";
const WA_WALLPAPER = "#efeae2";
const WA_READ_TICK = "#53bdeb";

function formatTime(isoStr?: string) {
  if (!isoStr) return "";
  try {
    return new Date(isoStr).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function StatusTicks({ status }: { status?: string }) {
  if (status === "failed") return null;
  if (status === "read") return <CheckCheck size={14} style={{ color: WA_READ_TICK }} />;
  if (status === "delivered") return <CheckCheck size={14} className="text-slate-400" />;
  return <Check size={14} className="text-slate-400" />;
}

export default function WhatsAppSideChatDrawer() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isOpen, isMinimized, target, closeChat, toggleMinimize } = useWhatsAppSideChatStore();

  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [sharePropertyModalOpen, setSharePropertyModalOpen] = useState(false);
  const [activeMediaPreview, setActiveMediaPreview] = useState<{
    url: string;
    type: "image" | "video" | "audio" | "document";
    filename?: string;
  } | null>(null);
  const [fetchedName, setFetchedName] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const lastWaParamRef = useRef<string | null>(null);

  const waId = target?.waId || (target?.phone ? target.phone.replace(/\D/g, "") : "");

  // Auto-dock when navigating away from /crm/whatsapp?wa=...
  useEffect(() => {
    if (pathname === "/crm/whatsapp") {
      const wa = searchParams.get("wa");
      if (wa && wa.trim()) {
        lastWaParamRef.current = wa.trim();
      }
    } else {
      if (lastWaParamRef.current) {
        const waToDock = lastWaParamRef.current;
        lastWaParamRef.current = null;
        useWhatsAppSideChatStore.getState().openChat({
          waId: waToDock,
          phone: waToDock,
        });
        useWhatsAppSideChatStore.setState({ isMinimized: true });
      }
    }
  }, [pathname, searchParams]);

  // Fetch contact / lead name if target doesn't specify one
  useEffect(() => {
    if (!waId) return;
    setFetchedName(null);
    const token = localStorage.getItem("token");
    if (!token) return;

    fetch(`${CRM_API_URL}/crm/whatsapp/contacts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : Array.isArray(data?.contacts) ? data.contacts : [];
        const found = list.find(
          (c: any) => c.waId === waId || (c.phone && c.phone.replace(/\D/g, "") === waId)
        );
        if (found?.leadName) setFetchedName(found.leadName);
        else if (found?.name) setFetchedName(found.name);
      })
      .catch(() => {});
  }, [waId]);

  const displayName =
    target?.leadName || target?.contactName || fetchedName || (waId ? `+${waId}` : "WhatsApp Chat");

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const fetchThread = useCallback(async () => {
    if (!waId) return;
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/whatsapp/conversations?waId=${encodeURIComponent(waId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!res.ok) return;
      const data = await res.json();
      const list: WhatsAppMessage[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.messages)
        ? data.messages
        : Array.isArray(data?.rows)
        ? data.rows
        : [];

      // Sort chronological
      list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setMessages(list);
    } catch (e) {
      console.error("Failed to load WhatsApp side chat messages", e);
    }
  }, [waId]);

  useEffect(() => {
    if (!isOpen || !waId || pathname === "/crm/whatsapp") return;
    setLoading(true);
    fetchThread().finally(() => {
      setLoading(false);
      setTimeout(scrollToBottom, 100);
    });

    const interval = setInterval(fetchThread, 10000);
    return () => clearInterval(interval);
  }, [isOpen, waId, fetchThread, scrollToBottom, pathname]);

  const handleSend = async () => {
    if (!text.trim() || !waId) return;
    const bodyText = text.trim();
    setText("");
    setSending(true);

    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to: waId,
          body: bodyText,
          module: "Lead",
          entityId: target?.leadId,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to send WhatsApp message");
      }

      // Append optimistic message
      setMessages((prev) => [
        ...prev,
        {
          _id: `temp-${Date.now()}`,
          waId,
          direction: "outbound",
          body: bodyText,
          createdAt: new Date().toISOString(),
          status: "sent",
        },
      ]);
      setTimeout(scrollToBottom, 50);
      fetchThread();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Hide drawer when on full /crm/whatsapp page
  if (pathname === "/crm/whatsapp" || !isOpen || !target || !waId) return null;

  // Minimized floating pill bar at bottom right
  if (isMinimized) {
    return (
      <div
        onClick={toggleMinimize}
        className="fixed bottom-0 right-6 z-[95] flex h-12 w-80 cursor-pointer items-center justify-between rounded-t-xl bg-[#008069] px-4 text-white shadow-2xl transition-all hover:bg-[#00705c]"
      >
        <div className="flex items-center gap-2.5 truncate">
          <MessageCircle size={18} className="shrink-0 text-emerald-200" />
          <span className="truncate text-xs font-semibold">{displayName}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleMinimize();
            }}
            className="rounded p-1 hover:bg-white/10"
            title="Restore chat"
          >
            <ChevronUp size={16} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closeChat();
            }}
            className="rounded p-1 hover:bg-white/10"
            title="Close chat"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed bottom-4 right-6 z-[95] flex h-[620px] max-h-[90vh] w-[520px] sm:w-[540px] max-w-[96vw] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl transition-all">
        {/* Main Header Bar */}
        <div
          className="flex items-center justify-between px-4 py-3 text-white"
          style={{ backgroundColor: WA_HEADER }}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 font-bold text-white text-sm">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="truncate text-sm font-bold leading-snug">{displayName}</h4>
              <p className="text-xs text-emerald-100/90 font-mono">+{waId}</p>
            </div>
          </div>

          {/* Window Control Buttons */}
          <div className="flex items-center gap-1.5 text-white/90 shrink-0 ml-2">
            <button
              type="button"
              onClick={toggleMinimize}
              className="rounded-lg p-1.5 hover:bg-white/15 transition"
              title="Minimize"
            >
              <Minus size={16} />
            </button>
            <button
              type="button"
              onClick={() => {
                closeChat();
                router.push(`/crm/whatsapp?wa=${encodeURIComponent(waId)}`);
              }}
              className="rounded-lg p-1.5 hover:bg-white/15 transition"
              title="Open full page"
            >
              <Maximize2 size={15} />
            </button>
            <button
              type="button"
              onClick={closeChat}
              className="rounded-lg p-1.5 hover:bg-white/15 transition"
              title="Close chat"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Quick Actions Sub-Header Bar */}
        <div
          className="flex items-center gap-2 border-b border-emerald-700/20 px-4 py-2 text-white overflow-x-auto no-scrollbar"
          style={{ backgroundColor: WA_HEADER_SUB }}
        >
          <button
            type="button"
            onClick={() => setCallModalOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white hover:bg-white/30 transition shrink-0"
            title="Call Lead"
          >
            <Phone size={13} /> Call
          </button>

          <button
            type="button"
            onClick={() => setSharePropertyModalOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white hover:bg-white/30 transition shrink-0"
            title="Share Property"
          >
            <Share2 size={13} /> Share Property
          </button>

          <button
            type="button"
            onClick={() => setTemplatePickerOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white hover:bg-white/30 transition shrink-0"
            title="Send Template"
          >
            <FileText size={13} /> Send Template
          </button>
        </div>

        {/* Message Thread List */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-3"
          style={{ backgroundColor: WA_WALLPAPER }}
        >
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-[#008069]" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center p-4 text-slate-500">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-[#008069] mb-2">
                <MessageCircle size={22} />
              </div>
              <p className="text-xs font-medium text-slate-700">No messages yet</p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-[220px]">
                Type a message below or send a template to start chatting.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isOutbound = msg.direction === "outbound";
              const attachmentUrl = msg.attachment?.url
                ? msg.attachment.url.startsWith("http")
                  ? msg.attachment.url
                  : `${CRM_API_URL}${msg.attachment.url}`
                : "";

              return (
                <div
                  key={msg._id}
                  className={cn(
                    "flex flex-col max-w-[85%]",
                    isOutbound ? "ml-auto items-end" : "mr-auto items-start"
                  )}
                >
                  <div
                    className={cn(
                      "rounded-lg px-3.5 py-2.5 text-xs shadow-sm leading-relaxed break-words w-full",
                      isOutbound
                        ? "rounded-tr-none text-slate-900"
                        : "rounded-tl-none bg-white text-slate-900 border border-slate-200/60"
                    )}
                    style={{
                      backgroundColor: isOutbound ? WA_OUTGOING_BUBBLE : "#ffffff",
                    }}
                  >
                    {/* Media Attachment Rendering */}
                    {msg.attachment && (
                      <div className="mb-2 max-w-full overflow-hidden">
                        {msg.attachment.type === "image" && (
                          <div className="overflow-hidden rounded-md border border-slate-200/50 group relative">
                            <img
                              src={attachmentUrl}
                              alt={msg.attachment.filename || "Image"}
                              className="max-h-64 w-full object-cover rounded-md cursor-pointer hover:opacity-95 transition"
                              onClick={() =>
                                setActiveMediaPreview({
                                  url: attachmentUrl,
                                  type: "image",
                                  filename: msg.attachment?.filename || "Image",
                                })
                              }
                            />
                          </div>
                        )}
                        {msg.attachment.type === "video" && (
                          <div className="relative overflow-hidden rounded-md bg-black group">
                            <video src={attachmentUrl} controls className="max-h-64 w-full rounded-md" />
                            <button
                              type="button"
                              onClick={() =>
                                setActiveMediaPreview({
                                  url: attachmentUrl,
                                  type: "video",
                                  filename: msg.attachment?.filename || "Video",
                                })
                              }
                              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition shadow-sm z-10"
                              title="Expand Video Preview"
                            >
                              <Maximize2 size={12} />
                            </button>
                          </div>
                        )}
                        {msg.attachment.type === "audio" && (
                          <div className="rounded-md bg-slate-50/90 p-2 border border-slate-200/60 flex items-center gap-2">
                            <audio src={attachmentUrl} controls className="max-w-full flex-1 h-8" />
                          </div>
                        )}
                        {msg.attachment.type === "document" && (
                          <div className="flex items-center gap-2 rounded-md bg-black/5 p-2.5 text-xs">
                            <FileText size={20} className="text-slate-500 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold text-slate-800">
                                {msg.attachment.filename || "Document"}
                              </p>
                              <a
                                href={attachmentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] text-sky-600 hover:underline font-medium"
                              >
                                Download
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {msg.body && <div className="whitespace-pre-wrap">{msg.body}</div>}

                    <div
                      className={cn(
                        "mt-1 flex items-center justify-end gap-1 text-[10px] select-none",
                        isOutbound ? "text-slate-500" : "text-slate-400"
                      )}
                    >
                      <span>{formatTime(msg.createdAt)}</span>
                      {isOutbound && <StatusTicks status={msg.status} />}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Composer Footer */}
        <div className="border-t border-slate-200 bg-white p-3 space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTemplatePickerOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-[#008069] transition"
              title="Send WhatsApp Template"
            >
              <FileText size={16} />
            </button>

            <textarea
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message…"
              className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#008069] focus:ring-1 focus:ring-[#008069]/20"
            />

            <button
              type="button"
              disabled={sending || !text.trim()}
              onClick={handleSend}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#008069] text-white disabled:opacity-50 hover:bg-[#00705c] transition-all"
              title="Send Message"
            >
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        </div>
      </div>

      {/* In-Site Full-Screen Media Preview Modal */}
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
          <div className="relative flex flex-1 items-center justify-center w-full max-h-[85vh] p-2 mt-12">
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
                <FileText size={48} className="text-slate-400" />
                <p className="text-sm font-semibold text-slate-800 truncate w-full text-center">
                  {activeMediaPreview.filename || "Audio Note"}
                </p>
                <audio src={activeMediaPreview.url} controls autoPlay className="w-full" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Action Modals */}
      {callModalOpen && (
        <CallLeadModal
          open={callModalOpen}
          phone={waId}
          leadId={target?.leadId}
          leadName={displayName}
          onClose={() => setCallModalOpen(false)}
        />
      )}

      {sharePropertyModalOpen && (
        <SharePropertyModal
          open={sharePropertyModalOpen}
          waId={waId}
          leadId={target?.leadId}
          leadName={displayName}
          onClose={() => setSharePropertyModalOpen(false)}
          onSuccess={() => {
            setSharePropertyModalOpen(false);
            fetchThread();
          }}
        />
      )}

      {/* Template Picker Modal */}
      {templatePickerOpen && (
        <WhatsAppTemplatePicker
          open={templatePickerOpen}
          to={waId}
          leadId={target?.leadId}
          leadName={displayName}
          onClose={() => setTemplatePickerOpen(false)}
          onSent={() => {
            setTemplatePickerOpen(false);
            fetchThread();
          }}
        />
      )}
    </>
  );
}
