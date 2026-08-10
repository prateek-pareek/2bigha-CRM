"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Globe, Loader2, MessageCircle, RefreshCw, Send } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import crmApi from "@/lib/crm/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import Pagination from "@/components/suite/shell/Pagination";
import {
  audienceBadgeClass,
  audienceLabel,
} from "@/lib/social/publishing/audience";

type ChatSessionRow = {
  _id: string;
  sessionKey: string;
  visitorName?: string;
  visitorEmail?: string;
  audience?: string;
  status: string;
  lastMessageAt?: string;
  unreadByStaff?: boolean;
  pageUrl?: string;
};

type ChatMessage = {
  body: string;
  sender: "visitor" | "staff";
  staffName?: string;
  createdAt: string;
};

type ChatDetail = ChatSessionRow & {
  messages: ChatMessage[];
  staffNotes?: string;
};

export default function WebsiteChatsPage() {
  const { hasAccess, isLoaded, isAdmin } = usePermissions();
  const canRead = isAdmin || hasAccess("leads:read");
  const canWrite = isAdmin || hasAccess("leads:write");

  const [items, setItems] = useState<ChatSessionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [statusFilter, setStatusFilter] = useState("open");
  const [unreadOnly, setUnreadOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ChatDetail | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadList = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    try {
      const { data } = await crmApi.get<{
        items: ChatSessionRow[];
        total: number;
      }>("/crm/website-chats", {
        params: {
          page,
          pageSize,
          status: statusFilter !== "__all__" ? statusFilter : undefined,
          unreadOnly: unreadOnly ? "true" : undefined,
          search: debouncedSearch || undefined,
        },
      });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch {
      toast.error("Could not load website chats.");
    } finally {
      setLoading(false);
    }
  }, [canRead, page, pageSize, statusFilter, unreadOnly, debouncedSearch]);

  const loadDetail = useCallback(
    async (id: string) => {
      try {
        const { data } = await crmApi.get<ChatDetail>(`/crm/website-chats/${id}`);
        setDetail(data);
        await crmApi.patch(`/crm/website-chats/${id}`, { unreadByStaff: false });
      } catch {
        toast.error("Could not load conversation.");
      }
    },
    [],
  );

  useEffect(() => {
    if (isLoaded) void loadList();
  }, [isLoaded, loadList]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const sendReply = async () => {
    if (!selectedId || !reply.trim() || !canWrite) return;
    setSending(true);
    try {
      const { data } = await crmApi.post<ChatDetail>(
        `/crm/website-chats/${selectedId}/reply`,
        { message: reply.trim() },
      );
      setDetail(data);
      setReply("");
      void loadList();
    } catch {
      toast.error("Could not send reply.");
    } finally {
      setSending(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        You do not have permission to view website chats.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="border-b border-[var(--border-color)] bg-white px-6 py-4 flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-main)] flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-[var(--hs-link)]" />
            Website chats
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            Live chat messages from your marketing sites
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void loadList()}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      <div className="px-6 py-3 flex flex-wrap gap-2 border-b border-[var(--border-color)] bg-[var(--surface-dim)]/50">
        <Input
          placeholder="Search visitor, email, message…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs h-9"
        />
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant={unreadOnly ? "default" : "outline"}
          size="sm"
          className="h-9"
          onClick={() => { setUnreadOnly((v) => !v); setPage(1); }}
        >
          Unread only
        </Button>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-full max-w-md border-r border-[var(--border-color)] overflow-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">No chats yet.</p>
          ) : (
            <ul>
              {items.map((row) => (
                <li key={row._id}>
                  <button
                    type="button"
                    className={`w-full text-left px-4 py-3 border-b border-[var(--border-color)] hover:bg-[var(--surface-dim)] ${
                      selectedId === row._id ? "bg-primary/[0.06]" : ""
                    }`}
                    onClick={() => setSelectedId(row._id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">
                        {row.visitorName || row.visitorEmail || "Visitor"}
                      </span>
                      {row.unreadByStaff ? (
                        <span className="h-2 w-2 rounded-full bg-[var(--hs-link)] shrink-0" />
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`inline-flex rounded-full border px-1.5 py-0 text-[9px] font-semibold ${audienceBadgeClass(row.audience)}`}
                      >
                        {audienceLabel(row.audience)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {row.lastMessageAt
                          ? format(new Date(row.lastMessageAt), "MMM d, HH:mm")
                          : ""}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {total > pageSize ? (
            <div className="p-3">
              <Pagination
                total={total}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
              />
            </div>
          ) : null}
        </div>

        <div className="flex-1 flex flex-col min-h-0 bg-white">
          {!detail ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              <Globe className="h-4 w-4 mr-2" />
              Select a conversation
            </div>
          ) : (
            <>
              <div className="px-5 py-3 border-b border-[var(--border-color)]">
                <div className="font-semibold">
                  {detail.visitorName || detail.visitorEmail || "Visitor"}
                </div>
                {detail.visitorEmail ? (
                  <div className="text-xs text-muted-foreground">{detail.visitorEmail}</div>
                ) : null}
              </div>
              <div className="flex-1 overflow-auto p-5 space-y-3">
                {(detail.messages || []).map((m, i) => (
                  <div
                    key={`${m.createdAt}-${i}`}
                    className={`max-w-[85%] rounded-[var(--radius-md)] px-4 py-2 text-sm ${
                      m.sender === "visitor"
                        ? "bg-slate-100 text-[var(--text-main)] mr-auto"
                        : "bg-[var(--hs-link)]/10 text-[var(--text-main)] ml-auto"
                    }`}
                  >
                    {m.sender === "staff" && m.staffName ? (
                      <div className="text-[10px] font-bold text-[var(--hs-link)] mb-1">
                        {m.staffName}
                      </div>
                    ) : null}
                    <div className="whitespace-pre-wrap">{m.body}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {format(new Date(m.createdAt), "MMM d, HH:mm")}
                    </div>
                  </div>
                ))}
              </div>
              {canWrite ? (
                <div className="p-4 border-t border-[var(--border-color)] flex gap-2">
                  <Textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Reply to visitor…"
                    rows={2}
                    className="resize-none"
                  />
                  <Button
                    type="button"
                    disabled={sending || !reply.trim()}
                    onClick={() => void sendReply()}
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
