"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CRM_API_URL } from '@/lib/crm/config';
import { getCoreMergeTargetOptions } from "@/lib/crm/custom-field-merge-targets";
import type { CrmModuleKey } from "@/lib/crm/crm-field-layout";
import { cn } from "@/lib/utils";
import { crmModalChrome } from "@/lib/crm/chrome";
import { toast } from "sonner";
import { GitMerge, Info, Loader2, Trash2 } from "lucide-react";

export interface CustomFieldMergeRow {
  _id: string;
  name: string;
  key: string;
}

const MERGE_NONE = "__merge_none__";

interface DeleteCustomFieldMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: CustomFieldMergeRow | null;
  module: CrmModuleKey;
  siblingCustomFields: CustomFieldMergeRow[];
  onSuccess: () => void;
}

export default function DeleteCustomFieldMergeDialog({
  open,
  onOpenChange,
  field,
  module,
  siblingCustomFields,
  onSuccess,
}: DeleteCustomFieldMergeDialogProps) {
  const [mergeInto, setMergeInto] = useState(MERGE_NONE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setMergeInto(MERGE_NONE);
  }, [open, field?._id]);

  const coreOptions = getCoreMergeTargetOptions(module);

  const handleConfirm = async () => {
    if (!field) return;
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const target = mergeInto !== MERGE_NONE ? mergeInto : undefined;
      const res = await fetch(`${CRM_API_URL}/custom-fields/${field._id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(target ? { mergeInto: target } : {}),
      });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { mergedRecords?: number };
        const n = data.mergedRecords;
        if (target && typeof n === "number") {
          toast.success(`Property removed. Merged values on ${n} record${n === 1 ? "" : "s"}.`);
        } else {
          toast.success("Property removed");
        }
        onOpenChange(false);
        onSuccess();
      } else {
        const err = await res.json().catch(() => ({ message: "Failed" }));
        toast.error((err as { message?: string }).message || "Failed to delete");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "crm-modal pm-create-issue-dialog gap-0 overflow-hidden border border-[var(--border-color)] bg-white p-0 shadow-lg sm:max-w-[460px]",
          "rounded-[var(--radius-md)]",
        )}
      >
        <div className={cn(crmModalChrome.centerHeader, "border-b border-[var(--border-color)]")}>
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--error-light)] text-[var(--error)]"
              aria-hidden
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </div>
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className={crmModalChrome.centerTitle}>Remove custom property</DialogTitle>
              <DialogDescription className={crmModalChrome.centerLead}>
                {field ? (
                  <>
                    You are about to delete{" "}
                    <span className="font-medium text-[var(--text-main)]">"{field.name}"</span>
                    <span className="font-mono text-xs text-[var(--text-muted)]"> · {field.key}</span>
                  </>
                ) : (
                  "Choose how to handle existing values on your records."
                )}
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        {field && (
          <div className="space-y-4 px-5 py-5">
            <div
              className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--primary-light)]/50 p-3 text-left"
              role="note"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-light)] text-[var(--primary)]">
                <Info className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                <span className="font-medium text-[var(--text-main)]">Optional merge.</span> Move values into another field
                before removing this one. We only fill empty targets—nothing gets overwritten.
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="merge-custom-field-target"
                className="flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)]"
              >
                <GitMerge className="h-3.5 w-3.5 text-[var(--primary)]" strokeWidth={1.75} />
                Merge data into
              </label>
              <Select value={mergeInto} onValueChange={setMergeInto} disabled={saving}>
                <SelectTrigger
                  id="merge-custom-field-target"
                  className="h-8 rounded-[var(--radius-md)] border-[var(--border-color)] bg-white px-3 text-sm font-normal text-[var(--text-main)] focus:ring-1 focus:ring-[var(--primary)]/30"
                >
                  <SelectValue placeholder="Choose a target field" />
                </SelectTrigger>
                <SelectContent className="z-[100] max-h-[min(320px,var(--radix-select-content-available-height))] rounded-[var(--radius-md)] border-[var(--border-color)] shadow-lg">
                  <SelectGroup>
                    <SelectLabel className="pl-2 text-xs font-semibold text-[var(--text-muted)]">Options</SelectLabel>
                    <SelectItem value={MERGE_NONE} className="rounded-[var(--radius-md)] py-2 pl-8 text-sm">
                      Do not merge — only remove this property
                    </SelectItem>
                  </SelectGroup>

                  {coreOptions.length > 0 && (
                    <>
                      <SelectSeparator className="my-1 bg-[var(--border-color)]" />
                      <SelectGroup>
                        <SelectLabel className="pl-2 text-xs font-semibold text-[var(--text-muted)]">
                          Standard fields
                        </SelectLabel>
                        {coreOptions.map((o) => (
                          <SelectItem key={o.key} value={o.key} className="rounded-[var(--radius-md)] py-2 pl-8 text-sm">
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </>
                  )}

                  {siblingCustomFields.length > 0 && (
                    <>
                      <SelectSeparator className="my-1 bg-[var(--border-color)]" />
                      <SelectGroup>
                        <SelectLabel className="pl-2 text-xs font-semibold text-[var(--text-muted)]">
                          Other custom properties
                        </SelectLabel>
                        {siblingCustomFields.map((f) => (
                          <SelectItem key={f._id} value={f.key} className="rounded-[var(--radius-md)] py-2 pl-8 text-sm">
                            {`${f.name} (${f.key})`}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                Tip: duplicates like "Lead Source" often merge cleanly into the built-in{" "}
                <span className="font-medium">Lead Source</span> field.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className={cn(crmModalChrome.centerFooter, "sm:flex-row sm:justify-end")}>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
            className="h-8 rounded-[var(--radius-md)] border-[var(--border-color)] bg-white px-4 text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--surface-dim)]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={saving || !field}
            onClick={handleConfirm}
            className="h-8 rounded-[var(--radius-md)] bg-[var(--error)] px-4 text-sm font-medium hover:bg-[var(--primary-dark)]"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Removing…
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Remove property
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
