"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

const LBL = "block text-xs font-semibold text-[var(--text-muted)] mb-1";
const INP =
  "w-full h-9 bg-white border border-[var(--border-color)] rounded-md px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--primary-muted)] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all";

interface CrmMultiEmailListFieldProps {
  /** Form field name; repeated inputs with same name → getAll */
  name?: string;
  initialEmails?: string[];
  label?: string;
  hint?: string;
  /** HubSpot-style (default) vs compact */
  visualVariant?: "default" | "hubspot";
}

export default function CrmMultiEmailListField({
  name = "additionalEmails",
  initialEmails = [],
  label = "Additional email addresses",
  hint = "Work, personal, or aliases — used for CC suggestions and matching inbox activity.",
  visualVariant = "hubspot",
}: CrmMultiEmailListFieldProps) {
  const seeded = (initialEmails || []).map((e) => String(e || "").trim()).filter(Boolean);
  const [rows, setRows] = useState<string[]>(() => (seeded.length ? seeded : [""]));

  useEffect(() => {
    const next = (initialEmails || []).map((e) => String(e || "").trim()).filter(Boolean);
    setRows((prev) => {
      const nextRows = next.length ? next : [""];
      return JSON.stringify(prev) === JSON.stringify(nextRows) ? prev : nextRows;
    });
  }, [initialEmails]);

  const vv = visualVariant === "hubspot" ? "hubspot" : "default";
  const labelCls = vv === "hubspot" ? LBL : "text-xs font-black text-text-muted ";

  return (
    <div className="space-y-2">
      <div>
        <span className={labelCls}>{label}</span>
        {hint ? <p className="mt-0.5 text-xs text-[var(--primary-muted)] font-normal leading-snug">{hint}</p> : null}
      </div>
      <div className="space-y-2">
        {rows.map((val, i) => (
          <div key={i} className="flex gap-2 items-start">
            <input
              type="email"
              name={name}
              defaultValue={val}
              placeholder={i === 0 ? "name@company.com" : "another@…"}
              className={vv === "hubspot" ? INP : "w-full bg-card border rounded-[var(--radius-md)] py-2.5 px-4 text-sm outline-none flex-1"}
              autoComplete="email"
            />
            {rows.length > 1 ? (
              <button
                type="button"
                className="shrink-0 p-2 rounded-md border border-[var(--border-color)] text-text-muted hover:text-rose-500 hover:border-rose-200 transition-colors"
                title="Remove row"
                onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
              >
                <X size={16} />
              </button>
            ) : (
              <span className="w-10 shrink-0" aria-hidden />
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, ""])}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--hs-link)] hover:underline"
      >
        <Plus size={14} /> Add another email
      </button>
    </div>
  );
}
