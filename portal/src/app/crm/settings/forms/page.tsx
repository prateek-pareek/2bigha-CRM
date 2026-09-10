"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ClipboardList, Loader2, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { createForm, deleteForm, listForms, type FormDefinition } from "@/lib/crm/forms";

export default function FormsListPage() {
  const router = useRouter();
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchForms = async () => {
    setLoading(true);
    try {
      setForms(await listForms());
    } catch (err) {
      console.error("Failed to fetch forms:", err);
      toast.error("Failed to load forms");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForms();
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const form = await createForm({ name: "Untitled form", fields: [] });
      router.push(`/crm/settings/forms/${form._id}`);
    } catch (err) {
      console.error("Failed to create form:", err);
      toast.error("Failed to create form");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (form: FormDefinition, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${form.name}"? This cannot be undone.`)) return;
    try {
      await deleteForm(form._id);
      toast.success("Form deleted");
      fetchForms();
    } catch (err) {
      console.error("Failed to delete form:", err);
      toast.error("Failed to delete form");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link
            href="/crm/settings"
            className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--hs-link)] transition-colors"
          >
            <ChevronLeft size={14} /> Settings
          </Link>
          <h1 className="text-[22px] font-semibold text-[var(--text-main)] flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#fff3f0] text-[var(--hs-link)]">
              <ClipboardList size={20} />
            </span>
            Forms
          </h1>
          <p className="text-sm text-[var(--primary-muted)] mt-1">
            Build customizable lead-capture forms for Meta Ads, Google Ads, or your own website — every
            submission becomes a Lead automatically.
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--hs-link)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[var(--hs-link-hover)] disabled:opacity-60 transition-colors"
        >
          {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          New Form
        </button>
      </div>

      <div className="rounded-md border border-[var(--surface-dim)] bg-white overflow-hidden shadow-sm p-6">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2 size={28} className="animate-spin text-[var(--primary-muted)]" />
            <p className="text-xs font-semibold text-[var(--primary-muted)] uppercase tracking-wider">
              Loading forms…
            </p>
          </div>
        ) : forms.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-[var(--background)] rounded-md border border-[var(--surface-dim)] flex items-center justify-center mb-4">
              <ClipboardList size={28} className="text-[var(--primary-muted)]" />
            </div>
            <h3 className="text-sm font-semibold text-[var(--text-main)]">No forms yet</h3>
            <p className="text-sm text-[var(--primary-muted)] max-w-xs mt-1">
              Create your first lead-capture form to embed on a landing page or use with Meta/Google Ads.
            </p>
            <button
              onClick={handleCreate}
              className="mt-5 inline-flex items-center gap-2 rounded-md bg-[var(--hs-link)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--hs-link-hover)] transition-colors"
            >
              <Plus size={14} /> New Form
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {forms.map((form) => (
              <Link
                key={form._id}
                href={`/crm/settings/forms/${form._id}`}
                className="group relative flex flex-col gap-3 rounded-md border border-[var(--surface-dim)] bg-white p-5 hover:border-[var(--hs-link)]/30 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#fff3f0] text-[var(--hs-link)]">
                    <ClipboardList size={16} />
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handleDelete(form, e)}
                      className="p-1.5 rounded-md hover:bg-rose-50 text-[var(--primary-muted)] hover:text-rose-600 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-main)]">{form.name}</h3>
                  <p className="text-xs text-[var(--primary-muted)] mt-0.5 line-clamp-2">
                    {form.description || `${form.fields.length} field${form.fields.length === 1 ? "" : "s"}`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-[var(--surface-dim)]">
                  <span
                    className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold ${
                      form.isActive
                        ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                        : "bg-[var(--background)] border-[var(--surface-dim)] text-[var(--text-muted)]"
                    }`}
                  >
                    {form.isActive ? "Active" : "Inactive"}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[var(--background)] border border-[var(--surface-dim)] text-xs font-semibold text-[var(--text-muted)]">
                    <Users size={11} /> {form.submissionCount || 0} submission{form.submissionCount === 1 ? "" : "s"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
