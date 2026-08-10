"use client";

import { useId } from "react";
import { FileText, PenLine, Sparkles } from "lucide-react";
import RichTextEditor from '@/components/suite/editors/RichTextEditor';
import EmailSpamWordCheckerPanel from "@/components/crm/email/deliverability/EmailSpamWordCheckerPanel";
import EmailSubjectLineTesterPanel from "@/components/crm/email/deliverability/EmailSubjectLineTesterPanel";
import { cn } from "@/lib/utils";
import type { CadenceMilestone } from "@/lib/crm/follow-up-cadence";
import { FollowUpAiDraftButton } from "@/components/crm/automation/playbooks/FollowUpAiDraftButton";
import { CrmDropdown, type CrmDropdownOption } from "@/components/crm/ui";

type TemplateOption = { _id: string; name: string };

export type FollowUpEmailAiDraftConfig = {
  entityType: "Lead" | "Contact";
  entityId: string;
  contextInstructions: string;
  available: boolean | null;
};

type Props = {
  row: CadenceMilestone;
  templates: TemplateOption[];
  disabled?: boolean;
  onChange: (patch: Partial<CadenceMilestone>) => void;
  /** Stable prefix for field ids (accessibility in stacked panels). */
  fieldIdPrefix?: string;
  /** Tighter layout when nested inside accordion rows. */
  compact?: boolean;
  aiDraft?: FollowUpEmailAiDraftConfig;
};

export function FollowUpStepEmailEditor({
  row,
  templates,
  disabled,
  onChange,
  fieldIdPrefix = "follow-up-email",
  compact = false,
  aiDraft,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const prefix = `${fieldIdPrefix}-${uid}`;
  const isCustom = row.contentMode === "custom";
  const isAiDraft = row.contentMode === "ai_draft";
  const subjectId = `${prefix}-subject`;
  const bodyId = `${prefix}-body`;
  const templateId = `${prefix}-template`;

  return (
    <div className="flex flex-col gap-3 w-full min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-[var(--text-muted)]">Message</span>
        {aiDraft ? (
          <FollowUpAiDraftButton
            entityType={aiDraft.entityType}
            entityId={aiDraft.entityId}
            contextInstructions={aiDraft.contextInstructions}
            available={aiDraft.available}
            disabled={disabled}
            onDraft={(subject, bodyHtml) =>
              onChange({
                contentMode: "custom",
                customSubject: subject,
                customBodyHtml: bodyHtml,
              })
            }
          />
        ) : null}
        <div className="inline-flex rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--surface-dim)] p-0.5">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ contentMode: "custom" })}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[calc(var(--crm-radius-ui)-2px)] px-2.5 py-1.5 text-xs font-semibold transition-colors",
              isCustom
                ? "bg-white text-[var(--text-main)] shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-main)]",
            )}
          >
            <PenLine size={12} />
            Custom
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ contentMode: "template" })}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[calc(var(--crm-radius-ui)-2px)] px-2.5 py-1.5 text-xs font-semibold transition-colors",
              !isCustom && !isAiDraft
                ? "bg-white text-[var(--text-main)] shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-main)]",
            )}
          >
            <FileText size={12} />
            Template
          </button>
          {aiDraft ? (
            <button
              type="button"
              disabled={disabled || aiDraft.available === false}
              onClick={() => onChange({ contentMode: "ai_draft" })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[calc(var(--crm-radius-ui)-2px)] px-2.5 py-1.5 text-xs font-semibold transition-colors",
                isAiDraft
                  ? "bg-white text-[var(--text-main)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)]",
              )}
            >
              <Sparkles size={12} />
              AI at send
            </button>
          ) : null}
        </div>
      </div>

      {isAiDraft ? (
        <p className="text-xs leading-relaxed text-[var(--text-muted)] rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--surface-dim)] px-3 py-2.5">
          AI drafts this email when the step runs (personalized from the lead/contact record).
          You can still use <strong>Draft now</strong> above to preview copy before scheduling.
        </p>
      ) : isCustom ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label
              htmlFor={subjectId}
              className="text-xs font-semibold text-[var(--text-main)] block"
            >
              Subject
            </label>
            <input
              id={subjectId}
              type="text"
              value={row.customSubject}
              disabled={disabled}
              onChange={(e) => onChange({ customSubject: e.target.value })}
              placeholder="Quick follow-up on your inquiry"
              className="w-full h-10 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] px-3 text-sm text-[var(--text-main)] bg-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={bodyId} className="text-xs font-semibold text-[var(--text-main)] block">
              Body
            </label>
            <div
              id={bodyId}
              className="w-full min-w-0 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white overflow-hidden"
            >
              <RichTextEditor
                content={row.customBodyHtml || "<p></p>"}
                onChange={(html) => onChange({ customBodyHtml: html })}
                readOnly={disabled}
                placeholder="Write your follow-up…"
                imageUploadContext="crm"
                imageUploadPreset="inline"
                insertImageAtCursor
                shellMinHeightClass={compact ? "min-h-[220px]" : "min-h-[280px]"}
                bodyMinHeightClass={compact ? "min-h-[180px]" : "min-h-[220px] max-h-[min(420px,42vh)]"}
              />
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              Merge fields like {"{{firstName}}"} fill when the email sends — same as compose.
            </p>
          </div>

          <details className="rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--surface-dim)]/60">
            <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-semibold text-[var(--text-main)] [&::-webkit-details-marker]:hidden">
              Deliverability check (optional)
            </summary>
            <div className="space-y-3 border-t border-[var(--border-color)] px-3 py-3">
              <EmailSubjectLineTesterPanel
                subject={row.customSubject}
                bodyHtml={row.customBodyHtml}
                compact
                deliverabilityOptions={{
                  attachmentCount: 0,
                  isFirstEmailToRecipient: false,
                }}
              />
              <EmailSpamWordCheckerPanel
                subject={row.customSubject}
                bodyHtml={row.customBodyHtml}
                compact
              />
            </div>
          </details>
        </div>
      ) : (
        <div className="space-y-1.5">
          <label htmlFor={templateId} className="text-xs font-semibold text-[#0f172a] block">
            Saved template
          </label>
          <CrmDropdown
            value={row.templateId}
            disabled={disabled}
            onChange={(val) => onChange({ templateId: val })}
            options={[
              { value: "", label: "Select a template…" },
              ...templates.map((tpl) => ({ value: tpl._id, label: tpl.name })),
            ]}
            className="w-full"
            buttonClassName="h-10 w-full justify-between border-[#e2e8f0] bg-white text-sm font-semibold text-[#0f172a] hover:border-[#2563eb]/40"
            placeholder="Select a template…"
          />
        </div>
      )}
    </div>
  );
}
