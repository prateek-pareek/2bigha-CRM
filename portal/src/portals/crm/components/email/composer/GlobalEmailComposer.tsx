"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { CrmJiraPortal } from "@/components/crm/shell/CrmJiraPortal";
import Link from "next/link";
import { X, Send, Info, Loader2, ExternalLink, AlertCircle, AlertTriangle, UserPlus, Mail, User, Paperclip, File, LayoutTemplate, Search, Braces, Copy, Sparkles, Users, ChevronDown, Check } from "lucide-react";
import { CRM_API_URL } from '@/lib/crm/config';
import { getCrmAuthToken } from "@/lib/crm/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import RichTextEditor from '@/components/suite/editors/RichTextEditor';
import { useEmailComposerStore } from "@/stores/emailComposerStore";
import { setLastSendFromAccountId } from "@/lib/crm/last-send-from-account";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import "@/app/crm/crm-hubspot.css";
import { fillEmailTemplateVariables } from "@/lib/crm/email-template-fill";
import {
  copyPlainTextToClipboard,
  snippetHtmlToPlainText,
} from "@/lib/crm/snippet-clipboard";
import {
  buildCrmEmailPreviewSrcDoc,
  escapeHtmlPlainText,
} from "@/lib/crm/email-preview-iframe";
import type {
  CategoryAudience,
  CategoryMaterial,
} from "@/lib/crm/snippet-template-categories";
import {
  formatCategorySummary,
  itemMatchesCategoryFilters,
} from "@/lib/crm/snippet-template-categories";
import {
  BulkEmailSendResultDialog,
  buildBulkEmailSendReport,
  type BulkEmailSendReport,
} from "@/components/crm/email/composer/BulkEmailSendResultDialog";
import EmailSpamWordCheckerPanel from "@/components/crm/email/deliverability/EmailSpamWordCheckerPanel";
import EmailSubjectLineTesterPanel, {
  SubjectLineCharHint,
} from "@/components/crm/email/deliverability/EmailSubjectLineTesterPanel";
import { analyzeEmailSpamContent } from "@/lib/crm/spam-word-checker";
import {
  analyzeEmailDeliverability,
  getRecentEmailContentFingerprints,
  recordEmailContentFingerprint,
  buildDeliverabilityConfirmMessage,
  shouldConfirmDeliverabilitySend,
} from "@/lib/crm/subject-line-tester";

/** Normalize API `serviceOfferingIds` (ids or populated docs) to string ids. */
function emailTemplateServiceIds(t: { serviceOfferingIds?: unknown }): string[] {
  const raw = t.serviceOfferingIds;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((x) =>
    typeof x === "object" && x !== null && "_id" in x
      ? String((x as { _id: unknown })._id)
      : String(x),
  );
}

function emailTemplateServiceLine(
  t: { serviceOfferingIds?: unknown },
  offerings: { _id: string; name: string }[],
): string {
  const raw = t.serviceOfferingIds;
  if (!Array.isArray(raw) || raw.length === 0) return "No service linked";
  const names = raw
    .map((x) => {
      if (typeof x === "object" && x !== null && "name" in x) {
        return String((x as { name?: string }).name || "").trim();
      }
      const id =
        typeof x === "object" && x !== null && "_id" in x
          ? String((x as { _id: unknown })._id)
          : String(x);
      return offerings.find((o) => String(o._id) === id)?.name?.trim() || "";
    })
    .filter(Boolean);
  if (names.length) return names.join(" · ");
  return "Service";
}
import type { Editor } from "@tiptap/core";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface EmailAccount {
  _id: string;
  email: string;
  displayName?: string;
  provider: string;
  isDefault?: boolean;
  userId?: string;
}

export interface CrmRecipientMatch {
  module: "leads" | "contacts" | "clients";
  entityId: string;
  label: string;
  email: string;
}

type ComposeRecipientSearchHit = {
  module: "leads" | "contacts" | "clients";
  entityId: string;
  label: string;
  emails: string[];
};

const EMPTY_ARRAY: EmailAccount[] = [];

const PLACEHOLDER_CRM_ENTITY_ID = "000000000000000000000000";

function addDaysIsoLocal(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Map compose `module` prop / inbox `selectedCrmKey` prefix to CRM activity `relatedType`. */
function mapComposerModuleToRelatedType(moduleRaw: string): string | null {
  const x = (moduleRaw || "").trim().toLowerCase();
  if (x === "leads" || x === "lead") return "Lead";
  if (x === "contacts" || x === "contact") return "Contact";
  if (x === "clients" || x === "client") return "Client";
  if (x === "organizations" || x === "organization") return "Organization";
  return null;
}

function isCreatableFollowUpEntityId(id: string | undefined): boolean {
  if (!id || typeof id !== "string") return false;
  const t = id.trim();
  if (t === PLACEHOLDER_CRM_ENTITY_ID) return false;
  return /^[a-f\d]{24}$/i.test(t);
}

function parseCrmUserIdFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    const u = JSON.parse(raw) as { _id?: string; id?: string };
    const id = u?._id ?? u?.id;
    if (id && /^[a-f\d]{24}$/i.test(String(id))) return String(id);
    return null;
  } catch {
    return null;
  }
}

function parseToEmailList(raw: string): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;]+/)) {
    const t = part.trim();
    if (!t.includes("@")) continue;
    const low = t.toLowerCase();
    if (seen.has(low)) continue;
    seen.add(low);
    out.push(t);
  }
  return out;
}

/** Merge TipTap body with inbox reply quoted HTML for send / draft. */
function buildComposerEmailBodyHtml(
  userBodyHtml: string,
  quotedHtml: string | null,
  meta: { fromLabel: string; dateLabel: string; title?: string; toLabel?: string } | null,
): string {
  const trimmed = userBodyHtml || "";
  const qh = (quotedHtml || "").trim();
  if (!qh) return trimmed;
  const from = escapeHtmlPlainText(meta?.fromLabel ?? "");
  const when = escapeHtmlPlainText(meta?.dateLabel ?? "");
  const title = escapeHtmlPlainText(meta?.title || "Original message");
  const toLine = meta?.toLabel
    ? `<br/><span style="color:var(--text-muted);">To: ${escapeHtmlPlainText(meta.toLabel)}</span>`
    : "";
  const quotedBlock = `<blockquote style="margin:20px 0 0 0;padding:12px 0 0 0;border-top:1px solid #eaeaea;border-left:none;">` +
    `<p style="font-size:12px;line-height:1.5;color:var(--text-muted);margin:0 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">` +
    `<strong>${title}</strong> · ${when}<br/>` +
    `<span style="color:var(--text-main);">${from}</span>${toLine}</p>` +
    `<div style="font-family:inherit;color:var(--text-main);">${qh}</div></blockquote>`;
  return `${trimmed}${quotedBlock}`;
}

function formatProvider(provider: string) {
  const p = (provider || "").toLowerCase();
  const map: Record<string, string> = {
    gmail: "Gmail",
    google: "Google",
    outlook: "Outlook",
    "office365": "Microsoft 365",
    microsoft: "Microsoft",
    imap: "IMAP",
    exchange: "Exchange",
  };
  return map[p] || provider || "Email";
}

export default function GlobalEmailComposer() {
  const { isOpen, props, closeComposer } = useEmailComposerStore();

  const {
    recipientEmail,
    recipientName,
    module,
    entityId,
    onSuccess,
    accounts = EMPTY_ARRAY,
    defaultAccountId,
    initialData,
    crmInboxMode = false,
    replyToInboxEmailId,
    lockRecipient = false,
    replyPreset,
    suggestedCcEmails = [],
    replyThreadMailbox,
    autoRunAiDraftOnOpen = false,
    bulkRecipients = [],
    onClose: customOnClose,
  } = props;

  const onClose = () => {
    customOnClose?.();
    closeComposer();
  };

  const [templates, setTemplates] = useState<any[]>([]);
  const [snippets, setSnippets] = useState<
    {
      _id: string;
      name: string;
      shortcut?: string;
      body?: string;
      isActive?: boolean;
      serviceOfferingIds?: unknown;
      categoryAudience?: string;
      categoryMaterial?: string;
    }[]
  >([]);
  const [isFetchingSnippets, setIsFetchingSnippets] = useState(false);
  const [snippetPopoverOpen, setSnippetPopoverOpen] = useState(false);
  const [snippetQuery, setSnippetQuery] = useState("");
  const [snippetServiceFilter, setSnippetServiceFilter] = useState<
    "all" | "none" | string
  >("all");
  const [templatePopoverOpen, setTemplatePopoverOpen] = useState(false);
  const [templateQuery, setTemplateQuery] = useState("");
  /** `all` | `none` (no linked service) | service offering ObjectId */
  const [templateServiceFilter, setTemplateServiceFilter] = useState<
    "all" | "none" | string
  >("all");
  const [snippetAudienceFilter, setSnippetAudienceFilter] =
    useState<CategoryAudience>("all");
  const [snippetMaterialFilter, setSnippetMaterialFilter] =
    useState<CategoryMaterial>("all");
  const [templateAudienceFilter, setTemplateAudienceFilter] =
    useState<CategoryAudience>("all");
  const [templateMaterialFilter, setTemplateMaterialFilter] =
    useState<CategoryMaterial>("all");
  const [serviceOfferings, setServiceOfferings] = useState<
    { _id: string; name: string; isActive?: boolean }[]
  >([]);
  const bodyEditorRef = useRef<Editor | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  /** Inbox reply: original HTML (shown below editor, appended on send). */
  const [replyQuotedHtml, setReplyQuotedHtml] = useState<string | null>(null);
  const [replyQuotedMeta, setReplyQuotedMeta] = useState<{
    fromLabel: string;
    dateLabel: string;
    title?: string;
    toLabel?: string;
  } | null>(null);
  const [isFetchingTemplates, setIsFetchingTemplates] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [sending, setSending] = useState(false);
  const [fetchedAccounts, setFetchedAccounts] = useState<EmailAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [sendFromAccountId, setSendFromAccountId] = useState("");
  const [fromMailboxOpen, setFromMailboxOpen] = useState(false);
  const [sendLimitStatus, setSendLimitStatus] = useState<{
    loading: boolean;
    blocked: boolean;
    reason: string | null;
    compliance?: {
      commercialMailingAddress: string;
      blockHighRiskComposerSends: boolean;
      enforceHumanOutreachChecks?: boolean;
      minOutreachBodyWords?: number;
      maxOutreachBodyWords?: number;
      maxOutreachParagraphs?: number;
      blockNonHumanOutreachSends?: boolean;
    };
    warmup?: { active: boolean; day: number };
  }>({
    loading: false,
    blocked: false,
    reason: null,
  });
  const [suppressedRecipients, setSuppressedRecipients] = useState<string[]>([]);

  const [manualEmail, setManualEmail] = useState("");
  const [manualName, setManualName] = useState("");
  const wasOpenRef = useRef(false);
  const prevModalOpenRef = useRef(false);
  const lastAccountIdsRef = useRef("");
  const [crmMatches, setCrmMatches] = useState<CrmRecipientMatch[]>([]);
  const [selectedCrmKey, setSelectedCrmKey] = useState("");
  const [loadingResolve, setLoadingResolve] = useState(false);
  const [acknowledgedUnknownRecipient, setAcknowledgedUnknownRecipient] = useState(false);

  const [isCreatingLead, setIsCreatingLead] = useState(false);
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [ccInput, setCcInput] = useState("");
  const [saveCcToRecord, setSaveCcToRecord] = useState(true);

  const [bccEmails, setBccEmails] = useState<string[]>([]);
  const [bccInput, setBccInput] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const attachmentsInputRef = useRef<HTMLInputElement>(null);
  const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

  const [aiDraftPopoverOpen, setAiDraftPopoverOpen] = useState(false);
  const [aiInstructions, setAiInstructions] = useState("");
  const [aiContextGaps, setAiContextGaps] = useState<string[] | null>(null);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [autoAiDraftOnOpen, setAutoAiDraftOnOpen] = useState(false);
  /** null = not checked yet; false = no API key or disabled in settings — do not show Draft with AI. */
  const [aiPersonDraftAvailable, setAiPersonDraftAvailable] = useState<
    boolean | null
  >(null);
  const aiAutoDraftTriggeredRef = useRef(false);

  const [followUpTaskEnabled, setFollowUpTaskEnabled] = useState(false);
  const [followUpDueDate, setFollowUpDueDate] = useState(() => addDaysIsoLocal(2));

  /** Last tracked send for this CRM record / recipient — used as default From. */
  const [suggestedMailbox, setSuggestedMailbox] = useState<{
    accountId: string | null;
    fromEmail: string | null;
  } | null>(null);
  /** Once the user picks From manually, don't overwrite with suggested mailbox. */
  const userPickedFromRef = useRef(false);

  /** Inbox compose: multiple To addresses; CRM search fills these. */
  const [toRecipientList, setToRecipientList] = useState<string[]>([]);
  const [toInputDraft, setToInputDraft] = useState("");
  const [bulkSmartEnabled, setBulkSmartEnabled] = useState(false);
  const [bulkSplitMode, setBulkSplitMode] = useState<"round_robin" | "random" | "sticky_entity">("round_robin");
  const [bulkSplitAccountIds, setBulkSplitAccountIds] = useState<string[]>([]);
  const [bulkRetryOnFail, setBulkRetryOnFail] = useState(true);
  const [bulkAiPersonalize, setBulkAiPersonalize] = useState(false);
  const [bulkMaxPerSender, setBulkMaxPerSender] = useState<number>(0);
  const [bulkSendReport, setBulkSendReport] = useState<BulkEmailSendReport | null>(null);
  const [bulkSendReportOpen, setBulkSendReportOpen] = useState(false);
  const [composeSearchHits, setComposeSearchHits] = useState<
    ComposeRecipientSearchHit[]
  >([]);
  const [composeSearchLoading, setComposeSearchLoading] = useState(false);
  /** Which recipient field owns the shared CRM typeahead dropdown. */
  const [composeSearchField, setComposeSearchField] = useState<
    "to" | "cc" | "bcc"
  >("to");
  const composeSearchWrapRef = useRef<HTMLDivElement>(null);
  const composeCcSearchWrapRef = useRef<HTMLDivElement>(null);
  const composeBccSearchWrapRef = useRef<HTMLDivElement>(null);
  /** When set, skip email-resolve so typeahead-linked record stays selected. */
  const inboxRecipientAnchorKeyRef = useRef<string | null>(null);

  const effectiveAccounts = useMemo(
    () => (accounts.length > 0 ? accounts : fetchedAccounts),
    [accounts, fetchedAccounts]
  );

  const effectivePersonModuleAndId = useMemo(() => {
    if (crmInboxMode && selectedCrmKey) {
      const colon = selectedCrmKey.indexOf(":");
      if (colon > 0) {
        return {
          effectiveModule: selectedCrmKey.slice(0, colon).toLowerCase(),
          effectiveEntityId: selectedCrmKey.slice(colon + 1).trim(),
        };
      }
    }
    return {
      effectiveModule: (module || "").toLowerCase().trim(),
      effectiveEntityId: (entityId || "").trim(),
    };
  }, [crmInboxMode, selectedCrmKey, module, entityId]);

  const canAiDraftPersonEmail = useMemo(() => {
    const m = effectivePersonModuleAndId.effectiveModule;
    if (m !== "leads" && m !== "contacts") return false;
    const id = effectivePersonModuleAndId.effectiveEntityId;
    if (!id || !/^[a-f\d]{24}$/i.test(id)) return false;
    if (id === PLACEHOLDER_CRM_ENTITY_ID) return false;
    return true;
  }, [effectivePersonModuleAndId]);

  const canAiDraftReplyEmail = useMemo(() => {
    return !!replyPreset && !!replyToInboxEmailId;
  }, [replyPreset, replyToInboxEmailId]);

  const canUseAiDraft = canAiDraftPersonEmail || canAiDraftReplyEmail;

  const mergedEmailBodyHtml = useMemo(
    () =>
      buildComposerEmailBodyHtml(body, replyQuotedHtml, replyQuotedMeta),
    [body, replyQuotedHtml, replyQuotedMeta],
  );

  const addCcAddress = useCallback((raw: string) => {
    const t = raw.trim();
    if (!t.includes("@")) return;
    const low = t.toLowerCase();
    setCcEmails((prev) => {
      if (prev.some((x) => x.toLowerCase() === low)) return prev;
      return [...prev, t];
    });
  }, []);

  const addBccAddress = useCallback((raw: string) => {
    const t = raw.trim();
    if (!t.includes("@")) return;
    const low = t.toLowerCase();
    setBccEmails((prev) => {
      if (prev.some((x) => x.toLowerCase() === low)) return prev;
      return [...prev, t];
    });
  }, []);

  const filteredSnippets = useMemo(() => {
    let list = snippets.filter((s) => s?.isActive !== false);
    if (snippetServiceFilter === "none") {
      list = list.filter((s) => emailTemplateServiceIds(s).length === 0);
    } else if (snippetServiceFilter !== "all") {
      const sid = snippetServiceFilter;
      list = list.filter((s) =>
        emailTemplateServiceIds(s).some((id) => id === sid),
      );
    }
    list = list.filter((s) =>
      itemMatchesCategoryFilters(s, snippetAudienceFilter, snippetMaterialFilter),
    );
    const q = snippetQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) => {
      const svc = emailTemplateServiceLine(s, serviceOfferings).toLowerCase();
      const cat = formatCategorySummary(
        s.categoryAudience,
        s.categoryMaterial,
      ).toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        (s.shortcut || "").toLowerCase().includes(q) ||
        svc.includes(q) ||
        cat.includes(q)
      );
    });
  }, [
    snippets,
    snippetQuery,
    snippetServiceFilter,
    snippetAudienceFilter,
    snippetMaterialFilter,
    serviceOfferings,
  ]);

  const activeTemplates = useMemo(
    () => templates.filter((t) => t?.isActive !== false),
    [templates],
  );

  const filteredTemplates = useMemo(() => {
    let list = activeTemplates;
    if (templateServiceFilter === "none") {
      list = list.filter((t) => emailTemplateServiceIds(t).length === 0);
    } else if (templateServiceFilter !== "all") {
      const sid = templateServiceFilter;
      list = list.filter((t) =>
        emailTemplateServiceIds(t).some((id) => id === sid),
      );
    }
    list = list.filter((t) =>
      itemMatchesCategoryFilters(t, templateAudienceFilter, templateMaterialFilter),
    );
    const q = templateQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((t) => {
      const name = String(t.name || "").toLowerCase();
      const subject = String(t.subject || t.title || "").toLowerCase();
      const vars = Array.isArray(t.variables) ? t.variables : [];
      const svcLine = emailTemplateServiceLine(t, serviceOfferings).toLowerCase();
      const cat = formatCategorySummary(
        t.categoryAudience,
        t.categoryMaterial,
      ).toLowerCase();
      return (
        name.includes(q) ||
        subject.includes(q) ||
        svcLine.includes(q) ||
        cat.includes(q) ||
        vars.some((v: string) => String(v).toLowerCase().includes(q))
      );
    });
  }, [
    activeTemplates,
    templateQuery,
    templateServiceFilter,
    templateAudienceFilter,
    templateMaterialFilter,
    serviceOfferings,
  ]);

  const selectedTemplateLabel = useMemo(() => {
    if (!selectedTemplate) return "Blank email";
    const t = templates.find((x) => String(x._id) === String(selectedTemplate));
    return t?.name?.trim() || "Template";
  }, [selectedTemplate, templates]);

  const ccQuickPick = useMemo(() => {
    const toBlock = crmInboxMode
      ? toRecipientList.map((e) => e.trim().toLowerCase())
      : [manualEmail.trim().toLowerCase()].filter(Boolean);
    const s = new Set([...toBlock, ...ccEmails.map((e) => e.toLowerCase())]);
    return (suggestedCcEmails || []).filter(
      (e) => e && !s.has(String(e).trim().toLowerCase())
    );
  }, [suggestedCcEmails, manualEmail, ccEmails, crmInboxMode, toRecipientList]);

  const fetchTemplates = useCallback(async () => {
    setIsFetchingTemplates(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/email-templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (err) {
      console.error("Failed to fetch templates:", err);
    } finally {
      setIsFetchingTemplates(false);
    }
  }, []);

  const fetchSnippets = useCallback(async () => {
    setIsFetchingSnippets(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/snippets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSnippets(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to fetch snippets:", err);
    } finally {
      setIsFetchingSnippets(false);
    }
  }, []);

  const runAiDraft = useCallback(async (opts?: { silentSuccess?: boolean }) => {
    if (!canUseAiDraft || aiPersonDraftAvailable !== true) {
      if (canUseAiDraft && aiPersonDraftAvailable === false) {
        toast.message(
          "AI drafting is off until the server has ANTHROPIC_API_KEY set (optional).",
        );
      }
      return;
    }
    setAiDrafting(true);
    try {
      const token = getCrmAuthToken();
      if (!token) {
        toast.error("Sign in again to use AI draft");
        return;
      }
      const isReplyMode = !!replyPreset && !!replyToInboxEmailId;
      let contextGaps: string[] | null = null;
      if (
        !isReplyMode &&
        effectivePersonModuleAndId.effectiveModule &&
        effectivePersonModuleAndId.effectiveEntityId
      ) {
        const ctxRes = await fetch(`${CRM_API_URL}/crm/ai/check-outreach-context`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            module: effectivePersonModuleAndId.effectiveModule,
            entityId: effectivePersonModuleAndId.effectiveEntityId,
          }),
        });
        if (ctxRes.ok) {
          const ctxData = (await ctxRes.json()) as { missingLabels?: string[] };
          contextGaps = ctxData.missingLabels?.length ? ctxData.missingLabels : null;
          setAiContextGaps(contextGaps);
        }
      }
      const endpoint = isReplyMode
        ? `${CRM_API_URL}/crm/ai/draft-reply-email`
        : `${CRM_API_URL}/crm/ai/draft-person-email`;
      const reqBody = isReplyMode
        ? {
          inboxEmailId: replyToInboxEmailId,
          instructions: aiInstructions.trim() || undefined,
        }
        : {
          module: effectivePersonModuleAndId.effectiveModule,
          entityId: effectivePersonModuleAndId.effectiveEntityId,
          instructions: aiInstructions.trim() || undefined,
          skipContextCheck: true,
        };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(reqBody),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string | string[];
        subject?: string;
        bodyHtml?: string;
      };
      if (!res.ok) {
        const msg = Array.isArray(data.message)
          ? data.message.join(", ")
          : typeof data.message === "string"
            ? data.message
            : `Could not generate draft (${res.status})`;
        toast.error(msg);
        return;
      }
      if (data.subject) setSubject(data.subject);
      if (data.bodyHtml) setBody(data.bodyHtml);
      setAiDraftPopoverOpen(false);
      setAiInstructions("");
      setAiContextGaps(null);
      if (!opts?.silentSuccess) {
        toast.success(
          contextGaps?.length
            ? "AI draft inserted — some CRM context was missing; review before sending"
            : "AI draft inserted — review and edit before sending",
        );
      }
    } catch {
      toast.error("Network error");
    } finally {
      setAiDrafting(false);
    }
  }, [
    canUseAiDraft,
    aiPersonDraftAvailable,
    effectivePersonModuleAndId.effectiveEntityId,
    effectivePersonModuleAndId.effectiveModule,
    replyPreset,
    replyToInboxEmailId,
    aiInstructions,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setAutoAiDraftOnOpen(
        localStorage.getItem("crm:auto-ai-draft-on-open") === "1",
      );
    } catch {
      setAutoAiDraftOnOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    fetchTemplates();
    fetchSnippets();
  }, [isOpen, fetchTemplates, fetchSnippets]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      const token = localStorage.getItem("token");
      try {
        const res = await fetch(`${CRM_API_URL}/crm/service-offerings`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled || !res.ok) return;
        const data = await res.json();
        const rows = Array.isArray(data) ? data : [];
        setServiceOfferings(
          rows.filter((s: { isActive?: boolean }) => s.isActive !== false),
        );
      } catch {
        if (!cancelled) setServiceOfferings([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || accounts.length > 0) return;
    let cancelled = false;
    (async () => {
      setLoadingAccounts(true);
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${CRM_API_URL}/crm/inbox-accounts`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled && res.ok) {
          const data = await res.json();
          setFetchedAccounts(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        console.error("Failed to load inbox accounts", e);
      } finally {
        if (!cancelled) setLoadingAccounts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, accounts.length]);

  useEffect(() => {
    if (!isOpen || !canUseAiDraft) {
      setAiPersonDraftAvailable(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = getCrmAuthToken();
        if (!token) {
          if (!cancelled) setAiPersonDraftAvailable(false);
          return;
        }
        const res = await fetch(`${CRM_API_URL}/crm/ai/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (!res.ok) {
          setAiPersonDraftAvailable(false);
          return;
        }
        const data = (await res.json()) as { personDraftAvailable?: boolean };
        setAiPersonDraftAvailable(data.personDraftAvailable === true);
      } catch {
        if (!cancelled) setAiPersonDraftAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, canUseAiDraft]);

  // Reset draft fields only when the modal transitions closed → open (not when inbox list loads).
  useEffect(() => {
    const justOpened = isOpen && !wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (!justOpened) return;

    aiAutoDraftTriggeredRef.current = false;
    setSelectedTemplate("");
    setCrmMatches([]);
    setSelectedCrmKey("");
    setCcEmails([]);
    setCcInput("");
    setBccEmails([]);
    setBccInput("");
    setShowCcBcc(false);
    setAttachments([]);
    setSaveCcToRecord(true);
    inboxRecipientAnchorKeyRef.current = null;
    setToInputDraft("");
    setComposeSearchHits([]);
    setComposeSearchField("to");
    setSnippetPopoverOpen(false);
    setSnippetQuery("");
    setSnippetServiceFilter("all");
    setTemplatePopoverOpen(false);
    setTemplateQuery("");
    setTemplateServiceFilter("all");
    setAiDraftPopoverOpen(false);
    setFromMailboxOpen(false);
    setAiInstructions("");
    if (replyPreset) {
      setSubject(replyPreset.subject);
      const qh = replyPreset.quotedHtml?.trim();
      if (qh) {
        setBody(
          replyPreset.body?.trim() ? replyPreset.body : "<p></p>",
        );
        setReplyQuotedHtml(replyPreset.quotedHtml ?? null);
        setReplyQuotedMeta(replyPreset.quotedMeta ?? null);
      } else {
        setBody(replyPreset.body);
        setReplyQuotedHtml(null);
        setReplyQuotedMeta(null);
      }
      setManualName(replyPreset.recipientName);
      if (crmInboxMode) {
        setToRecipientList(parseToEmailList(replyPreset.recipientEmail));
        setManualEmail("");
      } else {
        setManualEmail(replyPreset.recipientEmail);
        setToRecipientList([]);
      }
    } else if (initialData) {
      setReplyQuotedHtml(null);
      setReplyQuotedMeta(null);
      setSubject(initialData.subject || "");
      setBody(initialData.body || "");
      const r =
        initialData.recipient ||
        (initialData as any).from ||
        recipientEmail ||
        "";
      setManualName(
        initialData.recipientName ||
        (initialData as any).fromName ||
        recipientName ||
        ""
      );
      if (crmInboxMode) {
        setToRecipientList(parseToEmailList(r));
        setManualEmail("");
      } else {
        setManualEmail(r);
        setToRecipientList([]);
      }
    } else {
      setReplyQuotedHtml(null);
      setReplyQuotedMeta(null);
      setManualName(recipientName || "");
      setSubject("");
      setBody("");
      if (crmInboxMode) {
        setToRecipientList(parseToEmailList(recipientEmail || ""));
        setManualEmail("");
      } else {
        setManualEmail(recipientEmail || "");
        setToRecipientList([]);
      }
    }
    if (bulkRecipients.length > 0) {
      const emails = bulkRecipients
        .map((r) => String(r?.email || "").trim())
        .filter((e) => e.includes("@"));
      if (emails.length > 0) {
        setToRecipientList(emails);
        setManualEmail("");
      }
      setBulkSmartEnabled(emails.length > 1);
    } else {
      setBulkSmartEnabled(false);
    }
    setBulkSendReport(null);
    setBulkSendReportOpen(false);
  }, [
    isOpen,
    initialData,
    recipientEmail,
    recipientName,
    replyPreset,
    crmInboxMode,
    bulkRecipients,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const shouldAutoDraft = autoAiDraftOnOpen || autoRunAiDraftOnOpen;
    if (!shouldAutoDraft) return;
    if (aiAutoDraftTriggeredRef.current) return;
    if (!canUseAiDraft || aiPersonDraftAvailable !== true) return;
    if (selectedTemplate) return;
    if (!autoRunAiDraftOnOpen && (subject || "").trim()) return;
    if (!autoRunAiDraftOnOpen && (body || "").trim()) return;
    aiAutoDraftTriggeredRef.current = true;
    void runAiDraft({ silentSuccess: true });
  }, [
    isOpen,
    autoAiDraftOnOpen,
    autoRunAiDraftOnOpen,
    canUseAiDraft,
    aiPersonDraftAvailable,
    selectedTemplate,
    subject,
    body,
    runAiDraft,
  ]);

  useEffect(() => {
    if (!isOpen || !crmInboxMode) return;
    if (inboxRecipientAnchorKeyRef.current) return;
    const email = (
      toRecipientList.find((e) => e.includes("@")) ||
      toInputDraft.trim()
    ).trim();
    if (!email.includes("@")) {
      setCrmMatches([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setLoadingResolve(true);
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(
          `${CRM_API_URL}/crm/inbox-accounts/resolve-recipient?email=${encodeURIComponent(email)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!cancelled && res.ok) {
          const data = await res.json();
          setCrmMatches(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) setCrmMatches([]);
      } finally {
        if (!cancelled) setLoadingResolve(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [toRecipientList, toInputDraft, isOpen, crmInboxMode]);

  useEffect(() => {
    if (!isOpen || !crmInboxMode) return;
    const q =
      composeSearchField === "to"
        ? toInputDraft.trim()
        : composeSearchField === "cc"
          ? ccInput.trim()
          : bccInput.trim();
    if (q.length < 2) {
      setComposeSearchHits([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setComposeSearchLoading(true);
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(
          `${CRM_API_URL}/crm/inbox-accounts/compose-recipient-search?q=${encodeURIComponent(q)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!cancelled && res.ok) {
          const data = await res.json();
          setComposeSearchHits(Array.isArray(data) ? data : []);
        } else if (!cancelled) setComposeSearchHits([]);
      } catch {
        if (!cancelled) setComposeSearchHits([]);
      } finally {
        if (!cancelled) setComposeSearchLoading(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [toInputDraft, ccInput, bccInput, composeSearchField, isOpen, crmInboxMode]);

  useEffect(() => {
    if (!isOpen || !crmInboxMode) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      const inTo = composeSearchWrapRef.current?.contains(target);
      const inCc = composeCcSearchWrapRef.current?.contains(target);
      const inBcc = composeBccSearchWrapRef.current?.contains(target);
      if (!inTo && !inCc && !inBcc) {
        setComposeSearchHits([]);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [isOpen, crmInboxMode]);

  useEffect(() => {
    if (!crmInboxMode || !isOpen) return;
    const hasDraftEmail = toInputDraft.trim().includes("@");
    if (!toRecipientList.some((e) => e.includes("@")) && !hasDraftEmail) {
      inboxRecipientAnchorKeyRef.current = null;
      setCrmMatches([]);
      setSelectedCrmKey("");
    }
  }, [toRecipientList, toInputDraft, crmInboxMode, isOpen]);

  useEffect(() => {
    if (!crmMatches.length) {
      setSelectedCrmKey("");
      return;
    }
    if (crmMatches.length === 1) {
      setSelectedCrmKey(`${crmMatches[0].module}:${crmMatches[0].entityId}`);
      return;
    }
    setSelectedCrmKey((prev) => {
      const ok = crmMatches.some((m) => `${m.module}:${m.entityId}` === prev);
      if (ok) return prev;
      return `${crmMatches[0].module}:${crmMatches[0].entityId}`;
    });
  }, [crmMatches]);

  useEffect(() => {
    if (!isOpen) {
      prevModalOpenRef.current = false;
      return;
    }
    const ids = effectiveAccounts.map((a) => a._id).join(",");
    const list = effectiveAccounts;
    const draftAccId = (initialData as any)?.accountId?._id;
    const draftAccInList =
      !!draftAccId &&
      list.some((a) => String(a._id) === String(draftAccId));

    const threadAccId = replyThreadMailbox?.accountId;
    const threadInList =
      !!threadAccId &&
      list.some((a) => String(a._id) === String(threadAccId));

    const preferredReply =
      (replyToInboxEmailId && threadInList) ? String(threadAccId) :
        (draftAccInList ? String(draftAccId) : "");

    const next =
      preferredReply ||
      defaultAccountId ||
      list.find((a) => a.isDefault)?._id ||
      list[0]?._id ||
      "";
    const justOpened = !prevModalOpenRef.current;
    prevModalOpenRef.current = true;
    if (justOpened) {
      userPickedFromRef.current = false;
    }
    if (justOpened || ids !== lastAccountIdsRef.current) {
      lastAccountIdsRef.current = ids;
      // Prefer record-specific mailbox once `suggestedMailbox` loads; set a temporary default now.
      if (!userPickedFromRef.current) {
        setSendFromAccountId(next);
      }
    }
  }, [
    isOpen,
    initialData,
    defaultAccountId,
    effectiveAccounts,
    replyToInboxEmailId,
    replyThreadMailbox?.accountId,
  ]);

  /** Prefer the From mailbox last used for this lead/contact (or recipient). */
  useEffect(() => {
    if (!isOpen || replyToInboxEmailId || userPickedFromRef.current) return;
    if (!suggestedMailbox) return;
    const list = effectiveAccounts;
    let matchId = "";
    if (
      suggestedMailbox.accountId &&
      list.some((a) => String(a._id) === String(suggestedMailbox.accountId))
    ) {
      matchId = String(suggestedMailbox.accountId);
    } else {
      const fe = (suggestedMailbox.fromEmail || "").trim().toLowerCase();
      if (fe) {
        const hit = list.find(
          (a) => (a.email || "").trim().toLowerCase() === fe,
        );
        if (hit?._id) matchId = String(hit._id);
      }
    }
    if (!matchId) return;
    setSendFromAccountId((prev) =>
      String(prev) === matchId ? prev : matchId,
    );
  }, [isOpen, replyToInboxEmailId, suggestedMailbox, effectiveAccounts]);

  useEffect(() => {
    if (!isOpen || !sendFromAccountId) {
      setSendLimitStatus({ loading: false, blocked: false, reason: null });
      return;
    }
    let cancelled = false;
    (async () => {
      setSendLimitStatus((s) => ({ ...s, loading: true }));
      try {
        const token = getCrmAuthToken();
        const res = await fetch(
          `${CRM_API_URL}/crm/inbox-accounts/${encodeURIComponent(sendFromAccountId)}/send-limit-status`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        const data = (await res.json().catch(() => ({}))) as {
          blocked?: boolean;
          reason?: string | null;
          compliance?: {
            commercialMailingAddress?: string;
            blockHighRiskComposerSends?: boolean;
            enforceHumanOutreachChecks?: boolean;
            minOutreachBodyWords?: number;
            maxOutreachBodyWords?: number;
            maxOutreachParagraphs?: number;
            blockNonHumanOutreachSends?: boolean;
          };
          warmup?: { active?: boolean; day?: number };
        };
        if (cancelled) return;
        setSendLimitStatus({
          loading: false,
          blocked: data.blocked === true,
          reason: data.reason || null,
          compliance: data.compliance
            ? {
                commercialMailingAddress: String(
                  data.compliance.commercialMailingAddress || '',
                ),
                blockHighRiskComposerSends:
                  data.compliance.blockHighRiskComposerSends === true,
                enforceHumanOutreachChecks:
                  data.compliance.enforceHumanOutreachChecks !== false,
                minOutreachBodyWords: Math.max(
                  20,
                  Number(data.compliance.minOutreachBodyWords ?? 50),
                ),
                maxOutreachBodyWords: Math.max(
                  Math.max(20, Number(data.compliance.minOutreachBodyWords ?? 50)) + 10,
                  Number(data.compliance.maxOutreachBodyWords ?? 90),
                ),
                maxOutreachParagraphs: Math.max(
                  1,
                  Number(data.compliance.maxOutreachParagraphs ?? 3),
                ),
                blockNonHumanOutreachSends:
                  data.compliance.blockNonHumanOutreachSends === true,
              }
            : undefined,
          warmup: data.warmup
            ? { active: data.warmup.active === true, day: Number(data.warmup.day ?? 0) }
            : undefined,
        });
      } catch {
        if (cancelled) return;
        setSendLimitStatus({ loading: false, blocked: false, reason: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, sendFromAccountId]);

  useEffect(() => {
    if (!isOpen) {
      setSuppressedRecipients([]);
      return;
    }
    const emails = [
      ...toRecipientList,
      ...ccEmails,
      ...bccEmails,
      manualEmail,
    ]
      .map((e) => e.trim())
      .filter((e) => e.includes('@'));
    if (!emails.length) {
      setSuppressedRecipients([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = getCrmAuthToken();
        const res = await fetch(
          `${CRM_API_URL}/crm/inbox-accounts/check-recipient-suppression`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ emails }),
          },
        );
        const data = (await res.json().catch(() => ({}))) as {
          suppressed?: string[];
        };
        if (!cancelled) {
          setSuppressedRecipients(
            Array.isArray(data.suppressed) ? data.suppressed : [],
          );
        }
      } catch {
        if (!cancelled) setSuppressedRecipients([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, toRecipientList, ccEmails, bccEmails, manualEmail]);

  useEffect(() => {
    if (!isOpen) {
      setSuggestedMailbox(null);
      return;
    }
    if (replyToInboxEmailId) {
      setSuggestedMailbox(null);
      return;
    }
    const email = crmInboxMode
      ? (toRecipientList.find((e) => e.includes("@")) || "").trim()
      : (manualEmail || "").trim();
    if (!email.includes("@") && !effectivePersonModuleAndId.effectiveEntityId) {
      setSuggestedMailbox(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const token = getCrmAuthToken();
        const q = new URLSearchParams();
        if (email.includes("@")) q.set("email", email);
        const mod = effectivePersonModuleAndId.effectiveModule;
        const eid = effectivePersonModuleAndId.effectiveEntityId;
        if (
          eid &&
          (mod === "leads" ||
            mod === "contacts" ||
            mod === "organizations")
        ) {
          q.set("module", mod);
          q.set("entityId", eid);
        }
        const res = await fetch(
          `${CRM_API_URL}/crm/inbox-accounts/suggested-send-from?${q.toString()}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        if (cancelled) return;
        if (res.ok) {
          const j = (await res.json()) as {
            accountId?: string | null;
            fromEmail?: string | null;
          };
          setSuggestedMailbox({
            accountId: j.accountId ?? null,
            fromEmail: j.fromEmail ?? null,
          });
        } else setSuggestedMailbox(null);
      } catch {
        if (!cancelled) setSuggestedMailbox(null);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [
    isOpen,
    replyToInboxEmailId,
    crmInboxMode,
    toRecipientList,
    manualEmail,
    effectivePersonModuleAndId.effectiveModule,
    effectivePersonModuleAndId.effectiveEntityId,
  ]);

  const resolveComposerMergeFields =
    useCallback(async (): Promise<Record<string, string>> => {
      const merge: Record<string, string> = {};
      let resolvedModule = module;
      let resolvedEntityId = entityId;
      if (crmInboxMode && selectedCrmKey) {
        const colon = selectedCrmKey.indexOf(":");
        if (colon > 0) {
          resolvedModule = selectedCrmKey.slice(0, colon);
          resolvedEntityId = selectedCrmKey.slice(colon + 1);
        }
      }

      const oid = String(resolvedEntityId || "").trim();
      if (resolvedModule && /^[0-9a-fA-F]{24}$/.test(oid)) {
        try {
          const token = localStorage.getItem("token");
          const q = new URLSearchParams({
            module: resolvedModule,
            entityId: oid,
          });
          const res = await fetch(
            `${CRM_API_URL}/email-templates/merge-data?${q}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (res.ok) {
            const j = await res.json();
            if (j.merge && typeof j.merge === "object") {
              Object.assign(merge, j.merge);
            }
          }
        } catch {
          /* use fallbacks below */
        }
      }

      const firstName = (manualName || "").trim().split(/\s+/)[0] || "";
      const fullName = (manualName || "").trim() || "";
      if (!merge.firstName && firstName) merge.firstName = firstName;
      if (!merge.fullName && fullName) merge.fullName = fullName;
      return merge;
    }, [module, entityId, crmInboxMode, selectedCrmKey, manualName]);

  const handleTemplateChange = useCallback(
    async (templateId: string) => {
      setSelectedTemplate(templateId);
      if (!templateId) {
        setSubject("");
        setBody("");
        return;
      }
      const template = templates.find(
        (t) => String(t._id) === String(templateId),
      );
      if (!template) return;

      const rawSubject = template.subject ?? template.title ?? "";
      const rawBody = template.body ?? template.content ?? "";
      const merge = await resolveComposerMergeFields();
      setSubject(fillEmailTemplateVariables(rawSubject, merge));
      setBody(fillEmailTemplateVariables(rawBody, merge));
    },
    [templates, resolveComposerMergeFields],
  );

  const insertSnippetAtCursor = useCallback(
    async (snippet: { body?: string }) => {
      const raw = snippet.body ?? "";
      if (!raw.trim()) return;
      const merge = await resolveComposerMergeFields();
      const html = fillEmailTemplateVariables(raw, merge);
      const ed = bodyEditorRef.current;
      if (ed && !ed.isDestroyed) {
        ed.chain().focus().insertContent(html).run();
      } else {
        setBody((prev) =>
          prev && prev.replace(/<p><br><\/p>\s*$/i, "").trim()
            ? `${prev}<p><br></p>${html}`
            : html,
        );
      }
      setSnippetPopoverOpen(false);
      setSnippetQuery("");
      toast.success("Snippet inserted");
    },
    [resolveComposerMergeFields],
  );

  const copySnippetMergedPlain = useCallback(
    async (snippet: { body?: string; name?: string }) => {
      const raw = snippet.body ?? "";
      if (!raw.trim()) return;
      const merge = await resolveComposerMergeFields();
      const html = fillEmailTemplateVariables(raw, merge);
      const plain = snippetHtmlToPlainText(html);
      const ok = await copyPlainTextToClipboard(plain);
      if (ok) {
        toast.success(
          snippet.name ? `Copied: ${snippet.name}` : "Copied to clipboard",
        );
      } else {
        toast.error("Could not copy");
      }
    },
    [resolveComposerMergeFields],
  );

  useEffect(() => {
    setAcknowledgedUnknownRecipient(false);
  }, [
    crmInboxMode
      ? `${toRecipientList.join("|")}|${toInputDraft}`
      : manualEmail,
  ]);

  const mergeHitEmailsIntoList = useCallback(
    (hit: ComposeRecipientSearchHit, setList: React.Dispatch<React.SetStateAction<string[]>>) => {
      setList((prev) => {
        const seen = new Set(prev.map((x) => x.toLowerCase()));
        const next = [...prev];
        for (const e of hit.emails) {
          const t = e.trim();
          if (!t.includes("@")) continue;
          const low = t.toLowerCase();
          if (seen.has(low)) continue;
          seen.add(low);
          next.push(t);
        }
        return next;
      });
    },
    [],
  );

  const applyComposeSearchHit = useCallback((hit: ComposeRecipientSearchHit) => {
    inboxRecipientAnchorKeyRef.current = `${hit.module}:${hit.entityId}`;
    mergeHitEmailsIntoList(hit, setToRecipientList);
    setCrmMatches([
      {
        module: hit.module,
        entityId: hit.entityId,
        label: hit.label,
        email: hit.emails[0] || "",
      },
    ]);
    setSelectedCrmKey(`${hit.module}:${hit.entityId}`);
    setManualName(hit.label);
    setComposeSearchHits([]);
    setToInputDraft("");
    setAcknowledgedUnknownRecipient(false);
  }, [mergeHitEmailsIntoList]);

  /** Cc/Bcc CRM pick: add emails only — do not change Log to / primary recipient. */
  const applyComposeSearchHitToCc = useCallback((hit: ComposeRecipientSearchHit) => {
    mergeHitEmailsIntoList(hit, setCcEmails);
    setComposeSearchHits([]);
    setCcInput("");
  }, [mergeHitEmailsIntoList]);

  const applyComposeSearchHitToBcc = useCallback((hit: ComposeRecipientSearchHit) => {
    mergeHitEmailsIntoList(hit, setBccEmails);
    setComposeSearchHits([]);
    setBccInput("");
  }, [mergeHitEmailsIntoList]);

  const commitDraftToRecipient = useCallback(() => {
    const t = toInputDraft.trim();
    if (!t.includes("@")) return;
    inboxRecipientAnchorKeyRef.current = null;
    setToRecipientList((prev) => {
      const low = t.toLowerCase();
      if (prev.some((x) => x.toLowerCase() === low)) return prev;
      return [...prev, t];
    });
    setToInputDraft("");
  }, [toInputDraft]);

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    const token = getCrmAuthToken();
    if (!token) {
      toast.error("Sign in to save drafts.");
      setIsSavingDraft(false);
      return;
    }
    try {
      let resolvedModule = module;
      let resolvedEntityId = entityId;
      if (crmInboxMode && selectedCrmKey) {
        const colon = selectedCrmKey.indexOf(":");
        if (colon > 0) {
          resolvedModule = selectedCrmKey.slice(0, colon);
          resolvedEntityId = selectedCrmKey.slice(colon + 1);
        }
      }

      const seenTo = new Set<string>();
      const toList: string[] = [];
      const pushTo = (raw: string) => {
        const t = raw.trim();
        if (!t.includes("@")) return;
        const low = t.toLowerCase();
        if (seenTo.has(low)) return;
        seenTo.add(low);
        toList.push(t);
      };
      if (crmInboxMode) {
        for (const e of toRecipientList) pushTo(e);
        pushTo(toInputDraft);
      } else {
        pushTo(manualEmail);
      }
      const recipientField = toList.join(", ");

      const url = initialData?._id
        ? `${CRM_API_URL}/communications/emails/${initialData._id}`
        : `${CRM_API_URL}/communications/emails/draft`;

      const method = initialData?._id ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipient: recipientField,
          subject,
          body: mergedEmailBodyHtml,
          accountId: sendFromAccountId || undefined,
          module: (crmInboxMode ? resolvedModule : module) || "CRM",
          entityId:
            (crmInboxMode ? resolvedEntityId : entityId) ||
            "000000000000000000000000",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Draft saved");
        onSuccess?.();
        onClose();
      } else {
        const msg =
          (typeof data?.message === "string" && data.message) ||
          (typeof data?.error === "string" && data.error) ||
          `Could not save draft (${res.status})`;
        toast.error(msg);
      }
    } catch (err) {
      console.error("Failed to save draft:", err);
      toast.error("Could not save draft");
    } finally {
      setIsSavingDraft(false);
    }
  };

  const showBulkSendReport = (report: BulkEmailSendReport) => {
    setBulkSendReport(report);
    setBulkSendReportOpen(true);
    const { sent, failed } = report;
    if (sent.length === 0) {
      toast.error(
        `Bulk send failed for all ${failed.length} recipient${failed.length === 1 ? "" : "s"}. See details.`,
      );
    } else {
      toast.warning(
        `${sent.length} sent, ${failed.length} not sent. Review the breakdown.`,
      );
    }
  };

  const handleBulkSendReportDone = () => {
    const report = bulkSendReport;
    setBulkSendReportOpen(false);
    setBulkSendReport(null);
    if (!report) return;

    if (report.failed.length > 0) {
      setToRecipientList(report.failed.map((row) => row.email));
      if (report.sent.length > 0) {
        onSuccess?.();
        toast.message(
          `${report.sent.length} sent. ${report.failed.length} recipient${report.failed.length === 1 ? "" : "s"} still in To — fix and send again.`,
        );
      }
      return;
    }

    onSuccess?.();
    onClose();
  };

  const completeSend = async () => {
    const token = getCrmAuthToken();
    if (!token) {
      toast.error("Sign in again to send email");
      setSending(false);
      return;
    }
    const ccPayload: string[] = [...ccEmails];
    const pendingCc = ccInput.trim();
    if (
      pendingCc.includes("@") &&
      !ccPayload.some((x) => x.toLowerCase() === pendingCc.toLowerCase())
    ) {
      ccPayload.push(pendingCc);
    }

    const bccPayload: string[] = [...bccEmails];
    const pendingBcc = bccInput.trim();
    if (
      pendingBcc.includes("@") &&
      !bccPayload.some((x) => x.toLowerCase() === pendingBcc.toLowerCase())
    ) {
      bccPayload.push(pendingBcc);
    }
    try {
      const bulkToEmails = toRecipientList
        .map((e) => e.trim())
        .filter((e) => e.includes("@"));
      const isMultiRecipientBulk =
        crmInboxMode && bulkToEmails.length > 1;
      if (isMultiRecipientBulk) {
        if (attachments.length > 0) {
          toast.error(
            "Attachments aren't supported for multi-recipient bulk send. Remove files or send to one recipient.",
          );
          return;
        }
        const recipients = (
          bulkRecipients.length > 0
            ? bulkRecipients
            : toRecipientList.map((email) => ({ email }))
        )
          .map((r: any) => ({
            email: String(r?.email || "").trim(),
            name: r?.name,
            module: r?.module || module || "leads",
            entityId: r?.entityId,
          }))
          .filter((r: any) => r.email.includes("@"));
        const smartRes = await fetch(`${CRM_API_URL}/crm/inbox-accounts/send-bulk-smart`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            recipients,
            subject,
            body: mergedEmailBodyHtml,
            cc: ccPayload,
            bcc: bccPayload,
            enforceCrmRecipient: true,
            preferredAccountId: sendFromAccountId || undefined,
            mailboxSplit:
              bulkSmartEnabled && bulkSplitAccountIds.length >= 2
                ? { mode: bulkSplitMode, accountIds: bulkSplitAccountIds }
                : undefined,
            retryOnSendFail: bulkRetryOnFail,
            aiDraftPerRecipient: bulkAiPersonalize,
            aiInstructions: aiInstructions.trim() || undefined,
            maxEmailsPerSenderInBatch: bulkMaxPerSender > 0 ? bulkMaxPerSender : undefined,
          }),
        });
        const smartData = await smartRes.json().catch(() => ({}));
        const apiResults = Array.isArray(smartData?.results) ? smartData.results : [];
        const report = buildBulkEmailSendReport(apiResults, recipients);

        if (!smartRes.ok && apiResults.length === 0) {
          const msg =
            (typeof smartData?.message === "string" && smartData.message) ||
            (typeof smartData?.error === "string" && smartData.error) ||
            `Bulk send failed (${smartRes.status})`;
          toast.error(msg);
          return;
        }

        if (report.sent.length === 0 && report.failed.length === 0) {
          toast.error("Bulk send returned no results. Try again.");
          return;
        }

        if (report.failed.length > 0) {
          showBulkSendReport(report);
          return;
        }

        toast.success(
          `Bulk send completed: ${report.sent.length} email${report.sent.length === 1 ? "" : "s"} sent`,
        );
        if (sendFromAccountId) {
          setLastSendFromAccountId(sendFromAccountId);
        }
        onSuccess?.();
        onClose();
        return;
      }
      let resolvedModule = module;
      let resolvedEntityId = entityId;
      if (crmInboxMode && selectedCrmKey) {
        const colon = selectedCrmKey.indexOf(":");
        if (colon > 0) {
          resolvedModule = selectedCrmKey.slice(0, colon);
          resolvedEntityId = selectedCrmKey.slice(colon + 1);
        }
      }

      const toField = crmInboxMode
        ? toRecipientList
          .map((e) => e.trim())
          .filter((e) => e.includes("@"))
          .join(", ")
        : manualEmail.trim();
      const formData = new FormData();
      formData.append("accountId", sendFromAccountId || "");
      formData.append("to", toField || "");
      formData.append("subject", subject || "");
      const professionalBody = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.625; color: var(--text-main);">${mergedEmailBodyHtml}</div>`;
      formData.append("body", professionalBody);
      formData.append("module", (crmInboxMode ? resolvedModule : (module || "CRM")) || "");
      formData.append(
        "entityId",
        (crmInboxMode ? resolvedEntityId : entityId || PLACEHOLDER_CRM_ENTITY_ID) || "",
      );

      if (replyToInboxEmailId) {
        formData.append("replyToInboxEmailId", replyToInboxEmailId);
      }
      if (crmInboxMode) {
        formData.append("enforceCrmRecipient", "true");
      }

      ccPayload.forEach((email) => {
        formData.append("cc", email);
        formData.append("cc[]", email);
      });
      bccPayload.forEach((email) => {
        formData.append("bcc", email);
        formData.append("bcc[]", email);
      });
      if (saveCcToRecord) {
        formData.append("saveCcEmailsToRecord", "true");
      }
      if (selectedTemplate) {
        formData.append("templateId", selectedTemplate);
      }

      attachments.forEach((file) => {
        formData.append("attachments", file, file.name);
      });

      let res;
      res = await fetch(`${CRM_API_URL}/crm/inbox-accounts/send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok && !sendFromAccountId) {
        if (attachments.length > 0) {
          toast.error(
            "Could not send with attachments from this mailbox. Connect an inbox account and try again.",
          );
          return;
        }
        // Fallback for simple communications send if no account is selected (though unlikely in current flow)
        const jsonBody: any = {
          recipient: toField || manualEmail,
          subject,
          body: professionalBody,
          module: (crmInboxMode ? resolvedModule : module || "CRM") || "CRM",
          entityId: crmInboxMode
            ? resolvedEntityId
            : entityId || PLACEHOLDER_CRM_ENTITY_ID,
        };
        if (ccPayload.length) jsonBody.cc = ccPayload;
        if (bccPayload.length) jsonBody.bcc = bccPayload;

        res = await fetch(`${CRM_API_URL}/communications/emails/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(jsonBody),
        });
      }

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success !== false) {
        if (sendFromAccountId) {
          setLastSendFromAccountId(sendFromAccountId);
        }
        if (
          initialData?._id &&
          (initialData.status === "draft" || (initialData as any).isDraft)
        ) {
          await fetch(`${CRM_API_URL}/communications/emails/${initialData._id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
        }

        let followUpCreated = false;
        if (followUpTaskEnabled && token) {
          const relatedType = mapComposerModuleToRelatedType(resolvedModule ?? "");
          const uid = parseCrmUserIdFromStorage();
          if (
            relatedType &&
            isCreatableFollowUpEntityId(
              resolvedEntityId == null ? "" : String(resolvedEntityId),
            ) &&
            uid
          ) {
            const primaryTo = toField || manualEmail.trim() || "";
            const subj = (subject || "").trim() || "(no subject)";
            const taskTitle =
              subj.length > 90 ? `Follow up: ${subj.slice(0, 87)}…` : `Follow up: ${subj}`;
            const nm = (recipientName || "").trim();
            const taskContent = `Follow up on email sent to ${primaryTo}${nm ? ` (${nm})` : ""}.\nSubject: ${subj}`;
            const taskRes = await fetch(`${CRM_API_URL}/crm/activities`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                type: "Task",
                title: taskTitle,
                content: taskContent,
                relatedTo: String(resolvedEntityId),
                relatedType,
                status: "To Do",
                assignee: uid,
                metadata: {
                  priority: "Medium",
                  dueDate: followUpDueDate || undefined,
                },
              }),
            });
            if (taskRes.ok) {
              followUpCreated = true;
            } else {
              toast.warning(
                "Email sent, but the follow-up task could not be created. Check Activities permission or try from the record timeline.",
              );
            }
          }
        }

        recordEmailContentFingerprint(subject, mergedEmailBodyHtml);
        toast.success(
          followUpCreated ? "Email sent — follow-up task created for you." : "Email sent",
        );
        onSuccess?.();
        onClose();
      } else {
        throw new Error(data?.error || data?.message || "Send failed");
      }
    } catch (err: any) {
      console.error("Failed to send email:", err);
      toast.error(err?.message || "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setFollowUpTaskEnabled(false);
      setFollowUpDueDate(addDaysIsoLocal(2));
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        customOnClose?.();
        closeComposer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, customOnClose, closeComposer]);

  const handleCreateQuickLead = async () => {
    const primary =
      (crmInboxMode
        ? toRecipientList.find((e) => e.includes("@")) || toInputDraft
        : manualEmail
      ).trim();
    if (!primary.includes("@")) {
      toast.error("Enter a valid email address first.");
      return;
    }
    const token = localStorage.getItem("token");
    setIsCreatingLead(true);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/inbox-accounts/resolve-recipient/create-lead`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: primary, name: manualName }),
      });
      if (res.ok) {
        const data = await res.json();
        const newMatch: CrmRecipientMatch = {
          module: data.module,
          entityId: data.entityId,
          label: data.label,
          email: data.email,
        };
        inboxRecipientAnchorKeyRef.current = null;
        setCrmMatches([newMatch]);
        setSelectedCrmKey(`${data.module}:${data.entityId}`);
        if (crmInboxMode) {
          setToRecipientList((prev) => {
            const low = String(data.email).toLowerCase();
            if (prev.some((x) => x.toLowerCase() === low)) return prev;
            return [...prev, data.email];
          });
        }
        toast.success(`Success! Created Lead for ${primary}.`);
      } else {
        const err = await res.json();
        toast.error(err?.message || "Failed to create lead.");
      }
    } catch (err) {
      console.error("Failed to create quick lead:", err);
      toast.error("An error occurred during lead creation.");
    } finally {
      setIsCreatingLead(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const spam = analyzeEmailSpamContent(subject, mergedEmailBodyHtml);
    const deliverability = analyzeEmailDeliverability(
      subject,
      mergedEmailBodyHtml,
      spam,
      emailDeliverabilityOptions,
    );
    if (
      sendLimitStatus.compliance?.blockHighRiskComposerSends &&
      deliverability.overallScore < 50
    ) {
      toast.error(
        'Send blocked: deliverability score is below 50. Fix spam/subject issues or ask an admin to adjust settings.',
      );
      return;
    }
    const humanFails = deliverability.allChecks.filter(
      (c) => c.id.startsWith('human-') && c.status === 'fail',
    );
    if (humanFails.length > 0 && !replyToInboxEmailId) {
      if (sendLimitStatus.compliance?.blockNonHumanOutreachSends) {
        toast.error(humanFails[0].message);
        return;
      }
      const ok = window.confirm(
        `${humanFails[0].message}\n\nThis email may read as bulk or AI-generated. Send anyway?`,
      );
      if (!ok) return;
    }
    if (suppressedRecipients.length > 0) {
      toast.error(
        `Cannot send: ${suppressedRecipients.join(', ')} marked invalid (bounce/unsubscribe).`,
      );
      return;
    }
    if (shouldConfirmDeliverabilitySend(deliverability)) {
      const ok = window.confirm(buildDeliverabilityConfirmMessage(deliverability));
      if (!ok) return;
    }
    if (crmInboxMode) {
      const hasTo = toRecipientList.some((e) => e.trim().includes("@"));
      if (!hasTo) {
        toast.error("Add at least one recipient email.");
        return;
      }
      const bulkToCount = toRecipientList.filter((e) => e.trim().includes("@")).length;
      const isMultiBulk = bulkToCount > 1;
      if (!isMultiBulk) {
        if (loadingResolve) {
          toast.error("Still looking up CRM records for this email.");
          return;
        }
        if (!crmMatches.length && !acknowledgedUnknownRecipient) {
          toast.error("Please confirm you want to send to this unknown recipient or add them as a Lead.");
          return;
        }
        if (crmMatches.length && !selectedCrmKey) {
          toast.error("Choose which CRM record to attach this email to.");
          return;
        }
      } else if (
        bulkRecipients.length > 0 &&
        bulkRecipients.some((r) => !r.entityId || !String(r.email).includes("@"))
      ) {
        toast.error("Each bulk recipient needs a valid email and CRM record.");
        return;
      }
      if (isMultiBulk && !sendFromAccountId && effectiveAccounts.length === 0) {
        toast.error("Connect a mailbox under CRM → Inbox settings before bulk send.");
        return;
      }
    }
    setSending(true);
    await completeSend();
  };

  const threadAccInList = useMemo(() => {
    const id = replyThreadMailbox?.accountId;
    if (!id) return false;
    return effectiveAccounts.some((a) => String(a._id) === String(id));
  }, [replyThreadMailbox?.accountId, effectiveAccounts]);

  const replyThreadMissing = Boolean(
    replyToInboxEmailId &&
    replyThreadMailbox?.accountId &&
    !threadAccInList,
  );

  const isReplyMailboxMismatch = Boolean(
    replyToInboxEmailId &&
    replyThreadMailbox?.accountId &&
    threadAccInList &&
    sendFromAccountId &&
    String(sendFromAccountId) !== String(replyThreadMailbox.accountId),
  );

  /**
   * Same resolution as the From Select `value` — state can be "" briefly while the UI
   * shows default/first mailbox; warnings must use this or they never appear.
   */
  const effectiveSendAccountId = useMemo(() => {
    const raw = (sendFromAccountId || "").trim();
    if (raw) return raw;
    const def = effectiveAccounts.find((a) => a.isDefault)?._id;
    if (def) return String(def);
    const first = effectiveAccounts[0]?._id;
    return first ? String(first) : "";
  }, [sendFromAccountId, effectiveAccounts]);

  /** Email address shown on the last tracked CRM send to this recipient (same user). */
  const priorOutreachEmailDisplay = useMemo(() => {
    if (!suggestedMailbox) return "";
    const direct = (suggestedMailbox.fromEmail || "").trim();
    if (direct) return direct;
    if (suggestedMailbox.accountId) {
      const acc = effectiveAccounts.find(
        (a) => String(a._id) === String(suggestedMailbox.accountId),
      );
      if (acc?.email?.trim()) return acc.email.trim();
    }
    return "";
  }, [suggestedMailbox, effectiveAccounts]);

  const selectedSenderEmail = useMemo(() => {
    const acc = effectiveAccounts.find(
      (a) => String(a._id) === String(effectiveSendAccountId),
    );
    return (acc?.email || "").trim();
  }, [effectiveAccounts, effectiveSendAccountId]);

  /** Connected inbox id that matches the prior outreach (for one-click switch). */
  const followUpSwitchAccountId = useMemo(() => {
    if (!suggestedMailbox) return null;
    const list = effectiveAccounts;
    if (
      suggestedMailbox.accountId &&
      list.some((a) => String(a._id) === String(suggestedMailbox.accountId))
    ) {
      return String(suggestedMailbox.accountId);
    }
    const fe = (suggestedMailbox.fromEmail || "").trim().toLowerCase();
    if (!fe) return null;
    const hit = list.find(
      (a) => (a.email || "").trim().toLowerCase() === fe,
    );
    return hit ? String(hit._id) : null;
  }, [suggestedMailbox, effectiveAccounts]);

  /**
   * Warn if the selected From mailbox is not the same as the last tracked send to this recipient.
   * Use both email strings (when present) and account ids so we never miss the case where the UI
   * shows a default mailbox but `sendFromAccountId` is still empty, or tracking has accountId only.
   */
  const isFirstEmailToRecipient = useMemo(() => {
    if (replyToInboxEmailId) return false;
    if (!suggestedMailbox) return true;
    return !(
      suggestedMailbox.accountId?.trim() || suggestedMailbox.fromEmail?.trim()
    );
  }, [replyToInboxEmailId, suggestedMailbox]);

  const emailDeliverabilityOptions = useMemo(
    () => ({
      commercialMailingAddress:
        sendLimitStatus.compliance?.commercialMailingAddress,
      attachmentCount: attachments.length,
      isFirstEmailToRecipient,
      recentContentFingerprints: getRecentEmailContentFingerprints(),
      enforceHumanOutreachChecks:
        sendLimitStatus.compliance?.enforceHumanOutreachChecks !== false,
      minOutreachBodyWords: sendLimitStatus.compliance?.minOutreachBodyWords ?? 50,
      maxOutreachBodyWords: sendLimitStatus.compliance?.maxOutreachBodyWords ?? 90,
      maxOutreachParagraphs: sendLimitStatus.compliance?.maxOutreachParagraphs ?? 3,
      isConversationReply: Boolean(replyToInboxEmailId),
    }),
    [
      sendLimitStatus.compliance?.commercialMailingAddress,
      sendLimitStatus.compliance?.enforceHumanOutreachChecks,
      sendLimitStatus.compliance?.minOutreachBodyWords,
      sendLimitStatus.compliance?.maxOutreachBodyWords,
      sendLimitStatus.compliance?.maxOutreachParagraphs,
      attachments.length,
      isFirstEmailToRecipient,
      replyToInboxEmailId,
    ],
  );

  const isFollowUpMailboxMismatch = useMemo(() => {
    if (replyToInboxEmailId || !suggestedMailbox || !effectiveSendAccountId) {
      return false;
    }
    const curEmail = selectedSenderEmail;
    const priorEmail = priorOutreachEmailDisplay;
    if (
      priorEmail &&
      curEmail &&
      priorEmail.toLowerCase() !== curEmail.toLowerCase()
    ) {
      return true;
    }
    const sugAcc = suggestedMailbox.accountId;
    if (sugAcc && String(sugAcc) !== String(effectiveSendAccountId)) {
      return true;
    }
    return false;
  }, [
    replyToInboxEmailId,
    suggestedMailbox,
    effectiveSendAccountId,
    selectedSenderEmail,
    priorOutreachEmailDisplay,
  ]);

  const switchMailboxTargetId =
    isReplyMailboxMismatch && replyThreadMailbox?.accountId
      ? String(replyThreadMailbox.accountId)
      : isFollowUpMailboxMismatch && followUpSwitchAccountId
        ? followUpSwitchAccountId
        : null;

  const switchMailboxDisplay =
    (isReplyMailboxMismatch && replyThreadMailbox?.email) ||
    (isFollowUpMailboxMismatch && priorOutreachEmailDisplay) ||
    "";

  if (!isOpen) return null;

  const selectedFromLabel = effectiveAccounts.find(
    (a) => a._id === sendFromAccountId
  );

  const rowLabelClass =
    "w-[76px] shrink-0 pt-2.5 text-left text-xs font-bold uppercase tracking-wide text-[var(--text-muted)] sm:pt-2";

  const modalContent = (
    <>
      <div
        className="fixed inset-0 z-[1999] bg-black/10"
        aria-hidden
      />
      <div
        className="theme-crm-hubspot fixed inset-y-0 right-0 z-[2000] flex w-full max-w-[min(100vw,960px)] flex-col border-l border-[var(--border-color)] bg-white shadow-[-8px_0_32px_rgba(51,71,91,0.12)] animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-email-title"
      >
        <form
          id="email-form"
          onSubmit={handleSend}
          className="flex h-full min-h-0 flex-col"
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-color)] bg-white px-5 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--crm-radius-ui)] bg-[var(--surface-dim)] text-[var(--hs-link)]">
                <Mail className="h-4 w-4" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2
                    id="send-email-title"
                    className="text-sm font-semibold leading-tight text-[var(--text-main)]"
                  >
                    Compose email
                  </h2>
                  {selectedTemplate ? (
                    <span className="rounded-[var(--crm-radius-ui)] bg-[var(--primary-light)] px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-[var(--primary-dark)]">
                      Template
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-xs font-medium text-[var(--text-muted)]">
                  {crmInboxMode
                    ? manualName &&
                      toRecipientList.some((e) => e.includes("@"))
                      ? `${manualName} · ${toRecipientList.filter((e) => e.includes("@")).join(", ")}`
                      : toRecipientList.filter((e) => e.includes("@")).join(", ") ||
                      "Search a lead or contact, or type an email"
                    : manualName && manualEmail
                      ? `${manualName} · ${manualEmail}`
                      : manualEmail || "Add a recipient below"}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              type="button"
              className="shrink-0 rounded-[var(--crm-radius-ui)] p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)]"
              aria-label="Close composer"
            >
              <X size={20} />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
            <div className="border-b border-[var(--border-color)] bg-[var(--surface-dim)] px-5 py-4">
              <p className="mb-3 text-xs font-semibold text-[var(--text-muted)]">
                Recipients &amp; routing
              </p>
              <div className="space-y-0 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white">
                <div className={cn("flex gap-3 border-b border-[var(--border-color)] px-3 py-2 sm:items-center")}>
                  <span className={rowLabelClass}>From</span>
                  <div className="min-w-0 flex-1 py-1">
                    {loadingAccounts && effectiveAccounts.length === 0 ? (
                      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading inboxes…
                      </div>
                    ) : effectiveAccounts.length > 0 ? (
                      (() => {
                        const resolvedFromId =
                          sendFromAccountId ||
                          effectiveAccounts.find((a) => a.isDefault)?._id ||
                          effectiveAccounts[0]?._id ||
                          "";
                        const resolvedFrom = effectiveAccounts.find(
                          (a) => String(a._id) === String(resolvedFromId),
                        );
                        return (
                          <Popover
                            open={fromMailboxOpen}
                            onOpenChange={setFromMailboxOpen}
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="flex h-9 w-full items-center justify-between gap-2 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white px-3 text-left text-sm font-medium shadow-none hover:bg-[var(--surface-hover)]"
                                aria-label="Select sender mailbox"
                              >
                                <span className="min-w-0 truncate">
                                  {resolvedFrom ? (
                                    <>
                                      <span className="mr-1.5 text-xs font-bold uppercase text-[var(--text-muted)]">
                                        {formatProvider(resolvedFrom.provider)}
                                      </span>
                                      {resolvedFrom.email}
                                    </>
                                  ) : (
                                    <span className="text-[var(--text-muted)]">
                                      Select sender
                                    </span>
                                  )}
                                </span>
                                <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              className="z-[3000] w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0"
                              align="start"
                            >
                              <Command>
                                <CommandInput
                                  placeholder="Search email…"
                                  className="h-9 text-sm"
                                />
                                <CommandList className="max-h-[260px] overflow-y-auto custom-scrollbar">
                                  <CommandEmpty className="py-6 text-center text-sm text-[var(--text-muted)]">
                                    No mailbox found.
                                  </CommandEmpty>
                                  <CommandGroup heading="Connected accounts">
                                    {effectiveAccounts.map((acc) => {
                                      const currentUserId =
                                        parseCrmUserIdFromStorage();
                                      const isShared =
                                        acc.userId &&
                                        currentUserId &&
                                        String(acc.userId) !==
                                          String(currentUserId);
                                      const selected =
                                        String(acc._id) ===
                                        String(resolvedFromId);
                                      return (
                                        <CommandItem
                                          key={String(acc._id)}
                                          value={`${acc.email} ${acc.displayName || ""} ${formatProvider(acc.provider)}`}
                                          onSelect={() => {
                                            userPickedFromRef.current = true;
                                            setSendFromAccountId(
                                              String(acc._id),
                                            );
                                            setLastSendFromAccountId(
                                              String(acc._id),
                                            );
                                            setFromMailboxOpen(false);
                                          }}
                                          className="cursor-pointer rounded-[var(--crm-radius-ui)]"
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4 shrink-0",
                                              selected
                                                ? "opacity-100"
                                                : "opacity-0",
                                            )}
                                          />
                                          <div className="flex min-w-0 flex-col">
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs font-bold uppercase text-[var(--text-muted)]">
                                                {formatProvider(acc.provider)}
                                              </span>
                                              <span
                                                className={cn(
                                                  "truncate",
                                                  isShared &&
                                                    "font-bold text-amber-700",
                                                )}
                                              >
                                                {acc.email}
                                              </span>
                                            </div>
                                            {isShared ? (
                                              <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-tight text-amber-600">
                                                <Users size={10} /> Shared with
                                                you
                                              </span>
                                            ) : null}
                                          </div>
                                        </CommandItem>
                                      );
                                    })}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        );
                      })()
                    ) : (
                      <div className="rounded-[var(--crm-radius-ui)] border border-dashed border-[var(--border-color)] bg-[var(--surface-dim)] px-3 py-2 text-xs leading-snug text-[var(--text-main)]">
                        <span className="text-[var(--text-muted)]">No connected inbox.</span>{" "}
                        <Link
                          href="/crm/inbox"
                          className="font-semibold text-[var(--hs-link)] hover:underline"
                          onClick={onClose}
                        >
                          Connect email
                          <ExternalLink className="inline h-3 w-3 ml-0.5 align-middle" />
                        </Link>
                      </div>
                    )}
                  </div>
                </div>

                {(replyThreadMissing ||
                  isReplyMailboxMismatch ||
                  isFollowUpMailboxMismatch ||
                  sendLimitStatus.blocked ||
                  suppressedRecipients.length > 0) && (
                    <div
                      className={cn(
                        "flex gap-3 border-b border-[var(--border-color)] px-3 py-2.5 sm:items-start",
                        replyThreadMissing ||
                          sendLimitStatus.blocked ||
                          suppressedRecipients.length > 0
                          ? "bg-rose-50/90"
                          : "bg-amber-50/90",
                      )}
                    >
                      <AlertTriangle
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          replyThreadMissing ||
                            sendLimitStatus.blocked ||
                            suppressedRecipients.length > 0
                            ? "text-rose-600"
                            : "text-amber-600",
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        {suppressedRecipients.length > 0 ? (
                          <p className="text-xs font-medium leading-snug text-rose-900">
                            Recipient(s) suppressed after bounce or unsubscribe:{" "}
                            <span className="font-semibold">
                              {suppressedRecipients.join(", ")}
                            </span>
                            . Remove them to send.
                          </p>
                        ) : null}
                        {sendLimitStatus.blocked ? (
                          <p className="text-xs font-medium leading-snug text-rose-900">
                            Sending is disabled for this mailbox.{" "}
                            <span className="font-semibold">
                              {sendLimitStatus.reason || "Send cap reached."}
                            </span>{" "}
                            Change limits in Settings or wait for the rolling window to clear.
                          </p>
                        ) : replyThreadMissing ? (
                          <p className="text-xs font-medium leading-snug text-rose-900">
                            This thread was received in{" "}
                            <span className="font-semibold">
                              {replyThreadMailbox?.email || "another mailbox"}
                            </span>
                            , which is not in your connected inboxes. Connect that account under Email
                            inboxes or the reply cannot be sent on the same thread.
                          </p>
                        ) : isReplyMailboxMismatch ? (
                          <p className="text-xs font-medium leading-snug text-amber-950">
                            Reply from{" "}
                            <span className="font-semibold">
                              {replyThreadMailbox?.email}
                            </span>{" "}
                            — the same mailbox the client emailed. Using a different address breaks
                            threading and the send may be blocked.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-xs font-medium leading-snug text-amber-950">
                              <span className="font-semibold">
                                Different mailbox than your last outreach —{" "}
                              </span>
                              a tracked CRM email to this contact was sent from{" "}
                              <span className="font-semibold">
                                {priorOutreachEmailDisplay}
                              </span>
                              . You are about to send from{" "}
                              <span className="font-semibold">
                                {selectedSenderEmail}
                              </span>
                              . Using one address for outreach and another for follow-up
                              can split the thread in the recipient&apos;s inbox and look
                              inconsistent. Prefer the same mailbox when you can.
                            </p>
                            {isFollowUpMailboxMismatch && !followUpSwitchAccountId ? (
                              <p className="text-xs leading-snug text-amber-900/95">
                                To send from{" "}
                                <span className="font-semibold">
                                  {priorOutreachEmailDisplay}
                                </span>
                                , connect that inbox under{" "}
                                <Link
                                  href="/crm/inbox"
                                  className="font-semibold text-[var(--hs-link)] hover:underline"
                                  onClick={onClose}
                                >
                                  Email inboxes
                                </Link>
                                .
                              </p>
                            ) : null}
                          </div>
                        )}
                        {switchMailboxTargetId && !replyThreadMissing ? (
                          <button
                            type="button"
                            onClick={() => {
                              userPickedFromRef.current = true;
                              setSendFromAccountId(switchMailboxTargetId);
                              setLastSendFromAccountId(switchMailboxTargetId);
                            }}
                            className="rounded-[var(--crm-radius-ui)] border border-amber-200 bg-white px-2.5 py-1 text-xs font-bold text-amber-900 shadow-sm hover:bg-amber-100/80"
                          >
                            Use{" "}
                            {switchMailboxDisplay ||
                              priorOutreachEmailDisplay ||
                              "prior mailbox"}{" "}
                            (match last outreach)
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )}

                <div className={cn("flex gap-3 px-3 py-2 sm:items-start")}>
                  <span className={rowLabelClass}>To</span>
                  <div
                    ref={crmInboxMode && !lockRecipient ? composeSearchWrapRef : undefined}
                    className="relative flex min-w-0 flex-1 flex-col gap-1.5 py-1"
                  >
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      {lockRecipient ? (
                        <span className="inline-flex max-w-full items-center gap-1.5 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--surface-dim)] px-2.5 py-1.5 text-sm font-semibold text-[var(--text-main)]">
                          <User size={14} className="shrink-0 text-[var(--text-muted)]" />
                          <span className="truncate">{manualName || manualEmail}</span>
                          <span className="truncate text-xs font-normal text-[var(--text-muted)]">
                            &lt;{manualEmail}&gt;
                          </span>
                        </span>
                      ) : crmInboxMode ? (
                        <>
                          {toRecipientList.map((email, idx) => (
                            <span
                              key={`${email}-${idx}`}
                              className="inline-flex max-w-full items-center gap-1 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--surface-dim)] px-2 py-1 text-xs font-semibold text-[var(--text-main)]"
                            >
                              <Mail size={12} className="shrink-0 text-[var(--text-muted)]" />
                              <span className="truncate">{email}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  inboxRecipientAnchorKeyRef.current = null;
                                  setToRecipientList((prev) =>
                                    prev.filter((_, i) => i !== idx),
                                  );
                                }}
                                className="rounded p-0.5 text-[var(--text-muted)] hover:bg-white/80 hover:text-[var(--text-main)]"
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                          <input
                            type="text"
                            value={toInputDraft}
                            onChange={(e) => {
                              setComposeSearchField("to");
                              setToInputDraft(e.target.value);
                            }}
                            onFocus={() => setComposeSearchField("to")}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === ",") {
                                e.preventDefault();
                                commitDraftToRecipient();
                              } else if (
                                e.key === "Backspace" &&
                                !toInputDraft &&
                                toRecipientList.length
                              ) {
                                inboxRecipientAnchorKeyRef.current = null;
                                setToRecipientList((prev) => prev.slice(0, -1));
                              }
                            }}
                            onBlur={() => {
                              if (
                                toInputDraft.trim().includes("@") &&
                                /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                                  toInputDraft.trim(),
                                )
                              ) {
                                commitDraftToRecipient();
                              }
                            }}
                            placeholder={
                              toRecipientList.length
                                ? "Add another email…"
                                : "Search name or email, or type an address"
                            }
                            className="h-9 min-w-[160px] flex-1 bg-transparent text-sm font-medium text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
                          />
                        </>
                      ) : (
                        <input
                          type="email"
                          value={manualEmail}
                          onChange={(e) => setManualEmail(e.target.value)}
                          placeholder="name@company.com"
                          className="h-9 min-w-0 flex-1 bg-transparent text-sm font-medium text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
                          required
                        />
                      )}
                      {!lockRecipient &&
                        !showCcBcc &&
                        ccEmails.length === 0 &&
                        bccEmails.length === 0 &&
                        !ccInput &&
                        !bccInput && (
                          <button
                            type="button"
                            onClick={() => setShowCcBcc(true)}
                            className="shrink-0 self-center text-xs font-semibold text-[var(--hs-link)] hover:text-[var(--hs-link-hover)]"
                          >
                            Cc / Bcc
                          </button>
                        )}
                    </div>
                    {crmInboxMode && !lockRecipient && (
                      <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
                        <Search className="h-3 w-3 shrink-0 opacity-70" />
                        Pick a lead or contact to add every email on that record to To. You can remove addresses before send.
                      </p>
                    )}
                    {crmInboxMode &&
                      !lockRecipient &&
                      composeSearchField === "to" &&
                      (composeSearchLoading || composeSearchHits.length > 0) && (
                        <div className="absolute left-0 right-0 top-full z-[3001] mt-0.5 max-h-56 overflow-y-auto rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white shadow-lg">
                          {composeSearchLoading ? (
                            <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-[var(--text-muted)]">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Searching…
                            </div>
                          ) : (
                            composeSearchHits.map((hit) => (
                              <button
                                key={`${hit.module}-${hit.entityId}`}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => applyComposeSearchHit(hit)}
                                className="flex w-full flex-col gap-0.5 border-b border-[var(--border-color)] px-3 py-2 text-left last:border-b-0 hover:bg-[var(--surface-dim)]"
                              >
                                <span className="text-xs font-bold text-[var(--text-main)]">
                                  {hit.module === "leads"
                                    ? "Lead"
                                    : hit.module === "contacts"
                                      ? "Contact"
                                      : "Client"}{" "}
                                  · {hit.label}
                                </span>
                                <span className="text-xs text-[var(--text-muted)]">
                                  {hit.emails.join(" · ")}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                  </div>
                </div>

                {(showCcBcc ||
                  ccEmails.length > 0 ||
                  ccInput ||
                  bccEmails.length > 0 ||
                  bccInput) && (
                    <>
                      <div className="flex gap-3 border-t border-[var(--border-color)] px-3 py-2 sm:items-start">
                        <span className={rowLabelClass}>Cc</span>
                        <div
                          ref={crmInboxMode ? composeCcSearchWrapRef : undefined}
                          className="relative flex min-w-0 flex-1 flex-col gap-1.5 py-1"
                        >
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                            {ccEmails.map((email, idx) => (
                              <span
                                key={email}
                                className="inline-flex items-center gap-1 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--info-light)] px-2 py-1 text-xs font-semibold text-[var(--text-main)]"
                              >
                                {email}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCcEmails((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                  className="rounded p-0.5 text-[var(--text-muted)] hover:bg-white/80 hover:text-[var(--text-main)]"
                                >
                                  <X size={12} />
                                </button>
                              </span>
                            ))}
                            <input
                              type={crmInboxMode ? "text" : "email"}
                              value={ccInput}
                              onChange={(e) => {
                                if (crmInboxMode) setComposeSearchField("cc");
                                setCcInput(e.target.value);
                              }}
                              onFocus={() => {
                                if (crmInboxMode) setComposeSearchField("cc");
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === ",") {
                                  e.preventDefault();
                                  if (ccInput.trim()) {
                                    addCcAddress(ccInput);
                                    setCcInput("");
                                  }
                                } else if (
                                  e.key === "Backspace" &&
                                  !ccInput &&
                                  ccEmails.length
                                ) {
                                  setCcEmails((prev) => prev.slice(0, -1));
                                }
                              }}
                              onBlur={() => {
                                if (
                                  crmInboxMode &&
                                  ccInput.trim().includes("@") &&
                                  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ccInput.trim())
                                ) {
                                  addCcAddress(ccInput);
                                  setCcInput("");
                                }
                              }}
                              placeholder={
                                crmInboxMode
                                  ? ccEmails.length
                                    ? "Add another email…"
                                    : "Search name or email, or type an address"
                                  : ccEmails.length
                                    ? ""
                                    : "Add Cc"
                              }
                              className="h-8 min-w-[140px] flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
                            />
                          </div>
                          {crmInboxMode && (
                            <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
                              <Search className="h-3 w-3 shrink-0 opacity-70" />
                              Pick a lead or contact to add every email on that record to Cc. You can remove addresses before send.
                            </p>
                          )}
                          {crmInboxMode &&
                            composeSearchField === "cc" &&
                            (composeSearchLoading || composeSearchHits.length > 0) && (
                              <div className="absolute left-0 right-0 top-full z-[3001] mt-0.5 max-h-56 overflow-y-auto rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white shadow-lg">
                                {composeSearchLoading ? (
                                  <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-[var(--text-muted)]">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Searching…
                                  </div>
                                ) : (
                                  composeSearchHits.map((hit) => (
                                    <button
                                      key={`${hit.module}-${hit.entityId}`}
                                      type="button"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => applyComposeSearchHitToCc(hit)}
                                      className="flex w-full flex-col gap-0.5 border-b border-[var(--border-color)] px-3 py-2 text-left last:border-b-0 hover:bg-[var(--surface-dim)]"
                                    >
                                      <span className="text-xs font-bold text-[var(--text-main)]">
                                        {hit.module === "leads"
                                          ? "Lead"
                                          : hit.module === "contacts"
                                            ? "Contact"
                                            : "Client"}{" "}
                                        · {hit.label}
                                      </span>
                                      <span className="text-xs text-[var(--text-muted)]">
                                        {hit.emails.join(" · ")}
                                      </span>
                                    </button>
                                  ))
                                )}
                              </div>
                            )}
                        </div>
                      </div>
                      <div className="flex gap-3 border-t border-[var(--border-color)] px-3 py-2 sm:items-start">
                        <span className={rowLabelClass}>Bcc</span>
                        <div
                          ref={crmInboxMode ? composeBccSearchWrapRef : undefined}
                          className="relative flex min-w-0 flex-1 flex-col gap-1.5 py-1"
                        >
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                            {bccEmails.map((email, idx) => (
                              <span
                                key={email}
                                className="inline-flex items-center gap-1 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--surface-dim)] px-2 py-1 text-xs font-semibold text-[var(--text-main)]"
                              >
                                {email}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setBccEmails((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                  className="rounded p-0.5 text-[var(--text-muted)] hover:bg-white/80"
                                >
                                  <X size={12} />
                                </button>
                              </span>
                            ))}
                            <input
                              type={crmInboxMode ? "text" : "email"}
                              value={bccInput}
                              onChange={(e) => {
                                if (crmInboxMode) setComposeSearchField("bcc");
                                setBccInput(e.target.value);
                              }}
                              onFocus={() => {
                                if (crmInboxMode) setComposeSearchField("bcc");
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === ",") {
                                  e.preventDefault();
                                  if (bccInput.trim()) {
                                    addBccAddress(bccInput);
                                    setBccInput("");
                                  }
                                } else if (
                                  e.key === "Backspace" &&
                                  !bccInput &&
                                  bccEmails.length
                                ) {
                                  setBccEmails((prev) => prev.slice(0, -1));
                                }
                              }}
                              onBlur={() => {
                                if (
                                  crmInboxMode &&
                                  bccInput.trim().includes("@") &&
                                  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bccInput.trim())
                                ) {
                                  addBccAddress(bccInput);
                                  setBccInput("");
                                }
                              }}
                              placeholder={
                                crmInboxMode
                                  ? bccEmails.length
                                    ? "Add another email…"
                                    : "Search name or email, or type an address"
                                  : bccEmails.length
                                    ? ""
                                    : "Add Bcc"
                              }
                              className="h-8 min-w-[140px] flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
                            />
                          </div>
                          {crmInboxMode && (
                            <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
                              <Search className="h-3 w-3 shrink-0 opacity-70" />
                              Pick a lead or contact to add every email on that record to Bcc. You can remove addresses before send.
                            </p>
                          )}
                          {crmInboxMode &&
                            composeSearchField === "bcc" &&
                            (composeSearchLoading || composeSearchHits.length > 0) && (
                              <div className="absolute left-0 right-0 top-full z-[3001] mt-0.5 max-h-56 overflow-y-auto rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white shadow-lg">
                                {composeSearchLoading ? (
                                  <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-[var(--text-muted)]">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Searching…
                                  </div>
                                ) : (
                                  composeSearchHits.map((hit) => (
                                    <button
                                      key={`${hit.module}-${hit.entityId}`}
                                      type="button"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => applyComposeSearchHitToBcc(hit)}
                                      className="flex w-full flex-col gap-0.5 border-b border-[var(--border-color)] px-3 py-2 text-left last:border-b-0 hover:bg-[var(--surface-dim)]"
                                    >
                                      <span className="text-xs font-bold text-[var(--text-main)]">
                                        {hit.module === "leads"
                                          ? "Lead"
                                          : hit.module === "contacts"
                                            ? "Contact"
                                            : "Client"}{" "}
                                        · {hit.label}
                                      </span>
                                      <span className="text-xs text-[var(--text-muted)]">
                                        {hit.emails.join(" · ")}
                                      </span>
                                    </button>
                                  ))
                                )}
                              </div>
                            )}
                        </div>
                      </div>
                    </>
                  )}

                {crmInboxMode && (
                  <div className="flex gap-3 border-t border-[var(--border-color)] px-3 py-2.5 sm:items-start">
                    <span className={rowLabelClass}>Log to</span>
                    <div className="min-w-0 flex-1">
                      {!toRecipientList.some((e) => e.includes("@")) &&
                        !toInputDraft.includes("@") ? (
                        <p className="py-1 text-xs italic text-[var(--text-muted)]">
                          Add a recipient (search or type an email) to match a CRM record.
                        </p>
                      ) : loadingResolve ? (
                        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Matching…
                        </div>
                      ) : crmMatches.length === 0 ? (
                        <div className="rounded-[var(--crm-radius-ui)] border border-amber-200 bg-amber-50/80 p-3">
                          <div className="flex gap-2">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                            <div>
                              <p className="text-sm font-semibold text-amber-900">
                                Not in CRM
                              </p>
                              <p className="mt-1 text-xs leading-relaxed text-amber-800/90">
                                Create a lead or confirm send without logging.
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-8 gap-1 rounded-[var(--crm-radius-ui)] border border-amber-200 bg-white px-2.5 text-xs font-bold text-amber-800 shadow-none hover:bg-amber-100"
                                  onClick={handleCreateQuickLead}
                                  disabled={isCreatingLead}
                                >
                                  {isCreatingLead ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <UserPlus className="h-3.5 w-3.5" />
                                  )}
                                  Add as lead
                                </Button>
                                <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-amber-900">
                                  <input
                                    type="checkbox"
                                    checked={acknowledgedUnknownRecipient}
                                    onChange={(e) =>
                                      setAcknowledgedUnknownRecipient(e.target.checked)
                                    }
                                    className="h-3.5 w-3.5 rounded border-amber-300"
                                  />
                                  Send anyway
                                </label>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <Select
                          value={
                            selectedCrmKey ||
                            `${crmMatches[0].module}:${crmMatches[0].entityId}`
                          }
                          onValueChange={setSelectedCrmKey}
                        >
                          <SelectTrigger className="h-9 border-[var(--border-color)] bg-white text-sm rounded-[var(--crm-radius-ui)] shadow-none">
                            <SelectValue placeholder="Record" />
                          </SelectTrigger>
                          <SelectContent className="z-[3000] max-h-72">
                            {crmMatches.map((m) => (
                              <SelectItem
                                key={`${m.module}:${m.entityId}`}
                                value={`${m.module}:${m.entityId}`}
                              >
                                {[
                                  m.module === "leads"
                                    ? "Lead"
                                    : m.module === "contacts"
                                      ? "Contact"
                                      : "Client",
                                  m.label,
                                  m.email,
                                ].join(" · ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                )}
                {crmInboxMode && toRecipientList.filter((e) => e.includes("@")).length > 1 && (
                  <div className="flex gap-3 border-t border-[var(--border-color)] px-3 py-2.5 sm:items-start">
                    <span className={rowLabelClass}>Bulk mode</span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <label className="flex items-center gap-2 text-xs text-[var(--text-main)]">
                        <input type="checkbox" checked={bulkSmartEnabled} onChange={(e) => setBulkSmartEnabled(e.target.checked)} />
                        Smart rotate sender + keep sender continuity
                      </label>
                      {bulkSmartEnabled && (
                        <div className="grid gap-2 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--surface-dim)] p-2">
                          <select className="h-8 rounded border border-[var(--border-color)] bg-white px-2 text-xs" value={bulkSplitMode} onChange={(e) => setBulkSplitMode(e.target.value as any)}>
                            <option value="round_robin">Rotate: round robin</option>
                            <option value="random">Rotate: random</option>
                            <option value="sticky_entity">Rotate: sticky per recipient</option>
                          </select>
                          <label className="flex items-center gap-2 text-xs">
                            <input type="checkbox" checked={bulkRetryOnFail} onChange={(e) => setBulkRetryOnFail(e.target.checked)} />
                            Retry with fallback mailbox if send fails
                          </label>
                          <label className="flex items-center gap-2 text-xs">
                            <input type="checkbox" checked={bulkAiPersonalize} onChange={(e) => setBulkAiPersonalize(e.target.checked)} />
                            AI personalized draft per recipient
                          </label>
                          <label className="flex items-center gap-2 text-xs">
                            <span className="min-w-[140px]">Max emails/sender in batch</span>
                            <input
                              type="number"
                              min={0}
                              value={bulkMaxPerSender || ""}
                              onChange={(e) => {
                                const v = Number(e.target.value || 0);
                                setBulkMaxPerSender(Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
                              }}
                              placeholder="No cap"
                              className="h-7 w-28 rounded border border-[var(--border-color)] px-2 text-xs"
                            />
                          </label>
                          <div className="max-h-24 overflow-y-auto rounded border border-[var(--border-color)] bg-white p-1">
                            {effectiveAccounts.map((acc) => (
                              <label key={String(acc._id)} className="flex items-center gap-2 px-1 py-0.5 text-xs">
                                <input
                                  type="checkbox"
                                  checked={bulkSplitAccountIds.includes(String(acc._id))}
                                  onChange={(e) =>
                                    setBulkSplitAccountIds((prev) =>
                                      e.target.checked
                                        ? [...new Set([...prev, String(acc._id)])]
                                        : prev.filter((id) => id !== String(acc._id))
                                    )
                                  }
                                />
                                <span>{acc.email}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 border-t border-[var(--border-color)] px-3 py-2 sm:items-center">
                  <span className={rowLabelClass}>Subject</span>
                  <div className="min-w-0 flex-1 py-1 flex items-center gap-2">
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Email subject"
                      className="h-9 min-w-0 flex-1 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--color-input)] px-2.5 text-sm text-[var(--text-main)] outline-none focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]"
                      required
                    />
                    <SubjectLineCharHint subject={subject} />
                  </div>
                </div>
                <div className="border-t border-[var(--border-color)] px-3 py-2 space-y-2">
                  <EmailSubjectLineTesterPanel
                    subject={subject}
                    bodyHtml={mergedEmailBodyHtml}
                    deliverabilityOptions={emailDeliverabilityOptions}
                  />
                  <EmailSpamWordCheckerPanel
                    subject={subject}
                    bodyHtml={mergedEmailBodyHtml}
                  />
                </div>
              </div>

              {ccQuickPick.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                    Suggested Cc
                  </span>
                  {ccQuickPick.slice(0, 4).map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => addCcAddress(String(em))}
                      className="rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white px-2 py-0.5 text-xs font-semibold text-[var(--hs-link)] hover:bg-[var(--surface-hover)]"
                    >
                      + {em}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col bg-white px-5 pb-6 pt-4">
              <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-[var(--border-color)] pb-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-[min(100%,420px)]">
                  <LayoutTemplate
                    size={14}
                    className="shrink-0 text-[var(--text-muted)]"
                  />
                  <Popover
                    open={templatePopoverOpen}
                    onOpenChange={(o) => {
                      setTemplatePopoverOpen(o);
                      if (!o) {
                        setTemplateQuery("");
                        setTemplateServiceFilter("all");
                        setTemplateAudienceFilter("all");
                        setTemplateMaterialFilter("all");
                      }
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isFetchingTemplates}
                        className="h-8 min-w-0 flex-1 justify-between gap-1.5 rounded-[var(--crm-radius-ui)] border-[var(--border-color)] px-2.5 text-xs font-semibold text-[var(--text-main)] shadow-none hover:bg-[var(--surface-hover)]"
                        aria-label="Choose email template"
                      >
                        <span className="min-w-0 truncate text-left">
                          {isFetchingTemplates ? (
                            <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Templates…
                            </span>
                          ) : (
                            <span className="text-[var(--text-main)]">
                              {selectedTemplateLabel}
                            </span>
                          )}
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="z-[3000] w-[min(100vw-2rem,400px)] p-0"
                      align="start"
                    >
                      <div className="border-b border-[var(--border-color)] p-2 space-y-2">
                        <div className="relative">
                          <Search
                            className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
                            aria-hidden
                          />
                          <input
                            type="search"
                            placeholder="Search templates…"
                            value={templateQuery}
                            onChange={(e) => setTemplateQuery(e.target.value)}
                            className="h-8 w-full rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--color-input)] py-1 pl-8 pr-2 text-xs text-[var(--text-main)] outline-none focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]"
                            aria-label="Filter templates by name or subject"
                          />
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <label className="sr-only" htmlFor="crm-template-service-filter">
                            Service
                          </label>
                          <select
                            id="crm-template-service-filter"
                            value={templateServiceFilter}
                            onChange={(e) => setTemplateServiceFilter(e.target.value)}
                            className="h-8 min-w-0 flex-1 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--color-input)] px-2 text-xs font-medium text-[var(--text-main)] outline-none focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]"
                          >
                            <option value="all">All services</option>
                            <option value="none">No service linked</option>
                            {serviceOfferings.map((s) => (
                              <option key={s._id} value={s._id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                          <select
                            id="crm-template-audience-filter"
                            value={templateAudienceFilter}
                            onChange={(e) =>
                              setTemplateAudienceFilter(
                                e.target.value as CategoryAudience,
                              )
                            }
                            className="h-8 min-w-0 flex-1 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--color-input)] px-2 text-xs font-medium text-[var(--text-main)] outline-none focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]"
                            aria-label="Filter templates by audience"
                          >
                            <option value="all">All audiences</option>
                            <option value="agency">Agency</option>
                            <option value="freelancer">Freelancer</option>
                          </select>
                          <select
                            id="crm-template-material-filter"
                            value={templateMaterialFilter}
                            onChange={(e) =>
                              setTemplateMaterialFilter(
                                e.target.value as CategoryMaterial,
                              )
                            }
                            className="h-8 min-w-0 flex-1 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--color-input)] px-2 text-xs font-medium text-[var(--text-main)] outline-none focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]"
                            aria-label="Filter templates by material (CV, portfolio, case study)"
                          >
                            <option value="all">All materials</option>
                            <option value="cv">CV</option>
                            <option value="portfolio">Portfolio</option>
                            <option value="case_study">Case study</option>
                          </select>
                        </div>
                      </div>
                      <div className="max-h-[min(50vh,280px)] overflow-y-auto p-1">
                        {isFetchingTemplates ? (
                          <div className="flex items-center justify-center gap-2 py-8 text-xs text-[var(--text-muted)]">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading…
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                void handleTemplateChange("");
                                setTemplatePopoverOpen(false);
                              }}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-[var(--crm-radius-ui)] px-2.5 py-2 text-left text-xs hover:bg-[var(--surface-hover)]",
                                !selectedTemplate ? "bg-[var(--surface-hover)]" : "",
                              )}
                            >
                              {!selectedTemplate ? (
                                <Check className="h-3.5 w-3.5 shrink-0 text-[var(--hs-link)]" />
                              ) : (
                                <span className="w-3.5 shrink-0" />
                              )}
                              <span className="font-medium text-[var(--text-main)]">
                                Blank email
                              </span>
                            </button>
                            {filteredTemplates.length === 0 ? (
                              <p className="px-2 py-6 text-center text-xs leading-relaxed text-[var(--text-muted)]">
                                {activeTemplates.length === 0
                                  ? "No templates yet. Create them under Settings → Email templates."
                                  : "No matches. Try a different search or filter (service, audience, material)."}
                              </p>
                            ) : (
                              filteredTemplates.map((t) => {
                                const id = String(t._id);
                                const sel = selectedTemplate === id;
                                const serviceLine = emailTemplateServiceLine(
                                  t,
                                  serviceOfferings,
                                );
                                return (
                                  <button
                                    key={id}
                                    type="button"
                                    onClick={() => {
                                      void handleTemplateChange(id);
                                      setTemplatePopoverOpen(false);
                                    }}
                                    className={cn(
                                      "flex w-full items-start gap-2 rounded-[var(--crm-radius-ui)] px-2.5 py-2 text-left text-xs hover:bg-[var(--surface-hover)]",
                                      sel ? "bg-[var(--surface-hover)]" : "",
                                    )}
                                  >
                                    {sel ? (
                                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--hs-link)]" />
                                    ) : (
                                      <span className="mt-0.5 w-3.5 shrink-0" />
                                    )}
                                    <span className="min-w-0 flex-1">
                                      <span className="line-clamp-2 font-medium text-[var(--text-main)]">
                                        {t.name || "Untitled"}
                                      </span>
                                      {(t.subject || t.title) && (
                                        <span className="mt-0.5 line-clamp-1 text-xs text-[var(--text-muted)]">
                                          {String(t.subject || t.title)}
                                        </span>
                                      )}
                                      <span className="mt-0.5 block text-xs font-medium leading-snug text-[var(--text-muted)]">
                                        {serviceLine}
                                      </span>
                                      <span className="mt-0.5 block text-xs font-semibold text-[var(--text-muted)]">
                                        {formatCategorySummary(
                                          t.categoryAudience,
                                          t.categoryMaterial,
                                        )}
                                      </span>
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <Popover
                  open={snippetPopoverOpen}
                  onOpenChange={(o) => {
                    setSnippetPopoverOpen(o);
                    if (!o) {
                      setSnippetQuery("");
                      setSnippetServiceFilter("all");
                      setSnippetAudienceFilter("all");
                      setSnippetMaterialFilter("all");
                    }
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isFetchingSnippets}
                      className="h-8 gap-1.5 rounded-[var(--crm-radius-ui)] border-[var(--border-color)] text-xs font-semibold text-[var(--text-main)] shadow-none hover:bg-[var(--surface-hover)]"
                    >
                      <Braces size={14} />
                      Snippets
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="z-[3000] w-[min(100vw-2rem,400px)] p-0"
                    align="start"
                  >
                    <div className="border-b border-[var(--border-color)] p-2 space-y-2">
                      <div className="relative">
                        <Search
                          className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
                          aria-hidden
                        />
                        <input
                          type="search"
                          placeholder="Search snippets…"
                          value={snippetQuery}
                          onChange={(e) => setSnippetQuery(e.target.value)}
                          className="h-8 w-full rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--color-input)] py-1 pl-8 pr-2 text-xs text-[var(--text-main)] outline-none focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]"
                          aria-label="Filter snippets by name or shortcut"
                        />
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label className="sr-only" htmlFor="crm-snippet-service-filter">
                          Service
                        </label>
                        <select
                          id="crm-snippet-service-filter"
                          value={snippetServiceFilter}
                          onChange={(e) => setSnippetServiceFilter(e.target.value)}
                          className="h-8 min-w-0 flex-1 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--color-input)] px-2 text-xs font-medium text-[var(--text-main)] outline-none focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]"
                        >
                          <option value="all">All services</option>
                          <option value="none">No service linked</option>
                          {serviceOfferings.map((sv) => (
                            <option key={sv._id} value={sv._id}>
                              {sv.name}
                            </option>
                          ))}
                        </select>
                        <select
                          id="crm-snippet-audience-filter"
                          value={snippetAudienceFilter}
                          onChange={(e) =>
                            setSnippetAudienceFilter(
                              e.target.value as CategoryAudience,
                            )
                          }
                          className="h-8 min-w-0 flex-1 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--color-input)] px-2 text-xs font-medium text-[var(--text-main)] outline-none focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]"
                          aria-label="Filter snippets by audience"
                        >
                          <option value="all">All audiences</option>
                          <option value="agency">Agency</option>
                          <option value="freelancer">Freelancer</option>
                        </select>
                        <select
                          id="crm-snippet-material-filter"
                          value={snippetMaterialFilter}
                          onChange={(e) =>
                            setSnippetMaterialFilter(
                              e.target.value as CategoryMaterial,
                            )
                          }
                          className="h-8 min-w-0 flex-1 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--color-input)] px-2 text-xs font-medium text-[var(--text-main)] outline-none focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]"
                          aria-label="Filter snippets by material (CV, portfolio, case study)"
                        >
                          <option value="all">All materials</option>
                          <option value="cv">CV</option>
                          <option value="portfolio">Portfolio</option>
                          <option value="case_study">Case study</option>
                        </select>
                      </div>
                    </div>
                    <div className="max-h-[min(50vh,280px)] overflow-y-auto p-1">
                      {isFetchingSnippets ? (
                        <div className="flex items-center justify-center gap-2 py-8 text-xs text-[var(--text-muted)]">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading…
                        </div>
                      ) : filteredSnippets.length === 0 ? (
                        <p className="px-2 py-6 text-center text-xs leading-relaxed text-[var(--text-muted)]">
                          {snippets.length === 0
                            ? "No snippets yet. Add them under Settings → Snippets."
                            : "No matches. Try a different search or filter (service, audience, material)."}
                        </p>
                      ) : (
                        filteredSnippets.map((s) => (
                          <div
                            key={s._id}
                            className="flex items-stretch gap-0.5 rounded-[var(--crm-radius-ui)] hover:bg-[var(--surface-hover)]"
                          >
                            <button
                              type="button"
                              onClick={() => insertSnippetAtCursor(s)}
                              className="flex min-w-0 flex-1 flex-col gap-0.5 px-2.5 py-2 text-left text-xs"
                            >
                              <span className="font-semibold text-[var(--text-main)]">
                                {s.name}
                              </span>
                              {s.shortcut ? (
                                <span className="font-mono text-xs text-[var(--text-muted)]">
                                  /{s.shortcut}
                                </span>
                              ) : null}
                              <span className="text-xs font-medium leading-snug text-[var(--text-muted)]">
                                {emailTemplateServiceLine(s, serviceOfferings)}
                              </span>
                              <span className="text-xs font-semibold text-[var(--text-muted)]">
                                {formatCategorySummary(
                                  s.categoryAudience,
                                  s.categoryMaterial,
                                )}
                              </span>
                              <span className="text-xs text-[var(--text-muted)]">
                                Insert at cursor
                              </span>
                            </button>
                            <button
                              type="button"
                              title="Copy plain text (merged)"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void copySnippetMergedPlain(s);
                              }}
                              className="flex shrink-0 items-center justify-center self-center rounded-[var(--crm-radius-ui)] p-2 text-[var(--text-muted)] hover:bg-white hover:text-[var(--hs-link)]"
                            >
                              <Copy size={16} aria-hidden />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                {canUseAiDraft && aiPersonDraftAvailable === true ? (
                  <div className="flex items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-[var(--text-muted)]">
                      <Checkbox
                        checked={autoAiDraftOnOpen}
                        onCheckedChange={(checked) => {
                          const v = checked === true;
                          setAutoAiDraftOnOpen(v);
                          try {
                            localStorage.setItem(
                              "crm:auto-ai-draft-on-open",
                              v ? "1" : "0",
                            );
                          } catch {
                            /* ignore storage failure */
                          }
                        }}
                      />
                      Auto AI
                    </label>
                    <Popover
                      open={aiDraftPopoverOpen}
                      onOpenChange={(o) => {
                        setAiDraftPopoverOpen(o);
                        if (!o) {
                          setAiInstructions("");
                          setAiContextGaps(null);
                        }
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={aiDrafting}
                          className="h-8 gap-1.5 rounded-[var(--crm-radius-ui)] border-[var(--border-color)] text-xs font-semibold text-[var(--text-main)] shadow-none hover:bg-[var(--surface-hover)]"
                        >
                          {aiDrafting ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Sparkles size={14} />
                          )}
                          Draft with AI
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="z-[3000] w-[min(100vw-2rem,360px)] p-4 flex flex-col gap-3 bg-white border border-[var(--border-color)] shadow-xl"
                        align="start"
                      >
                        <p className="text-xs font-semibold leading-snug text-[var(--text-main)]">
                          Drafts use CRM context and email thread context (for replies)
                          plus your team’s positioning from{" "}
                          <Link
                            href="/crm/settings/ai-outreach"
                            className="text-[var(--hs-link)] underline"
                          >
                            CRM Settings → AI outreach
                          </Link>
                          . Pipeline-specific context applies for leads. Edit before sending.
                        </p>
                        {aiContextGaps?.length ? (
                          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                            Missing CRM context: {aiContextGaps.join(", ")}. Draft may ask a clarifying question.
                          </p>
                        ) : null}
                        <textarea
                          value={aiInstructions}
                          onChange={(e) => setAiInstructions(e.target.value)}
                          placeholder="Optional: tone, offer, or points to stress…"
                          rows={3}
                          className="mt-2 w-full resize-y rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--color-input)] px-2.5 py-2 text-xs text-[var(--text-main)] outline-none focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]"
                        />
                        <Button
                          type="button"
                          size="sm"
                          disabled={aiDrafting}
                          onClick={() => void runAiDraft()}
                          className="h-9 w-full gap-2 rounded-[var(--crm-radius-ui)] bg-[var(--hs-link)] text-xs font-bold text-white hover:opacity-90 shadow-sm transition-all"
                          style={{ backgroundColor: "var(--hs-link)" }}
                        >
                          {aiDrafting ? (
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
                  </div>
                ) : canUseAiDraft && aiPersonDraftAvailable === false ? (
                  <span
                    className="max-w-[220px] text-xs leading-snug text-[var(--text-muted)]"
                    title="Optional feature — set ANTHROPIC_API_KEY on the API server to enable."
                  >
                    AI draft unavailable (no API key or disabled in settings).
                  </span>
                ) : null}
                <input
                  ref={attachmentsInputRef}
                  type="file"
                  id="email-attachments"
                  className="hidden"
                  multiple
                  onChange={(e) => {
                    const picked = e.target.files
                      ? Array.from(e.target.files)
                      : [];
                    e.target.value = "";
                    if (!picked.length) return;
                    const tooLarge = picked.filter(
                      (f) => f.size > MAX_ATTACHMENT_BYTES,
                    );
                    if (tooLarge.length) {
                      toast.error(
                        `Each attachment must be under 10 MB. Skipped: ${tooLarge
                          .map((f) => f.name)
                          .join(", ")}`,
                      );
                    }
                    const ok = picked.filter(
                      (f) => f.size <= MAX_ATTACHMENT_BYTES,
                    );
                    if (!ok.length) return;
                    setAttachments((prev) => [...prev, ...ok]);
                    toast.success(
                      ok.length === 1
                        ? `Attached ${ok[0].name}`
                        : `Attached ${ok.length} files`,
                    );
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => attachmentsInputRef.current?.click()}
                  className="h-8 gap-1.5 rounded-[var(--crm-radius-ui)] border-[var(--border-color)] text-xs font-semibold text-[var(--text-main)] shadow-none hover:bg-[var(--surface-hover)]"
                >
                  <Paperclip size={14} />
                  Attach
                  {attachments.length > 0 ? (
                    <span className="ml-0.5 rounded-full bg-[var(--primary)] px-1.5 py-px text-[10px] font-bold text-white">
                      {attachments.length}
                    </span>
                  ) : null}
                </Button>
                <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs font-medium text-[var(--text-main)]">
                  <input
                    type="checkbox"
                    checked={saveCcToRecord}
                    onChange={(e) => setSaveCcToRecord(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-[var(--border-color)]"
                  />
                  Save Cc on record
                </label>
              </div>

              {attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {attachments.map((file, idx) => (
                    <div
                      key={`${file.name}-${idx}`}
                      className="flex max-w-full items-center gap-2 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--surface-dim)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-main)]"
                    >
                      <File size={12} className="shrink-0 text-[var(--text-muted)]" />
                      <span className="truncate">{file.name}</span>
                      <span className="shrink-0 text-xs text-[var(--text-muted)]">
                        {(file.size / 1024).toFixed(0)} KB
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setAttachments((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="shrink-0 text-[var(--text-muted)] hover:text-[var(--error)]"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <RichTextEditor
                content={body}
                onChange={setBody}
                editorRef={bodyEditorRef}
                placeholder="Write your email…"
                className="min-h-[min(400px,52vh)] border border-[var(--border-color)] rounded-[var(--crm-radius-ui)] bg-white"
              />

              {replyQuotedHtml?.trim() ? (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold text-[var(--text-muted)]">
                    {replyQuotedMeta?.title || "Original message"} (included when you send)
                  </p>
                  <iframe
                    title="Quoted original email"
                    className="w-full min-h-[min(280px,40vh)] rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white"
                    sandbox=""
                    srcDoc={buildCrmEmailPreviewSrcDoc(replyQuotedHtml)}
                  />
                </div>
              ) : null}

              <div className="mt-4 flex gap-2.5 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--surface-dim)] px-3 py-2.5">
                <Info
                  className="mt-0.5 h-4 w-4 shrink-0 text-[var(--hs-link)]"
                  aria-hidden
                />
                <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                  When the server has an optional AI key configured,{" "}
                  <strong className="text-[var(--text-main)]">Draft with AI</strong>{" "}
                  can build a subject and body from the linked lead or contact
                  (including LinkedIn post context when captured). Otherwise email
                  works as usual with templates and snippets. Templates fill from
                  the linked CRM record (lead, contact, …)—for example{" "}
                  <code className="rounded bg-white px-1 py-0.5 font-mono text-xs text-[var(--text-main)] ring-1 ring-[var(--border-color)]">
                    {"{{firstName}}"}
                  </code>
                  ,{" "}
                  <code className="rounded bg-white px-1 py-0.5 font-mono text-xs text-[var(--text-main)] ring-1 ring-[var(--border-color)]">
                    {"{{companyName}}"}
                  </code>
                  . Optional fallback:{" "}
                  <code className="rounded bg-white px-1 py-0.5 font-mono text-xs text-[var(--text-main)] ring-1 ring-[var(--border-color)]">
                    {"{{firstName|there}}"}
                  </code>
                  . Snippets: insert HTML at the cursor or use the copy icon for plain text (merged for the linked record). Manage under Settings → Snippets. Full email shells: Settings → Email templates.
                </p>
              </div>
            </div>
          </div>



          <footer className="flex shrink-0 flex-col gap-3 border-t border-[var(--border-color)] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--text-muted)]">
              {sendLimitStatus.loading ? (
                <>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                  <span className="truncate">Checking send limits…</span>
                </>
              ) : selectedFromLabel && effectiveAccounts.length > 0 ? (
                <>
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      sendLimitStatus.blocked ? "bg-rose-500" : "bg-emerald-500",
                    )}
                  />
                  <span className="truncate">
                    Sending as{" "}
                    <span className="font-semibold text-[var(--text-main)]">
                      {selectedFromLabel.email}
                    </span>
                    {sendLimitStatus.blocked ? " · blocked by send cap" : ""}
                  </span>
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span>Server send (no inbox)</span>
                </>
              )}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between w-full">
              <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
                <EmailSubjectLineTesterPanel
                  subject={subject}
                  bodyHtml={mergedEmailBodyHtml}
                  compact
                  className="min-w-0"
                  deliverabilityOptions={emailDeliverabilityOptions}
                />
                <EmailSpamWordCheckerPanel
                  subject={subject}
                  bodyHtml={mergedEmailBodyHtml}
                  compact
                  className="min-w-0"
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2 sm:gap-2">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={onClose}
                  className="h-9 rounded-[var(--crm-radius-ui)] px-4 text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)]"
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={isSavingDraft || isFetchingTemplates}
                  className="h-9 rounded-[var(--crm-radius-ui)] border-[var(--border-color)] px-4 text-sm font-semibold shadow-none hover:bg-[var(--surface-hover)]"
                >
                  {isSavingDraft ? "Saving…" : "Save draft"}
                </Button>
                <Button
                  variant="default"
                  type="submit"
                  disabled={
                    sending ||
                    sendLimitStatus.loading ||
                    sendLimitStatus.blocked ||
                    suppressedRecipients.length > 0 ||
                    loadingAccounts ||
                    (crmInboxMode
                      ? !toRecipientList.some((e) => e.trim().includes("@"))
                      : !manualEmail.trim()) ||
                    (crmInboxMode &&
                      (loadingResolve ||
                        (!crmMatches.length && !acknowledgedUnknownRecipient)))
                  }
                  className="h-9 gap-2 rounded-[var(--crm-radius-ui)] bg-[var(--primary)] px-5 text-sm font-bold text-white shadow-[var(--crm-shadow-button-hover)] hover:bg-[var(--primary-dark)] hover:shadow-md"
                >
                  {sending ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send size={16} strokeWidth={2.25} />
                      Send
                    </>
                  )}
                </Button>
              </div>
            </div>
          </footer>
        </form>
      </div>
    </>
  );

  const portalTree = (
    <>
      {modalContent}
      <BulkEmailSendResultDialog
        open={bulkSendReportOpen}
        report={bulkSendReport}
        onOpenChange={(open) => {
          if (!open) handleBulkSendReportDone();
          else setBulkSendReportOpen(true);
        }}
        onDone={handleBulkSendReportDone}
      />
    </>
  );

  return typeof document !== "undefined"
    ? <CrmJiraPortal>{portalTree}</CrmJiraPortal>
    : null;
}
