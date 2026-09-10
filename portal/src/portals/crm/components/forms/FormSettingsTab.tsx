"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { fetchCrmPipelines } from "@/lib/crm/shared/pipelines-api";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import { leadPipelineId, type FormDefinition } from "@/lib/crm/forms";
import { CRM_HS_CONTROL_CLASS, CRM_HS_LABEL_CLASS } from "@/components/crm/records/forms/crm-form-primitives";
import { cn } from "@/lib/utils";

const LBL = CRM_HS_LABEL_CLASS;
const INP = CRM_HS_CONTROL_CLASS;

const ACCENT_PRESETS = [
  "#ff5c35",
  "#e11d48",
  "#d97706",
  "#059669",
  "#2563eb",
  "#7c3aed",
  "#0f172a",
  "#64748b",
];

function normalizeHex(value: string): string | null {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return `#${v.slice(1).toLowerCase()}`;
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v.toLowerCase()}`;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const r = v[1];
    const g = v[2];
    const b = v[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

function FormAccentColorField({
  value,
  buttonLabel,
  onChange,
}: {
  value?: string;
  buttonLabel: string;
  onChange: (color: string) => void;
}) {
  const color = normalizeHex(value || "") || "#ff5c35";
  const [hexDraft, setHexDraft] = useState(color);

  useEffect(() => {
    setHexDraft(color);
  }, [color]);

  const commitHex = (raw: string) => {
    const next = normalizeHex(raw);
    if (next) onChange(next);
    else setHexDraft(color);
  };

  return (
    <div className="space-y-2.5">
      <label className={LBL}>Accent color</label>
      <p className="-mt-1 text-xs text-[var(--text-muted)]">
        Used for the public form submit button. Pick a preset or enter a hex code.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {ACCENT_PRESETS.map((preset) => {
          const selected = color.toLowerCase() === preset;
          return (
            <button
              key={preset}
              type="button"
              title={preset}
              aria-label={`Use ${preset}`}
              aria-pressed={selected}
              onClick={() => onChange(preset)}
              className={cn(
                "h-8 w-8 rounded-full border-2 shadow-sm transition-transform hover:scale-105",
                selected ? "border-[var(--text-main)] ring-2 ring-[var(--text-main)]/15" : "border-white",
              )}
              style={{ backgroundColor: preset }}
            >
              {selected ? <Check size={14} className="mx-auto text-white drop-shadow" strokeWidth={3} /> : null}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2 max-w-[240px]">
        <span
          className="h-[38px] w-[38px] shrink-0 rounded-[var(--radius-md)] border border-[var(--border-color)] shadow-[var(--crm-shadow-input)]"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <input
          className={`${INP} font-mono uppercase`}
          value={hexDraft}
          maxLength={7}
          spellCheck={false}
          aria-label="Accent color hex"
          onChange={(e) => {
            const raw = e.target.value;
            setHexDraft(raw);
            const next = normalizeHex(raw);
            if (next) onChange(next);
          }}
          onBlur={() => commitHex(hexDraft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitHex(hexDraft);
            }
          }}
        />
      </div>
      <div className="pt-1">
        <span className="mb-1.5 block text-[11px] font-medium text-[var(--text-muted)]">Button preview</span>
        <button
          type="button"
          tabIndex={-1}
          className="h-10 min-w-[140px] rounded-md px-4 text-sm font-semibold text-white"
          style={{ backgroundColor: color }}
        >
          {buttonLabel || "Submit"}
        </button>
      </div>
    </div>
  );
}

type PicklistOption = { _id: string; label: string; isActive?: boolean };

async function fetchPicklist(listKey: "leadCategory" | "group"): Promise<PicklistOption[]> {
  const token = getCrmAuthToken();
  if (!token) return [];
  try {
    const res = await fetch(`${CRM_API_URL}/crm/lead-picklist-options?listKey=${listKey}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export default function FormSettingsTab({
  form,
  onChange,
}: {
  form: FormDefinition;
  onChange: (form: FormDefinition) => void;
}) {
  const [pipelines, setPipelines] = useState<{ _id: string; name?: string }[]>([]);
  const [categories, setCategories] = useState<PicklistOption[]>([]);
  const [groups, setGroups] = useState<PicklistOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [pipes, cats, grps] = await Promise.all([
        fetchCrmPipelines("leads"),
        fetchPicklist("leadCategory"),
        fetchPicklist("group"),
      ]);
      if (cancelled) return;
      setPipelines(pipes);
      setCategories(cats.filter((o) => o.isActive !== false));
      setGroups(grps.filter((o) => o.isActive !== false));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const patchDefaults = (patch: Partial<NonNullable<FormDefinition["leadDefaults"]>>) => {
    onChange({
      ...form,
      leadDefaults: { ...(form.leadDefaults || {}), ...patch },
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className="space-y-4 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--background)] p-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-main)]">Submission experience</h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            What visitors see after they fill the form.
          </p>
        </div>
        <div>
          <label className={LBL}>Submit button label</label>
          <input
            className={INP}
            value={form.submitButtonLabel}
            onChange={(e) => onChange({ ...form, submitButtonLabel: e.target.value })}
          />
        </div>
        <div>
          <label className={LBL}>Success message</label>
          <textarea
            className={`${INP} h-20 py-2`}
            value={form.successMessage}
            onChange={(e) => onChange({ ...form, successMessage: e.target.value })}
          />
        </div>
        <div>
          <label className={LBL}>Redirect URL (optional)</label>
          <input
            className={INP}
            placeholder="https://example.com/thank-you"
            value={form.redirectUrl || ""}
            onChange={(e) => onChange({ ...form, redirectUrl: e.target.value })}
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            If set, visitors are sent here instead of seeing the success message — useful for
            Meta/Google Ads conversion pixels.
          </p>
        </div>
        <FormAccentColorField
          value={form.accentColor}
          buttonLabel={form.submitButtonLabel}
          onChange={(accentColor) => onChange({ ...form, accentColor })}
        />
      </section>

      <section className="space-y-4 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--background)] p-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-main)]">Lead defaults</h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Applied to every new lead created from this form, on top of mapped answers.
          </p>
        </div>
        <div>
          <label className={LBL}>Pipeline</label>
          <select
            className={`${INP} appearance-none cursor-pointer`}
            value={leadPipelineId(form.leadDefaults?.pipeline)}
            onChange={(e) => patchDefaults({ pipeline: e.target.value || undefined })}
          >
            <option value="">Default pipeline</option>
            {pipelines.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name || p._id}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LBL}>Lead type</label>
          <select
            className={`${INP} appearance-none cursor-pointer`}
            value={form.leadDefaults?.leadCategory || ""}
            onChange={(e) => patchDefaults({ leadCategory: e.target.value || undefined })}
          >
            <option value="">Not set</option>
            {categories.map((c) => (
              <option key={c._id} value={c.label}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LBL}>Group</label>
          <select
            className={`${INP} appearance-none cursor-pointer`}
            value={form.leadDefaults?.group || ""}
            onChange={(e) => patchDefaults({ group: e.target.value || undefined })}
          >
            <option value="">Not set</option>
            {groups.map((g) => (
              <option key={g._id} value={g.label}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
      </section>
    </div>
  );
}
