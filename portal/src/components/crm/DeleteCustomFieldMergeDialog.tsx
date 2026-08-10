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
import { CRM_API_URL } from "@/lib/api/config";
import { getCoreMergeTargetOptions } from "@/lib/crm/custom-field-merge-targets";
import type { CrmModuleKey } from "@/lib/crm/crm-field-layout";
import { cn } from "@/lib/utils";
import { crmModalChrome } from "@/lib/pm/jira-ui";
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
          "crm-jira-modal pm-create-issue-dialog gap-0 overflow-hidden border border-[#dfe1e6] bg-white p-0 shadow-lg sm:max-w-[460px]",
          "rounded-[3px]",
        )}
      >
        <div className={cn(crmModalChrome.centerHeader, "border-b border-[#dfe1e6]")}>
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] bg-[#ffebe6] text-[#de350b]"
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
                    <span className="font-medium text-[#172b4d]">"{field.name}"</span>
                    <span className="font-mono text-xs text-[#97a0af]"> · {field.key}</span>
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
              className="flex gap-3 rounded-[3px] border border-[#dfe1e6] bg-[#deebff]/50 p-3 text-left"
              role="note"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] bg-[#deebff] text-[#0c66e4]">
                <Info className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <p className="text-sm leading-relaxed text-[#42526e]">
                <span className="font-medium text-[#172b4d]">Optional merge.</span> Move values into another field
                before removing this one. We only fill empty targets—nothing gets overwritten.
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="merge-custom-field-target"
                className="flex items-center gap-2 text-xs font-semibold text-[#5e6c84]"
              >
                <GitMerge className="h-3.5 w-3.5 text-[#0c66e4]" strokeWidth={1.75} />
                Merge data into
              </label>
              <Select value={mergeInto} onValueChange={setMergeInto} disabled={saving}>
                <SelectTrigger
                  id="merge-custom-field-target"
                  className="h-8 rounded-[3px] border-[#dfe1e6] bg-white px-3 text-sm font-normal text-[#172b4d] focus:ring-1 focus:ring-[#0c66e4]/30"
                >
                  <SelectValue placeholder="Choose a target field" />
                </SelectTrigger>
                <SelectContent className="z-[100] max-h-[min(320px,var(--radix-select-content-available-height))] rounded-[3px] border-[#dfe1e6] shadow-lg">
                  <SelectGroup>
                    <SelectLabel className="pl-2 text-xs font-semibold text-[#5e6c84]">Options</SelectLabel>
                    <SelectItem value={MERGE_NONE} className="rounded-[3px] py-2 pl-8 text-sm">
                      Do not merge — only remove this property
                    </SelectItem>
                  </SelectGroup>

                  {coreOptions.length > 0 && (
                    <>
                      <SelectSeparator className="my-1 bg-[#ebecf0]" />
                      <SelectGroup>
                        <SelectLabel className="pl-2 text-xs font-semibold text-[#5e6c84]">
                          Standard fields
                        </SelectLabel>
                        {coreOptions.map((o) => (
                          <SelectItem key={o.key} value={o.key} className="rounded-[3px] py-2 pl-8 text-sm">
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </>
                  )}

                  {siblingCustomFields.length > 0 && (
                    <>
                      <SelectSeparator className="my-1 bg-[#ebecf0]" />
                      <SelectGroup>
                        <SelectLabel className="pl-2 text-xs font-semibold text-[#5e6c84]">
                          Other custom properties
                        </SelectLabel>
                        {siblingCustomFields.map((f) => (
                          <SelectItem key={f._id} value={f.key} className="rounded-[3px] py-2 pl-8 text-sm">
                            {`${f.name} (${f.key})`}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs leading-relaxed text-[#5e6c84]">
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
            className="h-8 rounded-[3px] border-[#dfe1e6] bg-white px-4 text-sm font-medium text-[#42526e] hover:bg-[#f4f5f7]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={saving || !field}
            onClick={handleConfirm}
            className="h-8 rounded-[3px] bg-[#de350b] px-4 text-sm font-medium hover:bg-[#bf2600]"
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
