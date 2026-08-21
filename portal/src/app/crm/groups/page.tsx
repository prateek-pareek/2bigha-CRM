"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Search, Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import { usePermissions } from "@/hooks/usePermissions";
import { CrmPageHeader, CrmButton } from "@/components/crm/ui";

type GroupRow = {
  _id: string;
  label: string;
  leadCount: number;
  createdByName?: string;
  isActive?: boolean;
};

/**
 * Groups — organize leads into named groups: create, search by name, see lead
 * count + creator, edit/delete, and click through to the filtered leads list.
 * Storage is the existing `LeadPicklistOption` (listKey='group'); this page is
 * the first-class "Groups" section the FRD describes, distinct from the
 * admin-only raw CRUD tab under Settings > Lead Type, Group & Checklist.
 */
export default function GroupsPage() {
  const router = useRouter();
  const { hasAccess } = usePermissions();
  const canManage = hasAccess("settings:write") || hasAccess("leads:write");
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const t = getCrmAuthToken();
    const h: Record<string, string> = {};
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }, []);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("search", q.trim());
      const res = await fetch(`${CRM_API_URL}/crm/lead-picklist-options/groups-with-counts?${params.toString()}`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      const data = res.ok ? await res.json() : [];
      setGroups(Array.isArray(data) ? data : []);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    const t = setTimeout(() => void load(search), 250);
    return () => clearTimeout(t);
  }, [search, load]);

  const openCreate = () => {
    setEditingId(null);
    setLabel("");
    setDialogOpen(true);
  };

  const openEdit = (g: GroupRow) => {
    setEditingId(g._id);
    setLabel(g.label);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!label.trim()) {
      toast.error("Group name is required");
      return;
    }
    setSaving(true);
    try {
      const url = editingId
        ? `${CRM_API_URL}/crm/lead-picklist-options/${editingId}`
        : `${CRM_API_URL}/crm/lead-picklist-options`;
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(editingId ? { label: label.trim() } : { listKey: "group", label: label.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.message || "Save failed");
        return;
      }
      toast.success(editingId ? "Group updated" : "Group created");
      setDialogOpen(false);
      await load(search);
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
        headers: authHeaders(),
      });
      if (!res.ok) {
        toast.error("Delete failed");
        return;
      }
      toast.success("Group removed");
      setDeleteId(null);
      await load(search);
    } catch {
      toast.error("Network error");
    }
  };

  const viewLeads = (label: string) => {
    const filters = [{ property: "group", operator: "equals", value: label }];
    router.push(`/crm/leads?filters=${encodeURIComponent(JSON.stringify(filters))}`);
  };

  return (
    <div className="p-4 sm:p-6">
      <CrmPageHeader
        title="Groups"
        bordered={false}
        breadcrumbs={[{ label: "Home", href: "/crm" }, { label: "Leads", href: "/crm/leads" }, { label: "Groups" }]}
        actions={
          canManage ? (
            <CrmButton type="button" onClick={openCreate} className="gap-1.5">
              <Plus size={14} />
              New group
            </CrmButton>
          ) : undefined
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <div className="relative w-64">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search groups…"
            className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] pl-8 pr-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--primary)]"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)]">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-color)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              <th className="px-4 py-2.5">Group</th>
              <th className="px-4 py-2.5">Leads</th>
              <th className="px-4 py-2.5">Created by</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  <Loader2 size={16} className="mx-auto animate-spin" />
                </td>
              </tr>
            ) : groups.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  No groups yet.
                </td>
              </tr>
            ) : (
              groups.map((g) => (
                <tr key={g._id} className="border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--surface-dim)]">
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => viewLeads(g.label)}
                      className="flex items-center gap-1.5 font-medium text-[var(--text-main)] hover:text-[var(--primary)] hover:underline"
                    >
                      <Users size={13} className="text-[var(--text-muted)]" />
                      {g.label}
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => viewLeads(g.label)}
                      className="rounded-full border border-[var(--border-color)] px-2 py-0.5 text-xs font-semibold text-[var(--text-muted)] hover:border-[var(--primary)]/50 hover:text-[var(--primary)]"
                    >
                      {g.leadCount}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--text-muted)]">{g.createdByName || "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    {canManage ? (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          title="Edit"
                          onClick={() => openEdit(g)}
                          className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--primary)]"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          onClick={() => setDeleteId(g._id)}
                          className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {dialogOpen ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-5 shadow-[var(--crm-shadow-raised)]">
            <h3 className="mb-3 text-sm font-bold text-[var(--text-main)]">{editingId ? "Edit group" : "New group"}</h3>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Name</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Seller"
              className="mb-4 h-9 w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--primary)]"
            />
            <div className="flex justify-end gap-2">
              <CrmButton type="button" variant="secondary" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancel
              </CrmButton>
              <CrmButton type="button" onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : "Save"}
              </CrmButton>
            </div>
          </div>
        </div>
      ) : null}

      {deleteId ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-5 shadow-[var(--crm-shadow-raised)]">
            <h3 className="mb-2 text-sm font-bold text-[var(--text-main)]">Delete group?</h3>
            <p className="mb-4 text-sm text-[var(--text-muted)]">
              Leads already tagged with this group keep their value; the group just stops appearing in dropdowns.
            </p>
            <div className="flex justify-end gap-2">
              <CrmButton type="button" variant="secondary" onClick={() => setDeleteId(null)}>
                Cancel
              </CrmButton>
              <CrmButton type="button" onClick={() => void confirmDelete()} className="bg-red-600 hover:bg-red-700">
                Delete
              </CrmButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
