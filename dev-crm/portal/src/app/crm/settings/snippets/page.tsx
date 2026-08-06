"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Braces,
  Plus,
  Search,
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronDown,
  Check,
  X,
  Save,
  Loader2,
  Copy,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { createPortal } from "react-dom";
import { CRM_API_URL } from '@/lib/crm/config';
import { EMAIL_TEMPLATE_MERGE_GROUPS } from "@/lib/crm/email-template-merge-fields";
import { emailTemplateBodyToEditorHtml } from "@/lib/crm/email-template-fill";
import RichTextEditor from '@/components/suite/editors/RichTextEditor';
import {
  copyPlainTextToClipboard,
  snippetHtmlToPlainText,
} from "@/lib/crm/snippet-clipboard";
import CrmSlidePanelShell from "@/components/crm/shell/CrmSlidePanelShell";

function SimpleSelect({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={`flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 text-sm transition-all ${
          open
            ? "border-[var(--hs-link)] bg-[#fff8f6] ring-1 ring-[var(--hs-link)]/20"
            : "border-[var(--border-color)] bg-white text-[var(--text-main)] hover:border-[var(--hs-link)]/60 hover:bg-[#fff8f6]"
        }`}
      >
        <span className="text-[var(--text-main)]">{selected?.label}</span>
        <ChevronDown size={13} className={`shrink-0 text-[var(--primary-muted)] transition-transform ${open ? "rotate-180 text-[var(--hs-link)]" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-[var(--border-color)] bg-white shadow-[0_4px_16px_rgba(0,0,0,0.10)] overflow-hidden">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`flex w-full items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-[#fff3ef] hover:text-[#b94b36] ${
                o.value === value ? "bg-[#fff3ef] text-[#b94b36] font-medium" : "text-[var(--text-main)]"
              }`}
            >
              {o.label}
              {o.value === value && <Check size={12} className="text-[var(--hs-link)]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const LBL = "block text-xs font-semibold text-[var(--text-muted)] mb-1";
const INP =
  "w-full h-9 bg-white border border-[var(--border-color)] rounded-md px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--primary-muted)] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all";
import {
  formatCategorySummary,
  type CategoryAudience,
  type CategoryMaterial,
} from "@/lib/crm/snippet-template-categories";

interface ServiceOfferingRef {
  _id: string;
  name?: string;
}

interface Snippet {
  _id: string;
  name: string;
  shortcut?: string;
  body?: string;
  isActive?: boolean;
  updatedAt: string;
  serviceOfferingIds?: string[] | ServiceOfferingRef[];
  categoryAudience?: CategoryAudience | string;
  categoryMaterial?: CategoryMaterial | string;
}

const EMPTY_FORM = {
  name: "",
  shortcut: "",
  body: "",
  serviceOfferingIds: [] as string[],
  categoryAudience: "all" as CategoryAudience,
  categoryMaterial: "all" as CategoryMaterial,
};

function normalizeSnippetServiceIds(s: Snippet): string[] {
  const raw = s.serviceOfferingIds;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) =>
    typeof x === "object" && x !== null && "_id" in x
      ? String((x as ServiceOfferingRef)._id)
      : String(x),
  );
}

type ServiceRow = { _id: string; name: string; isActive?: boolean };

export default function CrmSnippetsSettingsPage() {
  const router = useRouter();
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Snippet | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const fetchSnippets = async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/snippets?includeInactive=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { router.push("/auth/login?error=unauthorized"); return; }
      if (res.ok) {
        const text = await res.text();
        const data = text ? JSON.parse(text) : [];
        setSnippets(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to fetch snippets:", err);
      setSnippets([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchServices = async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/service-offerings?includeInactive=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setServices(Array.isArray(data) ? data : []);
      }
    } catch {
      setServices([]);
    }
  };

  useEffect(() => {
    fetchSnippets();
    fetchServices();
  }, []);
  useEffect(() => { fetchSnippets(); }, []);

  const copySnippetPlain = async (html: string, label?: string) => {
    const plain = snippetHtmlToPlainText(html);
    const ok = await copyPlainTextToClipboard(plain);
    if (ok) toast.success(label ? `Copied: ${label}` : "Copied to clipboard");
    else toast.error("Could not copy—try again or check browser permissions.");
  };

  const openCreate = () => {
    setEditing(null);
    setFormData({ ...EMPTY_FORM });
    setIsModalOpen(true);
  };

  const openEdit = (s: Snippet) => {
    setEditing(s);
    setFormData({
      name: s.name,
      shortcut: s.shortcut || "",
      body: emailTemplateBodyToEditorHtml(s.body || ""),
      serviceOfferingIds: normalizeSnippetServiceIds(s),
      categoryAudience: (s.categoryAudience as CategoryAudience) || "all",
      categoryMaterial: (s.categoryMaterial as CategoryMaterial) || "all",
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const token = localStorage.getItem("token");
    try {
      const method = editing ? "PUT" : "POST";
      const url = editing ? `${CRM_API_URL}/snippets/${editing._id}` : `${CRM_API_URL}/snippets`;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: formData.name,
          shortcut: formData.shortcut || undefined,
          body: formData.body,
          serviceOfferingIds: formData.serviceOfferingIds,
          categoryAudience: formData.categoryAudience,
          categoryMaterial: formData.categoryMaterial,
          ...(editing ? { isActive: editing.isActive !== false } : {}),
        }),
      });
      if (res.ok) {
        toast.success(editing ? "Snippet updated" : "Snippet created");
        setIsModalOpen(false);
        fetchSnippets();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || "Failed to save snippet");
      }
    } catch (e) {
      console.error(e);
      toast.error("An error occurred");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this snippet?")) return;
    const token = localStorage.getItem("token");
    const res = await fetch(`${CRM_API_URL}/snippets/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { toast.success("Snippet deleted"); fetchSnippets(); }
    else toast.error("Failed to delete snippet");
  };

  const filtered = snippets.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.shortcut || "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link href="/crm/settings" className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--hs-link)] transition-colors">
            <ChevronLeft size={14} /> Settings
          </Link>
          <h1 className="text-[22px] font-semibold text-[var(--text-main)] flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#fff3f0] text-[var(--hs-link)]">
              <Braces size={20} />
            </span>
            Snippets
          </h1>
          <p className="text-sm text-[var(--primary-muted)] mt-1 max-w-2xl">
            Saved text you can paste anywhere — notes, links, messages, or email.
            Use <span className="font-semibold text-[var(--text-muted)]">Copy</span> for plain text, or insert from the inbox email composer when you need HTML.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--hs-link)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[var(--hs-link-hover)] transition-colors shrink-0"
        >
          <Plus size={15} />
          New snippet
        </button>
      </div>

      {/* Search + list */}
      <div className="rounded-md border border-[var(--surface-dim)] bg-white overflow-hidden shadow-sm">
        {/* Search bar */}
        <div className="border-b border-[var(--surface-dim)] bg-[var(--background)] px-5 py-3 flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--primary-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name or shortcut…"
              className="w-full h-8 pl-8 pr-3 bg-white border border-[var(--border-color)] rounded-md text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--primary-muted)] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-xs text-[var(--primary-muted)] hover:text-[var(--text-main)] transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
          {loading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-md bg-[var(--background)] border border-[var(--surface-dim)]" />
            ))
          ) : filtered.length === 0 ? (
            <div className="col-span-full py-20 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-md bg-[#fff3f0] text-[var(--hs-link)]">
                <Braces size={26} />
              </div>
              <p className="text-sm font-semibold text-[var(--text-main)]">No snippets yet</p>
              <p className="mt-1 text-sm text-[var(--primary-muted)]">Create one, then copy it into any field or note.</p>
              <button
                type="button"
                onClick={openCreate}
                className="mt-5 inline-flex items-center gap-2 rounded-md bg-[var(--hs-link)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--hs-link-hover)] transition-colors"
              >
                <Plus size={14} /> New snippet
              </button>
            </div>
          ) : (
            filtered.map((s) => (
              <div
                key={s._id}
                className="group flex flex-col justify-between rounded-md border border-[var(--surface-dim)] bg-white p-5 transition-all hover:border-[var(--hs-link)]/30 hover:shadow-sm"
              >
                <div>
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#fff3f0] text-[var(--hs-link)]">
                      <Braces size={16} />
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => copySnippetPlain(s.body || "", s.name)}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--background)] transition-colors"
                        title="Copy as plain text"
                      >
                        <Copy size={11} /> Copy
                      </button>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${s.isActive !== false
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                          : "bg-[var(--background)] text-[var(--primary-muted)] ring-1 ring-[var(--surface-dim)]"
                        }`}>
                        {s.isActive !== false ? "Active" : "Off"}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-sm font-semibold text-[var(--text-main)] line-clamp-1 group-hover:text-[var(--hs-link)] transition-colors">
                    {s.name}
                  </h3>
                  {s.shortcut ? (
                    <p className="mt-1 font-mono text-xs text-[var(--primary-muted)] line-clamp-1">/{s.shortcut}</p>
                  ) : (
                    <p className="mt-1 text-xs text-[var(--primary-muted)]">No shortcut</p>
                  )}
                  <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                    {formatCategorySummary(s.categoryAudience, s.categoryMaterial)}
                  </p>
                  <p className="mt-2 line-clamp-2 text-xs font-medium text-text-muted">
                    {(() => {
                      const raw = s.serviceOfferingIds;
                      if (!Array.isArray(raw) || raw.length === 0) {
                        return <span className="opacity-70">No services linked</span>;
                      }
                      const labels = raw
                        .map((x) => {
                          if (typeof x === "object" && x !== null && "name" in x) {
                            return String((x as ServiceOfferingRef).name || "").trim();
                          }
                          const id = String(x);
                          return services.find((sv) => sv._id === id)?.name || "";
                        })
                        .filter(Boolean);
                      return labels.length ? labels.join(" · ") : "Services";
                    })()}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[var(--surface-dim)] pt-3">
                  <span className="text-xs text-[var(--primary-muted)]">
                    {new Date(s.updatedAt).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(s)}
                      className="p-1.5 rounded-md text-[var(--primary-muted)] hover:bg-[var(--background)] hover:text-[var(--hs-link)] transition-colors"
                      title="Edit"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(s._id)}
                      className="p-1.5 rounded-md text-[var(--primary-muted)] hover:bg-rose-50 hover:text-rose-600 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Slide panel */}
      {isModalOpen && typeof document !== "undefined" && createPortal(
        <CrmSlidePanelShell
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editing ? "Edit snippet" : "New snippet"}
          subtitle="Saved text you can paste anywhere or insert from the email composer."
          headerTone="hubspot"
          footer={
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => copySnippetPlain(formData.body, formData.name)}
                disabled={!formData.body.trim()}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--background)] transition-colors disabled:opacity-40"
              >
                <Copy size={14} /> Copy plain
              </button>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-md border border-[var(--border-color)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--background)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !formData.name.trim() || !formData.body.trim()}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[var(--hs-link)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--hs-link-hover)] transition-colors shadow-sm disabled:opacity-50"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {saving ? "Saving…" : editing ? "Save changes" : "Save snippet"}
              </button>
            </div>
          }
        >
          <div className="space-y-5">
            {/* Name */}
            <div>
              <label className={LBL}>Name <span className="text-[#f2545b]">*</span></label>
              <input
                className={INP}
                placeholder="e.g. Standard intro"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            {/* Shortcut */}
            <div>
              <label className={LBL}>Shortcut <span className="font-normal text-[var(--primary-muted)]">(optional)</span></label>
              <input
                className={INP}
                placeholder="e.g. intro"
                value={formData.shortcut}
                onChange={(e) => setFormData({ ...formData, shortcut: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className={LBL}>
                Services <span className="font-normal text-[var(--primary-muted)]">(optional)</span>
              </label>
              <p className="text-xs leading-relaxed text-[var(--primary-muted)]">
                Link to offerings from{" "}
                <span className="font-semibold text-[var(--text-muted)]">Settings → Services</span>.
                Helps filter snippets in the email composer.
              </p>
              <div className="max-h-[140px] space-y-1 overflow-y-auto rounded-md border border-[var(--surface-dim)] bg-[var(--background)] p-3">
                {services.filter((sv) => sv.isActive !== false).length === 0 ? (
                  <p className="text-xs text-[var(--primary-muted)]">
                    No services yet. Add them under CRM → Services.
                  </p>
                ) : (
                  services
                    .filter((sv) => sv.isActive !== false)
                    .map((sv) => (
                      <label
                        key={sv._id}
                        className="flex cursor-pointer items-center gap-2.5 py-1 text-sm text-[var(--text-main)] hover:text-[var(--hs-link)] transition-colors"
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded-[2px] border-[var(--border-color)] accent-[var(--hs-link)]"
                          checked={formData.serviceOfferingIds.includes(sv._id)}
                          onChange={(e) => {
                            setFormData((prev) => ({
                              ...prev,
                              serviceOfferingIds: e.target.checked
                                ? [...prev.serviceOfferingIds, sv._id]
                                : prev.serviceOfferingIds.filter((id) => id !== sv._id),
                            }));
                          }}
                        />
                        <span className="leading-tight font-medium">{sv.name}</span>
                      </label>
                    ))
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={LBL}>Audience</label>
                <SimpleSelect
                  value={formData.categoryAudience}
                  onChange={(v) => setFormData((prev) => ({ ...prev, categoryAudience: v as CategoryAudience }))}
                  options={[
                    { value: "all", label: "Any (general)" },
                    { value: "agency", label: "Agency" },
                    { value: "freelancer", label: "Freelancer" },
                  ]}
                />
              </div>
              <div>
                <label className={LBL}>Focus</label>
                <SimpleSelect
                  value={formData.categoryMaterial}
                  onChange={(v) => setFormData((prev) => ({ ...prev, categoryMaterial: v as CategoryMaterial }))}
                  options={[
                    { value: "all", label: "Any (general)" },
                    { value: "cv", label: "CV" },
                    { value: "portfolio", label: "Portfolio" },
                    { value: "case_study", label: "Case study" },
                  ]}
                />
              </div>
            </div>

            {/* Content */}
            <div>
              <label className={LBL}>Content <span className="text-[#f2545b]">*</span></label>
              <div className="rounded-md border border-[var(--border-color)] overflow-hidden focus-within:border-[var(--hs-link)] focus-within:ring-1 focus-within:ring-[var(--hs-link)]/30 transition-all">
                <RichTextEditor
                  key={editing?._id ?? "new"}
                  content={formData.body}
                  onChange={(html) => setFormData((prev) => ({ ...prev, body: html }))}
                  placeholder="Text, links, bullets… Optional merge tokens for email composer."
                  className="min-h-[200px] max-h-[320px] border-0 rounded-none bg-transparent shadow-none"
                />
              </div>
            </div>

            {/* Merge fields */}
            <details className="rounded-md border border-[var(--surface-dim)] bg-[var(--background)] px-4 py-3 text-xs">
              <summary className="cursor-pointer select-none text-xs font-semibold text-[var(--text-muted)]">
                Merge fields (email composer)
              </summary>
              <p className="mt-2 text-xs leading-relaxed text-[var(--primary-muted)]">
                When inserted from the email composer, these tokens fill from the linked record.
              </p>
              <div className="mt-3 max-h-40 space-y-2 overflow-y-auto border-t border-[var(--surface-dim)] pt-3">
                {EMAIL_TEMPLATE_MERGE_GROUPS.map((g) => (
                  <div key={g.title}>
                    <p className="text-xs font-bold uppercase tracking-wide text-[var(--primary-muted)]">{g.title}</p>
                    <p className="mt-0.5 break-words font-mono text-xs leading-relaxed text-[var(--text-main)]">
                      {g.fields.map((f) => `{{${f}}}`).join(" · ")}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          </div>
        </CrmSlidePanelShell>,
        document.body
      )}
    </div>
  );
}
