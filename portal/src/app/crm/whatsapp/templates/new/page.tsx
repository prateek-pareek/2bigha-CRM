"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { CrmButton } from "@/components/crm/ui";
import TemplateComponentsBuilder, {
  EMPTY_TEMPLATE_DRAFT,
  draftToComponents,
  type TemplateDraft,
} from "@/components/crm/whatsapp/TemplateComponentsBuilder";

export default function NewWhatsAppTemplatePage() {
  const router = useRouter();
  const [draft, setDraft] = useState<TemplateDraft>(EMPTY_TEMPLATE_DRAFT);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!draft.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!draft.bodyText.trim()) {
      toast.error("Body text is required");
      return;
    }
    setSaving(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp-templates`, {
        method: "POST",
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
        toast.error(data?.message || "Failed to save draft");
        return;
      }
      toast.success("Draft saved");
      router.push(`/crm/whatsapp/templates/${data._id}`);
    } catch {
      toast.error("Failed to save draft");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex items-start gap-3">
        <Link
          href="/crm/whatsapp/templates"
          className="mt-0.5 rounded-full p-2 text-text-muted transition-colors hover:bg-slate-100 hover:text-text-main"
        >
          <ChevronLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-medium tracking-tight text-text-main">New template</h1>
          <p className="text-sm font-medium text-text-muted">
            Save as a draft first, then submit for Meta&apos;s review once you&apos;re happy with it.
          </p>
        </div>
      </div>

      <TemplateComponentsBuilder draft={draft} onChange={setDraft} />

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Link href="/crm/whatsapp/templates">
          <CrmButton variant="secondary" className="h-10">
            Cancel
          </CrmButton>
        </Link>
        <CrmButton
          variant="primary"
          disabled={saving}
          onClick={() => void save()}
          className="h-10 gap-2 bg-emerald-600 hover:bg-emerald-700"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Save draft
        </CrmButton>
      </div>
    </div>
  );
}
