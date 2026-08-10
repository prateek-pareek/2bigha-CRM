"use client";

import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  APPLIES_TO_LABEL,
  PLAYBOOK_SECTION_LABEL,
  playbookHasRenderableBody,
} from "@/lib/crm/playbook-ui";
import type { PlaybookSectionType } from "@/lib/crm/playbook-types";
import { cn } from "@/lib/utils";
import { stripCrmEmailTrackingFromHtmlForPreview } from "@/lib/crm/email-preview-iframe";

export type PlaybookPreviewPayload = {
  name: string;
  description?: string;
  appliesTo: string;
  content?: string;
  status?: string;
  sections?: {
    id: string;
    type: string;
    order: number;
    title: string;
    html: string;
  }[];
};

export default function CrmPlaybookPreviewSheet({
  open,
  onOpenChange,
  playbook,
  applyFooter,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playbook: PlaybookPreviewPayload | null;
  applyFooter?: {
    onApply: () => void;
    applying: boolean;
    disabled?: boolean;
  };
}) {
  if (!playbook) return null;

  const sections = [...(playbook.sections || [])].sort(
    (a, b) => a.order - b.order,
  );
  const hasBody = playbookHasRenderableBody(playbook.content, sections);
  const appliesLabel =
    APPLIES_TO_LABEL[playbook.appliesTo] || playbook.appliesTo;
  const isDraft = playbook.status === "draft";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-[var(--border-color)] bg-white p-0 sm:max-w-lg"
      >
        <SheetHeader className="space-y-1 border-b border-[var(--border-color)] bg-[var(--background)] px-6 py-5 text-left">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Playbook
          </p>
          <SheetTitle className="pr-8 text-lg font-semibold leading-snug text-[var(--text-main)]">
            {playbook.name}
          </SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="inline-flex rounded-md border border-[var(--border-color)] bg-white px-2.5 py-0.5 text-xs font-semibold text-[var(--text-main)]">
                {appliesLabel}
              </span>
              {isDraft ? (
                <span className="rounded-md border border-[#f5d78e] bg-[#fff8e6] px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-[#7c5c0a]">
                  Draft
                </span>
              ) : null}
            </div>
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-5 px-6 py-5">
            {playbook.description ? (
              <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                {playbook.description}
              </p>
            ) : null}

            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Guidance
              </p>
              {!hasBody ? (
                <p className="text-sm text-[var(--text-muted)]">
                  No guidance has been added to this playbook yet.
                </p>
              ) : sections.length > 0 ? (
                <div className="space-y-6">
                  {sections.map((s) => {
                    const label =
                      PLAYBOOK_SECTION_LABEL[s.type as PlaybookSectionType] ||
                      s.type;
                    return (
                      <section key={s.id}>
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--hs-link)]">
                          {label}
                          {s.title?.trim() ? ` · ${s.title}` : ""}
                        </p>
                        <div
                          className={cn(
                            "text-sm leading-relaxed text-[var(--text-main)]",
                            "[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
                            "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
                            "[&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold",
                            "[&_strong]:font-semibold [&_a]:text-[var(--hs-link)] [&_a]:underline",
                          )}
                          dangerouslySetInnerHTML={{
                            __html: stripCrmEmailTrackingFromHtmlForPreview(
                              s.html || "<p></p>",
                            ),
                          }}
                        />
                      </section>
                    );
                  })}
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-main)]">
                  {playbook.content}
                </p>
              )}
            </div>

            <div className="rounded-md border border-[var(--border-color)] bg-[var(--background)] p-4 text-xs leading-relaxed text-[var(--text-muted)]">
              <span className="font-semibold text-[var(--text-main)]">Logging: </span>
              Running this playbook adds one note to the record timeline with this
              guidance. Use <strong className="text-[var(--text-main)]">Live run</strong> from
              the record to capture Q&amp;A and log a call outcome.
            </div>
          </div>
        </ScrollArea>

        {applyFooter ? (
          <div className="shrink-0 border-t border-[var(--border-color)] bg-[var(--background)] p-4">
            <button
              type="button"
              disabled={applyFooter.disabled || applyFooter.applying || isDraft}
              onClick={() => applyFooter.onApply()}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-[var(--hs-link)] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#ff8f69] disabled:opacity-50"
            >
              {applyFooter.applying ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Log playbook to timeline
            </button>
            {isDraft ? (
              <p className="mt-2 text-center text-xs text-[var(--text-muted)]">
                Publish this playbook in settings before logging from a record.
              </p>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
