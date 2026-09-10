"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ClipboardList,
  Copy,
  Loader2,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { createForm, deleteForm, listForms, normalizeLeadDefaults, type FormDefinition } from "@/lib/crm/forms";
import { CRM_BTN_PRIMARY, CRM_H1, CRM_INPUT, CRM_LEAD, CRM_PANEL, CRM_TOOLBAR_SELECT } from "@/lib/crm/ui";
import { cn } from "@/lib/utils";

export default function FormsListPage() {
  const router = useRouter();
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return forms.filter((form) => {
      if (status === "active" && !form.isActive) return false;
      if (status === "inactive" && form.isActive) return false;
      if (!q) return true;
      return (
        form.name.toLowerCase().includes(q) ||
        (form.description || "").toLowerCase().includes(q)
      );
    });
  }, [forms, search, status]);

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

  const handleDuplicate = async (form: FormDefinition, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const copy = await createForm({
        name: `${form.name} (copy)`,
        description: form.description,
        fields: form.fields,
        isActive: false,
        submitButtonLabel: form.submitButtonLabel,
        successMessage: form.successMessage,
        redirectUrl: form.redirectUrl,
        accentColor: form.accentColor,
        leadDefaults: normalizeLeadDefaults(form.leadDefaults),
      });
      toast.success("Form duplicated");
      router.push(`/crm/settings/forms/${copy._id}`);
    } catch (err) {
      console.error("Failed to duplicate form:", err);
      toast.error("Failed to duplicate form");
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
            className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
          >
            <ChevronLeft size={14} /> Settings
          </Link>
          <h1 className={cn(CRM_H1, "flex items-center gap-3")}>
            <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-light)] text-[var(--primary)]">
              <ClipboardList size={20} />
            </span>
            Forms
          </h1>
          <p className={cn(CRM_LEAD, "mt-1")}>
            Build lead-capture forms for ads or your website — every submission becomes a Lead automatically.
          </p>
        </div>
        <button onClick={handleCreate} disabled={creating} className={CRM_BTN_PRIMARY}>
          {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          New Form
        </button>
      </div>

      <div className={cn(CRM_PANEL, "p-5 sm:p-6")}>
        {!loading && forms.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                className={`${CRM_INPUT} pl-8`}
                placeholder="Search forms…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className={CRM_TOOLBAR_SELECT}
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="all">All forms</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        )}

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2 size={28} className="animate-spin text-[var(--text-muted)]" />
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Loading forms…
            </p>
          </div>
        ) : forms.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-[var(--background)] rounded-[var(--radius-md)] border border-[var(--border-color)] flex items-center justify-center mb-4">
              <ClipboardList size={28} className="text-[var(--text-muted)]" />
            </div>
            <h3 className="text-sm font-semibold text-[var(--text-main)]">No forms yet</h3>
            <p className="text-sm text-[var(--text-muted)] max-w-xs mt-1">
              Create your first lead-capture form to embed on a landing page or use with Meta/Google Ads.
            </p>
            <button onClick={handleCreate} className={cn(CRM_BTN_PRIMARY, "mt-5")}>
              <Plus size={14} /> New Form
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-[var(--text-muted)]">No forms match your search.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((form) => (
              <Link
                key={form._id}
                href={`/crm/settings/forms/${form._id}`}
                className="group relative flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] p-5 hover:border-[var(--primary)]/30 hover:shadow-[var(--crm-shadow-card)] transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-light)] text-[var(--primary)]">
                    <ClipboardList size={16} />
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handleDuplicate(form, e)}
                      className="p-1.5 rounded-[var(--radius-md)] hover:bg-[var(--background)] text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
                      title="Duplicate"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={(e) => handleDelete(form, e)}
                      className="p-1.5 rounded-[var(--radius-md)] hover:bg-rose-50 text-[var(--text-muted)] hover:text-rose-600 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-main)]">{form.name}</h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">
                    {form.description ||
                      `${form.fields.length} field${form.fields.length === 1 ? "" : "s"}`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-[var(--border-color)]">
                  <span
                    className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold ${
                      form.isActive
                        ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                        : "bg-[var(--background)] border-[var(--border-color)] text-[var(--text-muted)]"
                    }`}
                  >
                    {form.isActive ? "Active" : "Inactive"}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[var(--background)] border border-[var(--border-color)] text-xs font-semibold text-[var(--text-muted)]">
                    <Users size={11} /> {form.submissionCount || 0}
                  </span>
                  {form.lastSubmissionAt && (
                    <span className="text-[11px] text-[var(--text-muted)]">
                      Last {new Date(form.lastSubmissionAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
