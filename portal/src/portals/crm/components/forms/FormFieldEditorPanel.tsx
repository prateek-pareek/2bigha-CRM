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
import { CRM_HS_CONTROL_CLASS, CRM_HS_LABEL_CLASS } from "@/components/crm/records/forms/crm-form-primitives";

const LBL = CRM_HS_LABEL_CLASS;
const INP = CRM_HS_CONTROL_CLASS;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (field: FormField) => void;
  field: FormField | null;
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
    if (needsOptions && options.length < 2) return;
    onSave({
      ...draft,
      label,
      key,
      options,
      placeholder: draft.placeholder?.trim() || undefined,
      helpText: draft.helpText?.trim() || undefined,
    });
  };

  return (
    <CrmSlidePanelShell
      isOpen={isOpen}
      onClose={onClose}
      title={isNew ? "Add field" : "Edit field"}
      subtitle={isNew ? "Choose how this question appears on the public form." : "Changes apply after you save the form."}
      maxWidthClass="max-w-md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-[var(--radius-md)] border border-[var(--border-color)] text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--background)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!draft.label.trim() || (needsOptions && optionsText.split("\n").map((o) => o.trim()).filter(Boolean).length < 2)}
            className="h-9 px-4 rounded-[var(--radius-md)] bg-[var(--primary)] text-sm font-medium text-white hover:bg-[var(--primary-dark)] disabled:opacity-50 transition-colors"
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
            placeholder="e.g. What type of land do you want?"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            autoFocus
          />
        </div>

        <div>
          <label className={LBL}>Field type</label>
          <select
            className={`${INP} appearance-none cursor-pointer`}
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
              placeholder={"Agricultural\nResidential\nCommercial"}
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">Add at least two options.</p>
          </div>
        )}

        {draft.type !== "checkbox" && draft.type !== "radio" && draft.type !== "multiselect" && (
          <div>
            <label className={LBL}>Placeholder text (optional)</label>
            <input
              className={INP}
              placeholder="Shown inside the empty field"
              value={draft.placeholder || ""}
              onChange={(e) => setDraft({ ...draft, placeholder: e.target.value })}
            />
          </div>
        )}

        <div>
          <label className={LBL}>Help text (optional)</label>
          <input
            className={INP}
            placeholder="Short hint shown under the question"
            value={draft.helpText || ""}
            onChange={(e) => setDraft({ ...draft, helpText: e.target.value })}
          />
        </div>

        <div>
          <label className={LBL}>Map answer to a Lead field</label>
          <select
            className={`${INP} appearance-none cursor-pointer`}
            value={draft.mapsTo || ""}
            onChange={(e) =>
              setDraft({ ...draft, mapsTo: (e.target.value || undefined) as FormFieldLeadTarget | undefined })
            }
          >
            <option value="">Custom field (stored on the lead&apos;s Custom Fields)</option>
            {Object.entries(FORM_FIELD_LEAD_TARGET_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Map at least one field to Email or Phone so submissions can be matched to existing leads.
          </p>
        </div>

        <label className="flex items-center gap-2.5 text-sm text-[var(--text-main)] cursor-pointer rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-2.5">
          <input
            type="checkbox"
            checked={draft.required}
            onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
            className="h-4 w-4 rounded border-[var(--border-color)] text-[var(--primary)] focus:ring-[var(--primary)]/30"
          />
          Required — visitors must answer this question
        </label>
      </div>
    </CrmSlidePanelShell>
  );
}
