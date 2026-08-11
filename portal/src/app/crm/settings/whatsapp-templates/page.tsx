"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  FileText,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { cn } from "@/lib/utils";
import type { WhatsAppCachedTemplate } from "@/components/crm/inbox/WhatsAppTemplatePicker";

function bodyText(template: WhatsAppCachedTemplate): string {
  const body = (template.components || []).find(
    (c) => String(c.type || "").toUpperCase() === "BODY",
  );
  return body?.text || "—";
}

function statusTone(status: string): string {
  const s = status.toUpperCase();
  if (s === "APPROVED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "PENDING" || s === "IN_APPEAL") return "bg-amber-50 text-amber-700 border-amber-200";
  if (s === "REJECTED" || s === "DISABLED") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

export default function WhatsAppTemplatesSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [templates, setTemplates] = useState<WhatsAppCachedTemplate[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [selected, setSelected] = useState<WhatsAppCachedTemplate | null>(null);
  const [waActive, setWaActive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const [tplRes, cfgRes] = await Promise.all([
        fetch(`${CRM_API_URL}/crm/whatsapp/templates`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${CRM_API_URL}/crm/integrations/whatsapp`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const tplData = await tplRes.json().catch(() => ({}));
      if (tplRes.ok) {
        setTemplates(Array.isArray(tplData.templates) ? tplData.templates : []);
        setSyncedAt(tplData.syncedAt || null);
        if (tplData.error) toast.error(tplData.error);
      } else {
        toast.error(tplData?.error || "Failed to load templates");
      }
      if (cfgRes.ok) {
        const cfg = await cfgRes.json().catch(() => ({}));
        setWaActive(Boolean(cfg?.isActive && cfg?.apiKey && cfg?.phoneNumberId));
      }
    } catch {
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  const sync = async () => {
    setSyncing(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp/templates/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        toast.error(data?.error || "Sync failed");
        return;
      }
      setTemplates(Array.isArray(data.templates) ? data.templates : []);
      setSyncedAt(data.syncedAt || null);
      toast.success(`Synced ${data.templates?.length ?? 0} templates`);
    } catch {
      toast.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.language.toLowerCase().includes(q) ||
        String(t.status || "")
          .toLowerCase()
          .includes(q) ||
        String(t.category || "")
          .toLowerCase()
          .includes(q),
    );
  }, [templates, search]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link
            href="/crm/settings"
            className="mt-0.5 rounded-full p-2 text-text-muted transition-colors hover:bg-slate-100 hover:text-text-main"
          >
            <ChevronLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-medium tracking-tight text-text-main">
              WhatsApp Templates
            </h1>
            <p className="text-sm font-medium text-text-muted">
              Sync approved Meta templates and use them from Inbox WhatsApp chat.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/crm/inbox?source=whatsapp"
            className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-white px-4 text-xs font-semibold text-text-main hover:bg-slate-50"
          >
            <MessageCircle size={14} /> Open WhatsApp inbox
          </Link>
          <button
            type="button"
            disabled={syncing || !waActive}
            onClick={() => void sync()}
            className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Sync from Meta
          </button>
        </div>
      </div>

      {!waActive && (
        <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          WhatsApp is not configured or inactive.{" "}
          <Link
            href="/crm/settings/integrations/whatsapp"
            className="font-semibold underline"
          >
            Configure integration
          </Link>{" "}
          (include Business Account ID / WABA) before syncing templates.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, language, status…"
            className="h-10 w-full rounded-[var(--radius-md)] border border-border bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <p className="text-xs text-text-muted">
          {templates.length} template{templates.length === 1 ? "" : "s"}
          {syncedAt ? ` · Last synced ${new Date(syncedAt).toLocaleString()}` : ""}
        </p>
      </div>

      <div className="grid min-h-[420px] grid-cols-1 overflow-hidden rounded-[var(--radius-md)] border border-border bg-white shadow-sm md:grid-cols-[1.1fr_0.9fr]">
        <div className="min-h-0 overflow-y-auto border-b border-border md:border-b-0 md:border-r">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-12 text-xs text-text-muted">
              <Loader2 size={16} className="animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="mx-auto mb-3 text-text-muted opacity-30" size={28} />
              <p className="text-sm font-semibold text-text-main">No templates yet</p>
              <p className="mt-1 text-xs text-text-muted">
                Create templates in Meta Business Manager, then sync here.
              </p>
            </div>
          ) : (
            filtered.map((t) => {
              const active =
                selected?.name === t.name && selected?.language === t.language;
              return (
                <button
                  key={`${t.name}:${t.language}:${t.id || ""}`}
                  type="button"
                  onClick={() => setSelected(t)}
                  className={cn(
                    "flex w-full items-start justify-between gap-3 border-b border-border/50 px-4 py-3.5 text-left transition",
                    active ? "bg-emerald-50/70" : "hover:bg-slate-50",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text-main">{t.name}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-text-muted">
                      {t.language}
                      {t.category ? ` · ${t.category}` : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      statusTone(t.status),
                    )}
                  >
                    {t.status || "unknown"}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="min-h-0 overflow-y-auto p-5">
          {!selected ? (
            <p className="text-xs text-text-muted">Select a template to preview components.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-text-main">{selected.name}</h2>
                <p className="text-xs text-text-muted">
                  {selected.language}
                  {selected.category ? ` · ${selected.category}` : ""} · {selected.status}
                </p>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  Body
                </p>
                <div className="rounded-[var(--radius-md)] border border-border bg-slate-50 p-3 text-sm leading-relaxed whitespace-pre-wrap text-text-main">
                  {bodyText(selected)}
                </div>
              </div>
              {(selected.components || []).length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                    Components
                  </p>
                  {(selected.components || []).map((c, idx) => (
                    <div
                      key={`${c.type}-${idx}`}
                      className="rounded-[var(--radius-md)] border border-border px-3 py-2 text-xs"
                    >
                      <p className="font-bold text-text-main">{c.type || "COMPONENT"}</p>
                      {c.format && (
                        <p className="text-text-muted">Format: {c.format}</p>
                      )}
                      {c.text && (
                        <p className="mt-1 whitespace-pre-wrap text-text-main">{c.text}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-text-muted">
                New templates must be created and approved in Meta Business Manager. CRM syncs and sends them only.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
