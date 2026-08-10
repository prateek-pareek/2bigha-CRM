import type { PlaybookSectionType } from "@/lib/crm/playbook-types";
import { isRichTextEmpty } from "@/lib/suite/rich-text";

export const PLAYBOOK_SECTION_LABEL: Record<PlaybookSectionType, string> = {
  script: "Script",
  checklist: "Checklist",
  qa: "Q&A",
  notes: "Notes",
};

export const PLAYBOOK_CALL_OUTCOMES = [
  "Scheduled follow-up",
  "Qualified",
  "Not a fit",
  "No answer",
  "Other",
] as const;

export const APPLIES_TO_LABEL: Record<string, string> = {
  Any: "All record types",
  Lead: "Leads",
  Deal: "Deals",
  Contact: "Contacts",
  Organization: "Companies",
  Client: "Clients",
};

export function playbookHasGuidance(content: string | undefined): boolean {
  return Boolean((content || "").trim());
}

export function playbookHasRenderableBody(
  content: string | undefined,
  sections?: { html?: string }[],
): boolean {
  if (playbookHasGuidance(content)) return true;
  return (sections || []).some((s) => s?.html && !isRichTextEmpty(s.html));
}

/** Single-line preview for list rows (search / subtitles). */
export function playbookGuidancePreview(
  content: string | undefined,
  maxLen = 72,
): string {
  const t = (content || "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  return t.length <= maxLen ? t : `${t.slice(0, maxLen)}…`;
}

export function playbookGuidanceCharCount(content: string | undefined): number {
  return (content || "").trim().length;
}

export function playbookBodyCharCount(
  content: string | undefined,
  sections?: { html?: string }[],
): number {
  let n = playbookGuidanceCharCount(content);
  for (const s of sections || []) {
    n += (s.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      .length;
  }
  return n;
}
