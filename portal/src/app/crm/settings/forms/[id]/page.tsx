"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ClipboardList,
  Code2,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  Save,
  Settings2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  getForm,
  listSubmissions,
  updateForm,
  type FormDefinition,
  type FormField,
  type FormSubmission,
} from "@/lib/crm/forms";
import FormFieldsBuilder from "@/components/crm/forms/FormFieldsBuilder";

const LBL = "block text-xs font-semibold text-[var(--text-muted)] mb-1";
const INP =
  "w-full h-9 bg-white border border-[var(--border-color)] rounded-md px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--primary-muted)] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all";

type Tab = "builder" | "settings" | "embed" | "submissions";

function getPortalOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_APP_URL || "";
}

export default function EditFormPage() {
  const params = useParams();
  const id = String(params?.id || "");

  const [form, setForm] = useState<FormDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("builder");

  const fetchForm = async () => {
    setLoading(true);
    try {
      setForm(await getForm(id));
    } catch (err) {
      console.error("Failed to fetch form:", err);
      toast.error("Failed to load form");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const saved = await updateForm(form._id, {
        name: form.name,
        description: form.description,
        fields: form.fields,
        isActive: form.isActive,
        submitButtonLabel: form.submitButtonLabel,
        successMessage: form.successMessage,
        redirectUrl: form.redirectUrl,
        accentColor: form.accentColor,
      });
      setForm(saved);
      toast.success("Form saved");
    } catch (err: any) {
      console.error("Failed to save form:", err);
      toast.error(err?.response?.data?.message || "Failed to save form");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3">
        <Loader2 size={28} className="animate-spin text-[var(--primary-muted)]" />
      </div>
    );
  }

  if (!form) {
    return <p className="text-sm text-[var(--text-muted)]">Form not found.</p>;
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/crm/settings/forms"
            className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--hs-link)] transition-colors"
          >
            <ChevronLeft size={14} /> Forms
          </Link>
          <input
            className="text-[22px] font-semibold text-[var(--text-main)] bg-transparent outline-none border-b border-transparent hover:border-[var(--border-color)] focus:border-[var(--hs-link)] transition-colors max-w-lg"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <label className="flex items-center gap-2 text-sm text-[var(--text-main)] cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="h-4 w-4 rounded border-[var(--border-color)] text-[var(--hs-link)] focus:ring-[var(--hs-link)]/30"
            />
            Active
          </label>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--hs-link)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[var(--hs-link-hover)] disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Save
          </button>
        </div>
      </div>

      <div className="rounded-md border border-[var(--surface-dim)] bg-white overflow-hidden shadow-sm">
        <div className="flex items-center gap-1 border-b border-[var(--surface-dim)] bg-[var(--background)] px-4 py-2 overflow-x-auto">
          {(
            [
              ["builder", "Builder", ClipboardList],
              ["settings", "Settings", Settings2],
              ["embed", "Embed", Code2],
              ["submissions", "Submissions", Users],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-md text-xs font-semibold transition-all ${
                tab === key
                  ? "bg-white text-[var(--hs-link)] border border-[var(--surface-dim)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-white/60"
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === "builder" && (
            <div className="space-y-5 max-w-2xl">
              <div>
                <label className={LBL}>Description (optional)</label>
                <input
                  className={INP}
                  placeholder="Shown at the top of the form"
                  value={form.description || ""}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <FormFieldsBuilder
                fields={form.fields}
                onChange={(fields: FormField[]) => setForm({ ...form, fields })}
              />
            </div>
          )}

          {tab === "settings" && <FormSettingsTab form={form} onChange={setForm} />}
          {tab === "embed" && <FormEmbedTab form={form} />}
          {tab === "submissions" && <FormSubmissionsTab formId={form._id} fields={form.fields} />}
        </div>
      </div>
    </div>
  );
}

function FormSettingsTab({
  form,
  onChange,
}: {
  form: FormDefinition;
  onChange: (form: FormDefinition) => void;
}) {
  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <label className={LBL}>Submit button label</label>
        <input
          className={INP}
          value={form.submitButtonLabel}
          onChange={(e) => onChange({ ...form, submitButtonLabel: e.target.value })}
        />
      </div>
      <div>
        <label className={LBL}>Success message</label>
        <textarea
          className={`${INP} h-20 py-2`}
          value={form.successMessage}
          onChange={(e) => onChange({ ...form, successMessage: e.target.value })}
        />
      </div>
      <div>
        <label className={LBL}>Redirect URL (optional)</label>
        <input
          className={INP}
          placeholder="https://example.com/thank-you"
          value={form.redirectUrl || ""}
          onChange={(e) => onChange({ ...form, redirectUrl: e.target.value })}
        />
        <p className="mt-1 text-xs text-[var(--primary-muted)]">
          If set, visitors are redirected here instead of seeing the success message — useful for Meta/Google
          Ads conversion tracking pixels.
        </p>
      </div>
      <div>
        <label className={LBL}>Accent color (optional)</label>
        <input
          type="color"
          className="h-9 w-16 rounded-md border border-[var(--border-color)] cursor-pointer"
          value={form.accentColor || "#ff5c35"}
          onChange={(e) => onChange({ ...form, accentColor: e.target.value })}
        />
      </div>
    </div>
  );
}

function FormEmbedTab({ form }: { form: FormDefinition }) {
  const [copied, setCopied] = useState<string | null>(null);
  const origin = useMemo(getPortalOrigin, []);
  const hostedUrl = `${origin}/forms/${form._id}`;
  const iframeSnippet = `<iframe src="${hostedUrl}" style="width:100%;border:0;min-height:640px" title="${form.name.replace(/"/g, "'")}"></iframe>`;

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <p className="text-sm font-semibold text-[var(--text-main)] mb-2">Hosted form link</p>
        <p className="text-xs text-[var(--primary-muted)] mb-2">
          Use this as your Meta or Google Ads landing page URL, or share it directly.
        </p>
        <div className="flex items-center gap-2">
          <input readOnly className={`${INP} font-mono text-xs`} value={hostedUrl} />
          <button
            onClick={() => copy(hostedUrl, "url")}
            className="h-9 w-9 shrink-0 flex items-center justify-center rounded-md border border-[var(--border-color)] hover:bg-[var(--background)] transition-colors"
            title="Copy link"
          >
            {copied === "url" ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
          </button>
          <a
            href={hostedUrl}
            target="_blank"
            rel="noreferrer"
            className="h-9 w-9 shrink-0 flex items-center justify-center rounded-md border border-[var(--border-color)] hover:bg-[var(--background)] transition-colors"
            title="Open"
          >
            <ExternalLink size={14} />
          </a>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-[var(--text-main)] mb-2">Embed on your website</p>
        <p className="text-xs text-[var(--primary-muted)] mb-2">Paste this iframe snippet into any page's HTML.</p>
        <div className="relative">
          <pre className="rounded-md border border-[var(--surface-dim)] bg-[var(--background)] p-3 text-xs font-mono text-[var(--text-main)] overflow-x-auto whitespace-pre-wrap break-all">
            {iframeSnippet}
          </pre>
          <button
            onClick={() => copy(iframeSnippet, "iframe")}
            className="absolute top-2 right-2 h-8 w-8 flex items-center justify-center rounded-md border border-[var(--border-color)] bg-white hover:bg-[var(--background)] transition-colors"
            title="Copy snippet"
          >
            {copied === "iframe" ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      {!form.isActive && (
        <p className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
          This form is inactive — the hosted link and embed will show a "not found" message until you activate
          it (toggle at the top of the page).
        </p>
      )}
    </div>
  );
}

function FormSubmissionsTab({ formId, fields }: { formId: string; fields: FormField[] }) {
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await listSubmissions(formId, 1, 50);
        setSubmissions(res.items);
        setTotal(res.total);
      } catch (err) {
        console.error("Failed to fetch submissions:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [formId]);

  if (loading) {
    return (
      <div className="py-16 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-[var(--primary-muted)]" />
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="py-16 flex flex-col items-center justify-center text-center">
        <Users size={28} className="text-[var(--primary-muted)] mb-3" />
        <p className="text-sm font-semibold text-[var(--text-main)]">No submissions yet</p>
        <p className="text-xs text-[var(--primary-muted)] mt-1">Submissions will appear here as they come in.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[var(--primary-muted)] uppercase tracking-wider mb-2">
        {total} submission{total === 1 ? "" : "s"}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-[var(--primary-muted)] border-b border-[var(--surface-dim)]">
              <th className="py-2 pr-4">Submitted</th>
              {fields.slice(0, 3).map((f) => (
                <th key={f.key} className="py-2 pr-4">
                  {f.label}
                </th>
              ))}
              <th className="py-2 pr-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((s) => (
              <tr key={s._id} className="border-b border-[var(--surface-dim)] last:border-0">
                <td className="py-2 pr-4 text-[var(--text-muted)] whitespace-nowrap">
                  {new Date(s.createdAt).toLocaleString()}
                </td>
                {fields.slice(0, 3).map((f) => (
                  <td key={f.key} className="py-2 pr-4 text-[var(--text-main)] max-w-[200px] truncate">
                    {String(s.answers?.[f.key] ?? "—")}
                  </td>
                ))}
                <td className="py-2 pr-4">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      s.status === "failed"
                        ? "bg-rose-50 text-rose-600"
                        : s.status === "merged_into_existing"
                          ? "bg-amber-50 text-amber-600"
                          : "bg-emerald-50 text-emerald-600"
                    }`}
                  >
                    {s.status === "failed" ? "Failed" : s.status === "merged_into_existing" ? "Merged" : "New lead"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
