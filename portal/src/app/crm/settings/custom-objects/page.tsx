"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Box, ChevronLeft, Loader2, Plus, Trash2 } from "lucide-react";
import {
  createObjectType,
  deleteObjectType,
  fetchObjectTypes,
  type CrmObjectType,
} from "@/portals/crm/lib/custom-objects/custom-objects-api";
import { CrmButton } from "@/components/crm/ui";
import {
  CRM_HS_CONTROL_CLASS,
  CRM_HS_LABEL_CLASS,
} from "@/components/crm/records/forms/crm-form-primitives";

export default function CustomObjectsSettingsPage() {
  const [types, setTypes] = useState<CrmObjectType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [singular, setSingular] = useState("");
  const [plural, setPlural] = useState("");
  const [description, setDescription] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setTypes(await fetchObjectTypes(true));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createObjectType({
        name: name.trim(),
        key: key.trim() || undefined,
        singularLabel: singular.trim() || undefined,
        pluralLabel: plural.trim() || undefined,
        description: description.trim() || undefined,
      });
      setName("");
      setKey("");
      setSingular("");
      setPlural("");
      setDescription("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (t: CrmObjectType) => {
    if (!confirm(`Delete object type "${t.name}"? It must have zero records.`)) return;
    setError(null);
    try {
      await deleteObjectType(t.key);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <Link
          href="/crm/settings"
          className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--hs-link)] transition-colors"
        >
          <ChevronLeft size={14} /> Settings
        </Link>
        <h1 className="text-[22px] font-semibold text-[var(--text-main)] flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--primary-light)] text-[var(--primary)]">
            <Box size={20} />
          </span>
          Custom objects
        </h1>
        <p className="text-sm text-[var(--primary-muted)] mt-1 max-w-2xl">
          Define new CRM object types (vendors, projects, contracts metadata, etc.) without
          replacing leads, contacts, companies, or clients. Properties use the same custom-fields
          catalog with <code className="text-xs">module = object key</code>.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-[var(--error)]/30 bg-[var(--error)]/5 px-4 py-3 text-sm text-[var(--error)]">
          {error}
        </div>
      )}

      <form
        onSubmit={onCreate}
        className="rounded-md border border-[var(--border-color)] bg-card p-4 space-y-3 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-[var(--text-main)]">New object type</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={CRM_HS_LABEL_CLASS}>Name</label>
            <input
              className={CRM_HS_CONTROL_CLASS}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Vendor"
              required
            />
          </div>
          <div>
            <label className={CRM_HS_LABEL_CLASS}>Key (slug)</label>
            <input
              className={CRM_HS_CONTROL_CLASS}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="vendors (optional)"
            />
          </div>
          <div>
            <label className={CRM_HS_LABEL_CLASS}>Singular label</label>
            <input
              className={CRM_HS_CONTROL_CLASS}
              value={singular}
              onChange={(e) => setSingular(e.target.value)}
              placeholder="Vendor"
            />
          </div>
          <div>
            <label className={CRM_HS_LABEL_CLASS}>Plural label</label>
            <input
              className={CRM_HS_CONTROL_CLASS}
              value={plural}
              onChange={(e) => setPlural(e.target.value)}
              placeholder="Vendors"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={CRM_HS_LABEL_CLASS}>Description</label>
            <input
              className={CRM_HS_CONTROL_CLASS}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
        <CrmButton
          type="submit"
          disabled={saving || !name.trim()}
          leftIcon={saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
        >
          {saving ? "Creating…" : "Create object type"}
        </CrmButton>
      </form>

      <div className="rounded-md border border-[var(--border-color)] bg-card overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[var(--border-color)] bg-surface-dim/40 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-[var(--text-main)]">Object types</h2>
          <span className="text-xs text-[var(--text-muted)]">{types.length} total</span>
        </div>
        {loading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
          </div>
        ) : types.length === 0 ? (
          <p className="p-6 text-sm text-[var(--text-muted)] text-center">
            No custom objects yet. Create one above.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border-color)]">
            {types.map((t) => (
              <li
                key={t._id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/crm/objects/${encodeURIComponent(t.key)}`}
                      className="font-semibold text-[var(--text-main)] hover:text-[var(--hs-link)]"
                    >
                      {t.pluralLabel || t.name}
                    </Link>
                    <span className="text-[11px] font-mono text-[var(--text-muted)] bg-surface-dim px-1.5 py-0.5 rounded">
                      {t.key}
                    </span>
                    {t.isActive === false && (
                      <span className="text-[11px] text-[var(--text-muted)]">Inactive</span>
                    )}
                  </div>
                  {t.description ? (
                    <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                      {t.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/crm/objects/${encodeURIComponent(t.key)}`}
                    className="text-xs font-semibold text-[var(--hs-link)] hover:underline"
                  >
                    Open records
                  </Link>
                  <button
                    type="button"
                    onClick={() => void onDelete(t)}
                    className="p-2 rounded-md text-[var(--text-muted)] hover:text-[var(--error)] hover:bg-[var(--error)]/5"
                    title="Delete object type"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
