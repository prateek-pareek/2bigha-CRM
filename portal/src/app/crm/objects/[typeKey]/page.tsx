"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, Loader2, Plus, Trash2 } from "lucide-react";
import {
  createObjectRecord,
  deleteObjectRecord,
  fetchObjectRecords,
  fetchObjectTypes,
  type CrmObjectRecord,
  type CrmObjectType,
} from "@/portals/crm/lib/custom-objects/custom-objects-api";
import { CrmButton } from "@/components/crm/ui";
import { CRM_HS_CONTROL_CLASS } from "@/components/crm/records/forms/crm-form-primitives";

export default function CustomObjectRecordsPage() {
  const params = useParams();
  const typeKey = String(params?.typeKey || "");
  const [objectType, setObjectType] = useState<CrmObjectType | null>(null);
  const [items, setItems] = useState<CrmObjectRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    if (!typeKey) return;
    setLoading(true);
    setError(null);
    try {
      const [types, list] = await Promise.all([
        fetchObjectTypes(true),
        fetchObjectRecords(typeKey, { page: 1, pageSize: 50, search: search.trim() || undefined }),
      ]);
      setObjectType(types.find((t) => t.key === typeKey) || null);
      setItems(list.items);
      setTotal(list.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [typeKey]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createObjectRecord(typeKey, { name: name.trim() });
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (row: CrmObjectRecord) => {
    if (!confirm(`Delete "${row.name}"?`)) return;
    try {
      await deleteObjectRecord(typeKey, row._id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const label = objectType?.pluralLabel || typeKey;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <Link
            href="/crm/settings/custom-objects"
            className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--hs-link)]"
          >
            <ChevronLeft size={14} /> Custom objects
          </Link>
          <h1 className="text-[22px] font-semibold text-[var(--text-main)]">{label}</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {total} record{total === 1 ? "" : "s"}
            {objectType?.description ? ` · ${objectType.description}` : ""}
          </p>
        </div>
        <form onSubmit={onCreate} className="flex gap-2 items-center">
          <input
            className={CRM_HS_CONTROL_CLASS}
            placeholder={`New ${objectType?.singularLabel || "record"} name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <CrmButton
            type="submit"
            disabled={saving || !name.trim()}
            leftIcon={saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          >
            Add
          </CrmButton>
        </form>
      </div>

      <div className="flex gap-2">
        <input
          className={CRM_HS_CONTROL_CLASS}
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void load();
          }}
        />
        <CrmButton variant="secondary" onClick={() => void load()}>
          Search
        </CrmButton>
      </div>

      {error && (
        <div className="rounded-md border border-[var(--error)]/30 bg-[var(--error)]/5 px-4 py-3 text-sm text-[var(--error)]">
          {error}
        </div>
      )}

      <div className="rounded-md border border-[var(--border-color)] bg-card overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
          </div>
        ) : items.length === 0 ? (
          <p className="p-8 text-center text-sm text-[var(--text-muted)]">No records yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border-color)]">
            {items.map((row) => (
              <li key={row._id} className="flex items-center justify-between px-4 py-3 gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-[var(--text-main)] truncate">{row.name}</p>
                  <p className="text-[11px] text-[var(--text-muted)] font-mono">{row._id}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void onDelete(row)}
                  className="p-2 rounded-md text-[var(--text-muted)] hover:text-[var(--error)]"
                  title="Delete"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
