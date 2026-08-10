"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  Copy,
  ExternalLink,
  Loader2,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { CRM_API_URL } from "@/lib/api/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import {
  contactXProfileUrl,
  normalizeTwitterHandle,
  X_DM_CHAR_LIMIT,
} from "@/lib/crm/crm-x-messaging";
import { useCrmAiDraftAvailability } from "@/hooks/useCrmAiDraftAvailability";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Props = {
  entityType: "Lead" | "Contact";
  entityId: string;
  record: {
    firstName?: string;
    lastName?: string;
    twitterHandle?: string;
  };
  onHandleSaved?: (handle: string) => void;
  onDmLogged?: () => void;
};

export default function CrmXOutreachPanel({
  entityType,
  entityId,
  record,
  onHandleSaved,
  onDmLogged,
}: Props) {
  const module = entityType === "Lead" ? "leads" : "contacts";
  const aiAvailable = useCrmAiDraftAvailability(true);

  const [handleInput, setHandleInput] = useState(
    () => normalizeTwitterHandle(record.twitterHandle) || "",
  );
  const [savingHandle, setSavingHandle] = useState(false);
  const [message, setMessage] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [logging, setLogging] = useState(false);
  const [instructions, setInstructions] = useState("");

  const handle = normalizeTwitterHandle(handleInput || record.twitterHandle);
  const profileUrl = contactXProfileUrl({ twitterHandle: handle });
  const charCount = message.length;
  const overLimit = charCount > X_DM_CHAR_LIMIT;

  const saveHandle = useCallback(async () => {
    const normalized = normalizeTwitterHandle(handleInput);
    if (handleInput.trim() && !normalized) {
      toast.error("Enter a valid X handle (letters, numbers, underscore, max 15 chars)");
      return;
    }
    setSavingHandle(true);
    try {
      const token = getCrmAuthToken();
      if (!token) {
        toast.error("Sign in again");
        return;
      }
      const path = module === "leads" ? "leads" : "contacts";
      const res = await fetch(`${CRM_API_URL}/crm/${path}/${entityId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ twitterHandle: normalized || "" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as { message?: string }).message || "Could not save handle");
        return;
      }
      const updated = await res.json();
      const saved = normalizeTwitterHandle(updated.twitterHandle);
      setHandleInput(saved);
      onHandleSaved?.(saved);
      toast.success(saved ? `@${saved} saved` : "X handle cleared");
    } catch {
      toast.error("Network error");
    } finally {
      setSavingHandle(false);
    }
  }, [entityId, handleInput, module, onHandleSaved]);

  const runAiDraft = async () => {
    setDrafting(true);
    try {
      const token = getCrmAuthToken();
      if (!token) {
        toast.error("Sign in again");
        return;
      }
      const res = await fetch(`${CRM_API_URL}/crm/ai/draft-person-x-dm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          module,
          entityId,
          instructions: instructions.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        charCount?: number;
        twitterHandle?: string;
      };
      if (!res.ok) {
        const raw = (data as { message?: string | string[] }).message;
        const msg = Array.isArray(raw)
          ? raw.join(", ")
          : typeof raw === "string"
            ? raw
            : `Could not generate draft (${res.status})`;
        toast.error(msg);
        return;
      }
      if (data.message) {
        setMessage(data.message);
        if (data.twitterHandle && !handleInput) {
          setHandleInput(data.twitterHandle);
        }
        toast.success("AI draft ready — review before sending on X");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setDrafting(false);
    }
  };

  const copyMessage = async () => {
    if (!message.trim()) {
      toast.message("Write or generate a message first");
      return;
    }
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy");
    }
  };

  const logDmActivity = async () => {
    if (!message.trim()) {
      toast.message("Add a message to log");
      return;
    }
    setLogging(true);
    try {
      const token = getCrmAuthToken();
      if (!token) {
        toast.error("Sign in again");
        return;
      }
      const label = `${record.firstName || ""} ${record.lastName || ""}`.trim();
      const handleLabel = handle ? `@${handle}` : "X";
      const res = await fetch(`${CRM_API_URL}/crm/activities`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: "DM",
          content: `[X ${handleLabel}] ${message.trim()}`,
          relatedTo: entityId,
          relatedType: entityType,
          metadata: { channel: "twitter" },
        }),
      });
      if (!res.ok) {
        toast.error("Could not log activity");
        return;
      }
      toast.success("DM logged on timeline");
      onDmLogged?.();
    } catch {
      toast.error("Network error");
    } finally {
      setLogging(false);
    }
  };

  return (
    <div className="rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--card-bg)] p-4 shadow-[var(--crm-shadow-card)]">
      <div className="flex items-start gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-900 text-white">
          <MessageCircle size={16} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[var(--text-main)]">X outreach</h3>
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--text-muted)]">
            AI drafts a cold DM from CRM context. Copy and send manually on X — automated send
            comes in a later phase.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            X handle
          </label>
          <div className="mt-1 flex gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--text-muted)]">
                @
              </span>
              <input
                type="text"
                value={handleInput}
                onChange={(e) => setHandleInput(e.target.value.replace(/^@+/, ""))}
                placeholder="username"
                className="h-9 w-full rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--color-input)] pl-7 pr-2 text-sm outline-none focus:border-[var(--hs-link)]"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={savingHandle}
              onClick={() => void saveHandle()}
              className="h-9 shrink-0 text-xs font-semibold"
            >
              {savingHandle ? <Loader2 size={14} className="animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>

        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Optional AI instructions
          </label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={2}
            placeholder="Angle, offer, or tone for this DM…"
            className="mt-1 w-full resize-y rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--color-input)] px-2.5 py-2 text-xs outline-none focus:border-[var(--hs-link)]"
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Message
            </label>
            <span
              className={`text-[11px] tabular-nums ${overLimit ? "text-[var(--error)] font-semibold" : "text-[var(--text-muted)]"}`}
            >
              {charCount}/{X_DM_CHAR_LIMIT}
            </span>
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder="Draft your X DM…"
            className="mt-1 w-full resize-y rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--color-input)] px-2.5 py-2 text-sm outline-none focus:border-[var(--hs-link)]"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={drafting || aiAvailable === false}
            onClick={() => void runAiDraft()}
            className="h-8 gap-1.5 bg-violet-600 text-xs font-semibold text-white hover:bg-violet-700"
            title={
              aiAvailable === false
                ? "Enable CRM Settings → AI outreach and set ANTHROPIC_API_KEY"
                : undefined
            }
          >
            {drafting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            Draft with AI
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!message.trim()}
            onClick={() => void copyMessage()}
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            <Copy size={14} />
            Copy
          </Button>
          {profileUrl ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              asChild
              className="h-8 gap-1.5 text-xs font-semibold"
            >
              <a href={profileUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} />
                Open @{handle}
              </a>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={logging || !message.trim()}
            onClick={() => void logDmActivity()}
            className="h-8 text-xs font-semibold"
          >
            {logging ? <Loader2 size={14} className="animate-spin" /> : "Log sent DM"}
          </Button>
        </div>

        {aiAvailable === false ? (
          <p className="text-[11px] text-[var(--text-muted)]">
            AI draft needs{" "}
            <Link href="/crm/settings/ai-outreach" className="text-[var(--hs-link)] underline">
              AI outreach settings
            </Link>{" "}
            and <code className="text-[10px]">ANTHROPIC_API_KEY</code> on the server.
          </p>
        ) : null}

        {!handle ? (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2">
            Add an X handle to open their profile quickly after copying your message.
          </p>
        ) : (
          <p className="text-[11px] text-[var(--text-muted)]">
            On X: open @{handle} → Message → paste your draft. Then click Log sent DM.
          </p>
        )}
      </div>
    </div>
  );
}
