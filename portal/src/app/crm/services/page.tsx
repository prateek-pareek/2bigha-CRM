"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Loader2, Package, Pencil, Plus, Search, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from '@/lib/crm/config';
import { getCrmAuthToken } from "@/lib/crm/api";
import { usePermissions } from "@/hooks/usePermissions";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import CrmSlidePanelShell from "@/components/crm/shell/CrmSlidePanelShell";
import {
  CrmKanbanCardHead,
  CrmKanbanMetaList,
  CrmKanbanMetaRow,
  CrmKanbanCardFooter,
} from "@/components/crm/ui";

import { CRM_HS_CONTROL_CLASS, CRM_HS_LABEL_CLASS } from '@/components/crm/records/forms/crm-form-primitives';

const LBL = CRM_HS_LABEL_CLASS;
const INP = CRM_HS_CONTROL_CLASS;
const TXA = 'w-full bg-white border border-[var(--border-color)] rounded-md px-3 py-2 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--primary-muted)] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all resize-y';

type ServiceRow = {
  _id: string;
  name: string;
  summary?: string;
  description?: string;
  keywords?: string[];
  sortOrder?: number;
  isActive?: boolean;
  updatedAt?: string;
};

function parseKeywordsInput(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

function keywordsToInput(kw: string[] | undefined): string {
  return (kw ?? []).join(", ");
}

export default function CrmServicesPage() {
  const { hasAccess, isLoaded } = usePermissions();
  const canRead =
    hasAccess("services:read") ||
    hasAccess("services:write") ||
    hasAccess("leads:read") ||
    hasAccess("proposals:read");
  const canManage = hasAccess("services:write");

  const [list, setList] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveAndAddAnotherRef = useRef(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    summary: "",
    description: "",
    keywords: "",
    sortOrder: "0",
    isActive: true,
  });

  const authHeaders = useCallback(() => {
    const t = getCrmAuthToken();
    const h: Record<string, string> = {};
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = canManage ? "?includeInactive=true" : "";
      const res = await fetch(`${CRM_API_URL}/crm/service-offerings${q}`, {
        headers: { ...authHeaders() },
      });
      const data = res.ok ? await res.json() : [];
      setList(Array.isArray(data) ? data : []);
    } catch {
      setList([]);
      toast.error("Could not load services");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, canManage]);

  useEffect(() => {
    if (!isLoaded || !canRead) return;
    void load();
  }, [isLoaded, canRead, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) => {
      const blob = [
        s.name,
        s.summary,
        s.description,
        ...(s.keywords ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [list, search]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      name: "",
      summary: "",
      description: "",
      keywords: "",
      sortOrder: String((list.reduce((m, s) => Math.max(m, s.sortOrder ?? 0), 0) || 0) + 1),
      isActive: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (s: ServiceRow) => {
    setEditingId(s._id);
    setForm({
      name: s.name,
      summary: s.summary ?? "",
      description: s.description ?? "",
      keywords: keywordsToInput(s.keywords),
      sortOrder: String(s.sortOrder ?? 0),
      isActive: s.isActive !== false,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Service name is required");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        summary: form.summary.trim(),
        description: form.description.trim(),
        keywords: parseKeywordsInput(form.keywords),
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
      };
      const url = editingId
        ? `${CRM_API_URL}/crm/service-offerings/${editingId}`
        : `${CRM_API_URL}/crm/service-offerings`;
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || "Save failed");
        return;
      }
      toast.success(editingId ? "Service updated" : "Service added");
      await load();
      
      if (saveAndAddAnotherRef.current && !editingId) {
        setForm(prev => ({
          name: "",
          summary: "",
          description: "",
          keywords: "",
          sortOrder: String(Number(prev.sortOrder) + 1),
          isActive: true,
        }));
      } else {
        setDialogOpen(false);
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`${CRM_API_URL}/crm/service-offerings/${deleteId}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      if (!res.ok) {
        toast.error("Delete failed");
        return;
      }
      toast.success("Service removed");
      setDeleteId(null);
      await load();
    } catch {
      toast.error("Network error");
    }
  };

  if (isLoaded && !canRead) {
    return (
      <div className="flex h-full min-h-[40vh] items-center justify-center p-6 text-sm text-[var(--text-muted)]">
        You don’t have permission to view services.
      </div>
    );
  }

  if (!isLoaded) return null;

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      <div className="px-6 pt-6 pb-4 border-b border-border/30 shrink-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-primary mb-1">
              <Package size={22} />
              <span className="text-xs font-semibold">Reference</span>
            </div>
            <h1 className="text-2xl font-black text-text-main tracking-tight">Service listing</h1>
            <p className="text-sm text-text-muted mt-1 max-w-xl">
              What we offer and keywords to use in outreach, proposals, and search — visible to everyone with CRM access.
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-md bg-[var(--hs-link)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--hs-link-hover)] transition-colors shadow-sm shrink-0"
            >
              <Plus size={15} /> Add service
            </button>
          )}
        </div>

        <div className="mt-5 relative max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" size={16} />
          <Input
            placeholder="Search by name, description, or keyword…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10 rounded-[var(--radius-md)] bg-surface-dim border-border/60"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {loading ? (
          <div className="flex justify-center py-24 text-text-muted">
            <Loader2 className="animate-spin" size={28} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-border/60 bg-surface-dim/40 px-8 py-16 text-center text-text-muted">
            <Package className="mx-auto mb-3 opacity-40" size={40} />
            <p className="font-semibold text-text-main">No services yet</p>
            <p className="text-sm mt-1 max-w-md mx-auto">
              {canManage
                ? "Add your first service with a short summary and keywords (e.g. industries, tech stack, delivery models)."
                : "Your team has not published any services yet. Ask an admin to add them under CRM settings access."}
            </p>
            {canManage && (
              <button
                type="button"
                onClick={openCreate}
                className="mt-6 inline-flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--background)] transition-colors"
              >
                <Plus size={15} /> Add service
              </button>
            )}
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((s) => (
              <li
                key={s._id}
                className={cn(
                  "crm-kanban-card group !mt-0 cursor-default",
                  canManage && s.isActive === false && "opacity-60",
                )}
                style={{ ["--crm-stage-accent" as string]: "#2f80ed" }}
              >
                <CrmKanbanCardHead
                  initials={(s.name?.[0] || "S").toUpperCase()}
                  title={<span className="truncate block">{s.name}</span>}
                  subtitle={
                    s.isActive === false && canManage ? "Inactive" : undefined
                  }
                  trailing={
                    canManage ? (
                      <div className="crm-kanban-card-actions">
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          className="crm-kanban-card-action"
                          aria-label="Edit"
                        >
                          <Pencil size={14} strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteId(s._id)}
                          className="crm-kanban-card-action hover:!text-rose-600"
                          aria-label="Delete"
                        >
                          <Trash2 size={14} strokeWidth={1.75} />
                        </button>
                      </div>
                    ) : null
                  }
                />
                {(s.summary || s.description) && (
                  <CrmKanbanMetaList>
                    {s.summary ? (
                      <CrmKanbanMetaRow>
                        <span className="line-clamp-2 whitespace-normal text-[var(--text-muted)]">
                          {s.summary}
                        </span>
                      </CrmKanbanMetaRow>
                    ) : null}
                    {s.description ? (
                      <CrmKanbanMetaRow>
                        <span className="line-clamp-3 whitespace-pre-wrap text-[var(--text-muted)]">
                          {s.description}
                        </span>
                      </CrmKanbanMetaRow>
                    ) : null}
                  </CrmKanbanMetaList>
                )}
                {(s.keywords?.length ?? 0) > 0 && (
                  <CrmKanbanCardFooter
                    left={
                      <div className="flex flex-wrap gap-1.5 min-w-0">
                        {(s.keywords ?? []).slice(0, 6).map((k) => (
                          <span
                            key={k}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/15"
                          >
                            {k}
                          </span>
                        ))}
                        {(s.keywords?.length ?? 0) > 6 ? (
                          <span className="text-[10px] font-semibold text-[var(--text-muted)]">
                            +{(s.keywords?.length ?? 0) - 6}
                          </span>
                        ) : null}
                      </div>
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {typeof document !== "undefined" && createPortal(
        <CrmSlidePanelShell
          isOpen={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title={editingId ? "Edit service" : "Add service"}
          subtitle="Name and keywords help the team stay aligned on positioning and search terms."
          headerTone="hubspot"
          footer={
            <div className="flex items-center gap-3">
              {!editingId && (
                <button
                  type="button"
                  onClick={() => {
                    saveAndAddAnotherRef.current = true;
                    void save();
                  }}
                  disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-[var(--border-color)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--background)] transition-colors disabled:opacity-50"
                >
                  {saving && saveAndAddAnotherRef.current ? <Loader2 size={15} className="animate-spin" /> : null}
                  {saving && saveAndAddAnotherRef.current ? "Saving…" : "Create & Add Another"}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  saveAndAddAnotherRef.current = false;
                  void save();
                }}
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[var(--hs-link)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--hs-link-hover)] transition-colors disabled:opacity-50"
              >
                {saving && !saveAndAddAnotherRef.current ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving && !saveAndAddAnotherRef.current ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="inline-flex items-center justify-center rounded-md border border-[var(--border-color)] bg-white px-5 py-2.5 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--background)] transition-colors"
              >
                Cancel
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className={LBL}>Name <span className="text-[#f2545b]">*</span></label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Custom software development" className={INP} />
            </div>
            <div>
              <label className={LBL}>Short summary</label>
              <input value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} placeholder="One line for cards and quick scanning" className={INP} />
            </div>
            <div>
              <label className={LBL}>Details <span className="text-[var(--primary-muted)] font-normal">(optional)</span></label>
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Scope, deliverables, ideal customer, pricing notes…" rows={4} className={TXA} />
            </div>
            <div>
              <label className={LBL}>Keywords</label>
              <textarea value={form.keywords} onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))} placeholder="Comma or line separated: e.g. React, NestJS, MVP, fintech" rows={3} className={`${TXA} font-mono text-xs`} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LBL}>Sort order</label>
                <input type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} className={INP} />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm font-semibold text-[var(--text-main)] cursor-pointer">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="rounded-md border-[var(--border-color)] text-primary focus:ring-primary/30" />
                  Active (visible to all)
                </label>
              </div>
            </div>
          </div>
        </CrmSlidePanelShell>,
        document.body
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="rounded-md p-0 overflow-hidden gap-0">
          <AlertDialogHeader className="px-6 py-5 border-b border-[var(--surface-dim)]">
            <AlertDialogTitle className="text-[18px] font-semibold text-[var(--text-main)]">Remove this service?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-[var(--text-muted)] mt-0.5">
              This only removes the catalog entry. It does not affect clients.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="px-6 py-4 border-t border-[var(--surface-dim)] bg-[var(--background)] flex gap-2 sm:gap-2">
            <AlertDialogCancel className="inline-flex items-center justify-center rounded-md border border-[var(--border-color)] bg-white px-5 py-2 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--background)] transition-colors h-auto">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              className="inline-flex items-center justify-center rounded-md bg-rose-600 hover:bg-rose-700 px-5 py-2 text-sm font-semibold text-white transition-colors h-auto"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
