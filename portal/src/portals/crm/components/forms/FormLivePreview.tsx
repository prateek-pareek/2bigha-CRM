"use client";

import { useMemo } from "react";
import { Eye } from "lucide-react";
import type { FormField } from "@/lib/crm/forms";
import { FormPublicFieldInput } from "./FormPublicFields";

type Props = {
  name: string;
  description?: string;
  fields: FormField[];
  submitButtonLabel: string;
  accentColor?: string;
};

/** Read-only live preview of how the public form will look to visitors. */
export default function FormLivePreview({
  name,
  description,
  fields,
  submitButtonLabel,
  accentColor,
}: Props) {
  const accent = accentColor || "#ff5c35";
  const sorted = useMemo(
    () => [...fields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [fields],
  );

  return (
    <div className="rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--background)] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[var(--border-color)] px-4 py-2.5">
        <Eye size={14} className="text-[var(--text-muted)]" />
        <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          Live preview
        </p>
      </div>
      <div className="p-4 sm:p-5">
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">{name || "Untitled form"}</h3>
          {description ? <p className="text-sm text-gray-500 mb-5">{description}</p> : <div className="mb-5" />}
          {sorted.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Add fields to preview the form.</p>
          ) : (
            <div className="space-y-4 pointer-events-none select-none opacity-95">
              {sorted.map((field) => (
                <FormPublicFieldInput
                  key={field.key}
                  field={field}
                  value={undefined}
                  onChange={() => {}}
                  accent={accent}
                />
              ))}
              <button
                type="button"
                tabIndex={-1}
                className="w-full h-11 rounded-md text-white text-sm font-semibold"
                style={{ backgroundColor: accent }}
              >
                {submitButtonLabel || "Submit"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
