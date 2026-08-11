"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Loader2, ListChecks, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import { usePermissions } from "@/hooks/usePermissions";
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
import { CrmKanbanCardHead } from "@/components/crm/ui";
import { CRM_HS_CONTROL_CLASS, CRM_HS_LABEL_CLASS } from "@/components/crm/records/forms/crm-form-primitives";

const LBL = CRM_HS_LABEL_CLASS;
const INP = CRM_HS_CONTROL_CLASS;

type ListKey = "leadCategory" | "group" | "checklistItem";

const TABS: { key: ListKey; label: string; blurb: string }[] = [
  {
    key: "leadCategory",
    label: "Lead Type",
    blurb: "Powers the lead-type tab bar (All Leads / Reference / Investor / Lead / Buyer lead) and the Add Lead \"Lead Type\" dropdown.",
  },
  {
    key: "group",
    label: "Group",
    blurb: "Powers the \"Group\" filter and the Add Lead \"Group\" dropdown (e.g. Seller, Buyer).",
  },
  {
    key: "checklistItem",
    label: "Onboarding Checklist",
    blurb: "Powers the onboarding checklist shown on each lead's detail page — mark items done as you work the lead.",
  },
];

type OptionRow = {
  _id: string;
  listKey: ListKey;
  label: string;
  sortOrder?: number;
  isActive?: boolean;
};

export default function CrmLeadPicklistsPage() {
  const { hasAccess, isLoaded } = usePermissions();
  const canRead = hasAccess("settings:read") || hasAccess("leads:read") || hasAccess("leads:write");
  const canManage = hasAccess("settings:write") || hasAccess("settings:read");

  const [tab, setTab] = useState<ListKey>("leadCategory");
  const [list, setList] = useState<OptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveAndAddAnotherRef = useRef(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ label: "", sortOrder: "0", isActive: true });

  const authHeaders = useCallback(() => {
    const t = getCrmAuthToken();
    const h: Record<string, string> = {};
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }, []);

  const load = useCallback(async (listKey: ListKey) => {
    setLoading(true);
    try {
      const q = canManage ? "&includeInactive=true" : "";
      const res = await fetch(
        `${CRM_API_URL}/crm/lead-picklist-options?listKey=${listKey}${q}`,
        { headers: { ...authHeaders() } },
      );
      const data = res.ok ? await res.json() : [];
      setList(Array.isArray(data) ? data : []);
    } catch {
      setList([]);
      toast.error("Could not load options");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, canManage]);

  useEffect(() => {
    if (!isLoaded || !canRead) return;
    void load(tab);
  }, [isLoaded, canRead, tab, load]);

  const filtered = useMemo(
    () => list.filter((o) => o.listKey === tab),
    [list, tab],
  );

  const openCreate = () => {
    setEditingId(null);
    setForm({
      label: "",
      sortOrder: String((filtered.reduce((m, o) => Math.max(m, o.sortOrder ?? 0), 0) || 0) + 1),
      isActive: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (o: OptionRow) => {
    setEditingId(o._id);
    setForm({ label: o.label, sortOrder: String(o.sortOrder ?? 0), isActive: o.isActive !== false });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.label.trim()) {
      toast.error("Label is required");
      return;
    }
    setSaving(true);
    try {
      const body = editingId
        ? { label: form.label.trim(), sortOrder: Number(form.sortOrder) || 0, isActive: form.isActive }
        : { listKey: tab, label: form.label.trim(), sortOrder: Number(form.sortOrder) || 0, isActive: form.isActive };
      const url = editingId
        ? `${CRM_API_URL}/crm/lead-picklist-options/${editingId}`
        : `${CRM_API_URL}/crm/lead-picklist-options`;
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
      toast.success(editingId ? "Option updated" : "Option added");
      await load(tab);

      if (saveAndAddAnotherRef.current && !editingId) {
        setForm((prev) => ({ label: "", sortOrder: String(Number(prev.sortOrder) + 1), isActive: true }));
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
      const res = await fetch(`${CRM_API_URL}/crm/lead-picklist-options/${deleteId}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      if (!res.ok) {
        toast.error("Delete failed");
        return;
      }
      toast.success("Option removed");
      setDeleteId(null);
      await load(tab);
    } catch {
      toast.error("Network error");
    }
  };

  if (isLoaded && !canRead) {
    return (
      <div className="flex h-full min-h-[40vh] items-center justify-center p-6 text-sm text-[var(--text-muted)]">
        You don’t have permission to view this setting.
      </div>
    );
  }

  if (!isLoaded) return null;

  const activeTab = TABS.find((t) => t.key === tab)!;

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      <div className="px-6 pt-6 pb-4 border-b border-border/30 shrink-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-primary mb-1">
              <ListChecks size={22} />
              <span className="text-xs font-semibold">Sales setup</span>
            </div>
            <h1 className="text-2xl font-black text-text-main tracking-tight">Lead Type, Group &amp; Checklist</h1>
            <p className="text-sm text-text-muted mt-1 max-w-xl">{activeTab.blurb}</p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-md bg-[var(--hs-link)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--hs-link-hover)] transition-colors shadow-sm shrink-0"
            >
              <Plus size={15} /> Add option
            </button>
          )}
        </div>

        <div className="mt-5 inline-flex rounded-md border border-[var(--border-color)] bg-white p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "px-3.5 py-1.5 text-sm font-semibold rounded-[5px] transition-colors",
                tab === t.key
                  ? "bg-[var(--hs-link)] text-white"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)]",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {loading ? (
          <div className="flex justify-center py-24 text-text-muted">
            <Loader2 className="animate-spin" size={28} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-border/60 bg-surface-dim/40 px-8 py-16 text-center text-text-muted">
            <ListChecks className="mx-auto mb-3 opacity-40" size={40} />
            <p className="font-semibold text-text-main">No options yet</p>
            <p className="text-sm mt-1 max-w-md mx-auto">
              {canManage
                ? `Add your first ${activeTab.label.toLowerCase()} option — it appears immediately in the Add Lead form and tabs/filters.`
                : "Your team has not configured this list yet. Ask an admin to add options."}
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered
              .slice()
              .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
              .map((o) => (
                <li
                  key={o._id}
                  className={cn(
                    "crm-kanban-card group !mt-0 cursor-default",
                    canManage && o.isActive === false && "opacity-60",
                  )}
                  style={{ ["--crm-stage-accent" as string]: "#2f80ed" }}
                >
                  <CrmKanbanCardHead
                    initials={(o.label?.[0] || "?").toUpperCase()}
                    title={<span className="truncate block">{o.label}</span>}
                    subtitle={o.isActive === false && canManage ? "Inactive" : undefined}
                    trailing={
                      canManage ? (
                        <div className="crm-kanban-card-actions">
                          <button type="button" onClick={() => openEdit(o)} className="crm-kanban-card-action" aria-label="Edit">
                            <Pencil size={14} strokeWidth={1.75} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteId(o._id)}
                            className="crm-kanban-card-action hover:!text-rose-600"
                            aria-label="Delete"
                          >
                            <Trash2 size={14} strokeWidth={1.75} />
                          </button>
                        </div>
                      ) : null
                    }
                  />
                </li>
              ))}
          </ul>
        )}
      </div>

      {typeof document !== "undefined" &&
        createPortal(
          <CrmSlidePanelShell
            isOpen={dialogOpen}
            onClose={() => setDialogOpen(false)}
            title={editingId ? `Edit ${activeTab.label.toLowerCase()} option` : `Add ${activeTab.label.toLowerCase()} option`}
            subtitle="Shown to every agent on the Add Lead form, tabs, and filters."
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
                <label className={LBL}>
                  Label <span className="text-[#f2545b]">*</span>
                </label>
                <input
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder={tab === "leadCategory" ? "e.g. Reference, Investor, Buyer lead" : "e.g. Seller, Buyer"}
                  className={INP}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LBL}>Sort order</label>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                    className={INP}
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm font-semibold text-[var(--text-main)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                      className="rounded-md border-[var(--border-color)] text-primary focus:ring-primary/30"
                    />
                    Active (visible to all)
                  </label>
                </div>
              </div>
            </div>
          </CrmSlidePanelShell>,
          document.body,
        )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="rounded-md p-0 overflow-hidden gap-0">
          <AlertDialogHeader className="px-6 py-5 border-b border-[var(--surface-dim)]">
            <AlertDialogTitle className="text-[18px] font-semibold text-[var(--text-main)]">Remove this option?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-[var(--text-muted)] mt-0.5">
              Existing leads keep their current value — this only removes it from the dropdown/tabs going forward.
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
