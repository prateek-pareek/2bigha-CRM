"use client";

import { useEffect, useState } from "react";
import CrmSlidePanelShell from "../shell/CrmSlidePanelShell";
import {
  FORM_FIELD_LEAD_TARGET_LABELS,
  FORM_FIELD_OPTION_TYPES,
  FORM_FIELD_TYPE_LABELS,
  slugifyFieldKey,
  type FormField,
  type FormFieldLeadTarget,
  type FormFieldType,
} from "@/lib/crm/forms";

const LBL = "block text-xs font-semibold text-[var(--text-muted)] mb-1";
const INP =
  "w-full h-9 bg-white border border-[var(--border-color)] rounded-md px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--primary-muted)] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (field: FormField) => void;
  field: FormField | null; // null = creating a new field
  existingKeys: string[];
};

const DEFAULT_FIELD: FormField = {
  key: "",
  label: "",
  type: "text",
  required: false,
  options: [],
  order: 0,
};

export default function FormFieldEditorPanel({ isOpen, onClose, onSave, field, existingKeys }: Props) {
  const [draft, setDraft] = useState<FormField>(DEFAULT_FIELD);
  const [optionsText, setOptionsText] = useState("");

  useEffect(() => {
    if (isOpen) {
      setDraft(field || { ...DEFAULT_FIELD });
      setOptionsText((field?.options || []).join("\n"));
    }
  }, [isOpen, field]);

  const needsOptions = FORM_FIELD_OPTION_TYPES.includes(draft.type);
  const isNew = !field;

  const handleSave = () => {
    const label = draft.label.trim();
    if (!label) return;
    const key = draft.key || slugifyFieldKey(label, existingKeys.filter((k) => k !== field?.key));
    const options = needsOptions
      ? optionsText.split("\n").map((o) => o.trim()).filter(Boolean)
      : [];
    onSave({ ...draft, label, key, options });
  };

  return (
    <CrmSlidePanelShell
      isOpen={isOpen}
      onClose={onClose}
      title={isNew ? "Add field" : "Edit field"}
      maxWidthClass="max-w-md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-md border border-[var(--border-color)] text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--background)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!draft.label.trim()}
            className="h-9 px-4 rounded-md bg-[var(--hs-link)] text-sm font-semibold text-white hover:bg-[var(--hs-link-hover)] disabled:opacity-50 transition-colors"
          >
            {isNew ? "Add field" : "Save field"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={LBL}>Question label</label>
          <input
            className={INP}
            placeholder="e.g. What's your budget?"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            autoFocus
          />
        </div>

        <div>
          <label className={LBL}>Field type</label>
          <select
            className={INP}
            value={draft.type}
            onChange={(e) => setDraft({ ...draft, type: e.target.value as FormFieldType })}
          >
            {Object.entries(FORM_FIELD_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {needsOptions && (
          <div>
            <label className={LBL}>Options (one per line)</label>
            <textarea
              className={`${INP} h-24 py-2`}
              placeholder={"Option A\nOption B\nOption C"}
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
            />
          </div>
        )}

        <div>
          <label className={LBL}>Placeholder text (optional)</label>
          <input
            className={INP}
            placeholder="Shown inside the empty field"
            value={draft.placeholder || ""}
            onChange={(e) => setDraft({ ...draft, placeholder: e.target.value })}
          />
        </div>

        <div>
          <label className={LBL}>Map answer to a Lead field</label>
          <select
            className={INP}
            value={draft.mapsTo || ""}
            onChange={(e) =>
              setDraft({ ...draft, mapsTo: (e.target.value || undefined) as FormFieldLeadTarget | undefined })
            }
          >
            <option value="">Custom field (stored on the lead's Custom Fields)</option>
            {Object.entries(FORM_FIELD_LEAD_TARGET_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--primary-muted)]">
            Map at least one field to Email or Phone so submissions can be matched to existing leads.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--text-main)] cursor-pointer">
          <input
            type="checkbox"
            checked={draft.required}
            onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
            className="h-4 w-4 rounded border-[var(--border-color)] text-[var(--hs-link)] focus:ring-[var(--hs-link)]/30"
          />
          Required
        </label>
      </div>
    </CrmSlidePanelShell>
  );
}
