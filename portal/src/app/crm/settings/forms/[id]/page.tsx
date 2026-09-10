"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ClipboardList,
  Code2,
  Loader2,
  Save,
  Settings2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { getForm, updateForm, normalizeLeadDefaults, type FormDefinition, type FormField } from "@/lib/crm/forms";
import FormFieldsBuilder from "@/components/crm/forms/FormFieldsBuilder";
import FormLivePreview from "@/components/crm/forms/FormLivePreview";
import FormSettingsTab from "@/components/crm/forms/FormSettingsTab";
import FormEmbedTab from "@/components/crm/forms/FormEmbedTab";
import FormSubmissionsTab from "@/components/crm/forms/FormSubmissionsTab";
import { CRM_BTN_PRIMARY, CRM_COUNT_BADGE, CRM_PANEL } from "@/lib/crm/ui";
import { CRM_HS_CONTROL_CLASS, CRM_HS_LABEL_CLASS } from "@/components/crm/records/forms/crm-form-primitives";
import { cn } from "@/lib/utils";

const LBL = CRM_HS_LABEL_CLASS;
const INP = CRM_HS_CONTROL_CLASS;

type Tab = "builder" | "settings" | "embed" | "submissions";

function snapshot(form: FormDefinition) {
  return JSON.stringify({
    name: form.name,
    description: form.description || "",
    fields: form.fields,
    isActive: form.isActive,
    submitButtonLabel: form.submitButtonLabel,
    successMessage: form.successMessage,
    redirectUrl: form.redirectUrl || "",
    accentColor: form.accentColor || "",
    leadDefaults: normalizeLeadDefaults(form.leadDefaults),
  });
}

export default function EditFormPage() {
  const params = useParams();
  const id = String(params?.id || "");

  const [form, setForm] = useState<FormDefinition | null>(null);
  const [savedSnap, setSavedSnap] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("builder");

  const dirty = useMemo(() => (form ? snapshot(form) !== savedSnap : false), [form, savedSnap]);

  const fetchForm = async () => {
    setLoading(true);
    try {
      const data = await getForm(id);
      setForm(data);
      setSavedSnap(snapshot(data));
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

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  const handleSave = async () => {
    if (!form) return;
    const name = form.name.trim();
    if (!name) {
      toast.error("Give this form a name");
      return;
    }
    setSaving(true);
    try {
      const saved = await updateForm(form._id, {
        name,
        description: form.description,
        fields: form.fields,
        isActive: form.isActive,
        submitButtonLabel: form.submitButtonLabel,
        successMessage: form.successMessage,
        redirectUrl: form.redirectUrl,
        accentColor: form.accentColor,
        leadDefaults: normalizeLeadDefaults(form.leadDefaults),
      });
      setForm(saved);
      setSavedSnap(snapshot(saved));
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
        <Loader2 size={28} className="animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (!form) {
    return <p className="text-sm text-[var(--text-muted)]">Form not found.</p>;
  }

  const tabs = [
    ["builder", "Builder", ClipboardList],
    ["settings", "Settings", Settings2],
    ["embed", "Embed", Code2],
    ["submissions", "Submissions", Users],
  ] as const;

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Link
            href="/crm/settings/forms"
            className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
          >
            <ChevronLeft size={14} /> Forms
          </Link>
          <input
            className="crm-inline-title-input block w-full max-w-xl appearance-none bg-transparent text-[22px] font-bold leading-tight text-[var(--text-main)] px-0 py-0.5 -ml-0"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Form name"
            aria-label="Form name"
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {dirty && (
              <span className="text-xs font-medium text-amber-700">Unsaved changes</span>
            )}
            <span className={CRM_COUNT_BADGE}>
              {form.submissionCount || 0} submission{(form.submissionCount || 0) === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={form.isActive}
            onClick={() => setForm({ ...form, isActive: !form.isActive })}
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-main)]"
          >
            <span
              className={cn(
                "relative h-5 w-9 rounded-full transition-colors",
                form.isActive ? "bg-emerald-500" : "bg-[var(--surface-dim)]",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                  form.isActive && "translate-x-4",
                )}
              />
            </span>
            {form.isActive ? "Active" : "Inactive"}
          </button>
          <button onClick={handleSave} disabled={saving} className={CRM_BTN_PRIMARY}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Save
          </button>
        </div>
      </div>

      <div className={cn(CRM_PANEL, "crm-form-editor overflow-visible")}>
        <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--border-color)] px-3 no-scrollbar">
          {tabs.map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                tab === key
                  ? "border-[var(--primary)] text-[var(--primary)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]",
              )}
            >
              <Icon size={14} /> {label}
              {key === "submissions" && (form.submissionCount || 0) > 0 ? (
                <span className="tabular-nums text-xs">{form.submissionCount}</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="p-5 sm:p-6">
          {tab === "builder" && (
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
              <div className="space-y-5 min-w-0">
                <div>
                  <label className={LBL}>Description (optional)</label>
                  <textarea
                    className={`${INP} h-20 py-2`}
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
              <div className="xl:sticky xl:top-4">
                <FormLivePreview
                  name={form.name}
                  description={form.description}
                  fields={form.fields}
                  submitButtonLabel={form.submitButtonLabel}
                  accentColor={form.accentColor}
                />
              </div>
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
