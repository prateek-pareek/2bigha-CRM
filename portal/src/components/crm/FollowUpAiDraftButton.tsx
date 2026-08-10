"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";
import { CRM_API_URL } from "@/lib/api/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";

type Props = {
  entityType: "Lead" | "Contact";
  entityId: string;
  /** Passed to draft-person-email as extra instructions. */
  contextInstructions: string;
  available: boolean | null;
  disabled?: boolean;
  onDraft: (subject: string, bodyHtml: string) => void;
};

export function FollowUpAiDraftButton({
  entityType,
  entityId,
  contextInstructions,
  available,
  disabled,
  onDraft,
}: Props) {
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextGap, setContextGap] = useState<string[] | null>(null);

  if (available === false) {
    return (
      <span
        className="max-w-[200px] text-[11px] leading-snug text-[var(--text-muted)]"
        title="Set ANTHROPIC_API_KEY and enable CRM Settings → AI outreach."
      >
        AI draft unavailable
      </span>
    );
  }

  const module = entityType === "Lead" ? "leads" : "contacts";
  const checking = available === null;

  const checkContext = async (token: string) => {
    const res = await fetch(`${CRM_API_URL}/crm/ai/check-outreach-context`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ module, entityId }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { missingLabels?: string[] };
    return data.missingLabels?.length ? data.missingLabels : null;
  };

  const runDraft = async () => {
    setLoading(true);
    try {
      const token = getCrmAuthToken();
      if (!token) {
        toast.error("Sign in again to use AI draft");
        return;
      }
      const gaps = await checkContext(token);
      setContextGap(gaps);
      const extra = instructions.trim();
      const combined = [contextInstructions, extra].filter(Boolean).join("\n\n");
      const res = await fetch(`${CRM_API_URL}/crm/ai/draft-person-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          module,
          entityId,
          instructions: combined || undefined,
          skipContextCheck: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string | string[];
        subject?: string;
        bodyHtml?: string;
      };
      if (!res.ok) {
        const raw = data.message;
        const msg = Array.isArray(raw)
          ? raw.join(", ")
          : typeof raw === "string"
            ? raw
            : (data as { error?: string }).error ||
              `Could not generate draft (${res.status})`;
        toast.error(msg);
        return;
      }
      if (data.subject && data.bodyHtml) {
        onDraft(data.subject, data.bodyHtml);
        setOpen(false);
        setInstructions("");
        setContextGap(null);
        toast.success(
          gaps?.length
            ? "AI draft inserted — some context was missing; review before scheduling"
            : "AI draft inserted — review before scheduling",
        );
      } else {
        toast.error("AI returned an empty draft");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || loading || checking}
          title={checking ? "Checking AI availability…" : undefined}
          className="h-8 gap-1.5 rounded-[var(--crm-radius-ui)] border-[var(--border-color)] text-xs font-semibold text-[var(--text-main)] shadow-none hover:bg-[var(--surface-hover)]"
        >
          {loading || checking ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} className="text-violet-600" />
          )}
          {checking ? "AI…" : "Draft with AI"}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[10050] w-[min(100vw-2rem,360px)] p-4 flex flex-col gap-3 bg-white border border-[var(--border-color)] shadow-xl"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="text-xs font-semibold leading-snug text-[var(--text-main)]">
          Uses lead/contact + pipeline context and{" "}
          <Link
            href="/crm/settings/ai-outreach"
            className="text-[var(--hs-link)] underline"
          >
            AI outreach settings
          </Link>
          . Edit subject and body before scheduling.
        </p>
        {contextGap?.length ? (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
            Missing context: {contextGap.join(", ")}. The draft will still generate
            and may ask a clarifying question.
          </p>
        ) : null}
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Optional: tone, angle, or points to include…"
          rows={3}
          className="w-full resize-y rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--color-input)] px-2.5 py-2 text-xs text-[var(--text-main)] outline-none focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]"
        />
        <Button
          type="button"
          size="sm"
          disabled={loading}
          onClick={() => void runDraft()}
          className="h-9 w-full gap-2 rounded-[var(--crm-radius-ui)] bg-[var(--hs-link)] text-xs font-bold text-white hover:opacity-90"
        >
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles size={14} />
              Generate draft
            </>
          )}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
