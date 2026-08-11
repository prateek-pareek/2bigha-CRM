"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2, RefreshCw, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { cn } from "@/lib/utils";
import { CrmButton } from "@/components/crm/ui";
import TemplateComponentsBuilder, {
  componentsToDraft,
  draftToComponents,
  type TemplateDraft,
} from "@/components/crm/whatsapp/TemplateComponentsBuilder";
import type { WhatsAppTemplateRecord } from "@/components/crm/whatsapp/types";

function statusTone(status: string): string {
  const s = status.toUpperCase();
  if (s === "APPROVED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "PENDING" || s === "SUBMITTED" || s === "IN_APPEAL")
    return "bg-amber-50 text-amber-700 border-amber-200";
  if (s === "REJECTED" || s === "DISABLED") return "bg-rose-50 text-rose-700 border-rose-200";
  if (s === "DRAFT") return "bg-slate-50 text-slate-600 border-slate-200";
  return "bg-sky-50 text-sky-700 border-sky-200";
}

export default function WhatsAppTemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<WhatsAppTemplateRecord | null>(null);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp-templates/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Failed to load template");
        return;
      }
      setTemplate(data);
      setDraft(
        componentsToDraft(
          { name: data.name, language: data.language, category: data.category },
          data.components || [],
        ),
      );
    } catch {
      toast.error("Failed to load template");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const editable = template ? ["DRAFT", "REJECTED"].includes(template.status) : false;

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp-templates/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: draft.name.trim(),
          language: draft.language,
          category: draft.category,
          components: draftToComponents(draft),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Failed to save");
        return;
      }
      toast.success("Draft saved");
      setTemplate(data);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp-templates/${id}/submit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Failed to submit");
        return;
      }
      toast.success("Submitted to Meta for approval");
      setTemplate(data);
    } catch {
      toast.error("Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  const resync = async () => {
    setSyncing(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp-templates/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        toast.error(data?.error || "Sync failed");
        return;
      }
      toast.success("Status refreshed");
      await load();
    } catch {
      toast.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const remove = async () => {
    if (!confirm("Delete this draft template?")) return;
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp-templates/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Failed to delete");
        return;
      }
      toast.success("Deleted");
      router.push("/crm/whatsapp/templates");
    } catch {
      toast.error("Failed to delete");
    }
  };

  if (loading || !template || !draft) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-xs text-text-muted">
        <Loader2 size={16} className="animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link
            href="/crm/whatsapp/templates"
            className="mt-0.5 rounded-full p-2 text-text-muted transition-colors hover:bg-slate-100 hover:text-text-main"
          >
            <ChevronLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-medium tracking-tight text-text-main">{template.name}</h1>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  statusTone(template.status),
                )}
              >
                {template.status}
              </span>
            </div>
            <p className="text-sm font-medium text-text-muted">
              {template.language} · {template.category}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CrmButton variant="secondary" disabled={syncing} onClick={() => void resync()} className="h-10 gap-2">
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh status
          </CrmButton>
          {editable && (
            <button
              type="button"
              onClick={() => void remove()}
              className="flex h-10 items-center gap-2 rounded-[var(--radius-md)] border border-border px-3 text-xs font-semibold text-text-muted hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>
      </div>

      {template.status === "REJECTED" && template.rejectionReason && (
        <div className="rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          Rejected by Meta: {template.rejectionReason}
        </div>
      )}
      {template.lastError && template.status === "REJECTED" && !template.rejectionReason && (
        <div className="rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {template.lastError}
        </div>
      )}
      {!editable && (
        <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This template has been submitted to Meta and can no longer be edited here.
        </div>
      )}
      {template.source === "meta" && (
        <div className="rounded-[var(--radius-md)] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          This template was created directly in Meta Business Manager — it&apos;s shown here read-only.
        </div>
      )}

      <TemplateComponentsBuilder draft={draft} onChange={setDraft} disabled={!editable} />

      {editable && (
        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <CrmButton variant="secondary" disabled={saving} onClick={() => void save()} className="h-10 gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save draft
          </CrmButton>
          <CrmButton
            variant="primary"
            disabled={submitting}
            onClick={() => void submit()}
            className="h-10 gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Submit for approval
          </CrmButton>
        </div>
      )}
    </div>
  );
}
