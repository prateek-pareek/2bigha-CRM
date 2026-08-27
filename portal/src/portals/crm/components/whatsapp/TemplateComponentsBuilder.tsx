"use client";

import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { extractPlaceholderNumbers } from "@/lib/crm/whatsapp/template-variables";
import type { WhatsAppTemplateCategory } from "./types";

export type ButtonDraft = {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone_number?: string;
};

export type TemplateDraft = {
  name: string;
  language: string;
  category: WhatsAppTemplateCategory;
  headerEnabled: boolean;
  headerText: string;
  headerExamples: string[];
  bodyText: string;
  bodyExamples: string[];
  footerEnabled: boolean;
  footerText: string;
  buttons: ButtonDraft[];
};

export const EMPTY_TEMPLATE_DRAFT: TemplateDraft = {
  name: "",
  language: "en_US",
  category: "UTILITY",
  headerEnabled: false,
  headerText: "",
  headerExamples: [],
  bodyText: "",
  bodyExamples: [],
  footerEnabled: false,
  footerText: "",
  buttons: [],
};

const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "hi", label: "Hindi" },
  { code: "es", label: "Spanish" },
  { code: "pt_BR", label: "Portuguese (BR)" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "ar", label: "Arabic" },
];

/** Turns a builder draft into the `components` payload the backend DTO expects. */
export function draftToComponents(draft: TemplateDraft): Record<string, any>[] {
  const components: Record<string, any>[] = [];

  if (draft.headerEnabled && draft.headerText.trim()) {
    const slots = extractPlaceholderNumbers(draft.headerText);
    components.push({
      type: "HEADER",
      format: "TEXT",
      text: draft.headerText.trim(),
      ...(slots.length
        ? { example: { header_text: slots.map((_, i) => draft.headerExamples[i] || "") } }
        : {}),
    });
  }

  const bodySlots = extractPlaceholderNumbers(draft.bodyText);
  components.push({
    type: "BODY",
    text: draft.bodyText.trim(),
    ...(bodySlots.length
      ? { example: { body_text: [bodySlots.map((_, i) => draft.bodyExamples[i] || "")] } }
      : {}),
  });

  if (draft.footerEnabled && draft.footerText.trim()) {
    components.push({ type: "FOOTER", text: draft.footerText.trim() });
  }

  if (draft.buttons.length) {
    components.push({
      type: "BUTTONS",
      buttons: draft.buttons.map((b) => ({
        type: b.type,
        text: b.text.trim(),
        ...(b.type === "URL" ? { url: b.url?.trim() || "" } : {}),
        ...(b.type === "PHONE_NUMBER" ? { phone_number: b.phone_number?.trim() || "" } : {}),
      })),
    });
  }

  return components;
}

/** Reconstructs a builder draft from an existing template's `components` array (edit flow). */
export function componentsToDraft(
  base: { name: string; language: string; category: WhatsAppTemplateCategory },
  components: Record<string, any>[],
): TemplateDraft {
  const header = components.find((c) => String(c.type).toUpperCase() === "HEADER");
  const body = components.find((c) => String(c.type).toUpperCase() === "BODY");
  const footer = components.find((c) => String(c.type).toUpperCase() === "FOOTER");
  const buttonsComp = components.find((c) => String(c.type).toUpperCase() === "BUTTONS");

  return {
    ...base,
    headerEnabled: Boolean(header?.text),
    headerText: header?.text || "",
    headerExamples: header?.example?.header_text || [],
    bodyText: body?.text || "",
    bodyExamples: body?.example?.body_text?.[0] || [],
    footerEnabled: Boolean(footer?.text),
    footerText: footer?.text || "",
    buttons: Array.isArray(buttonsComp?.buttons) ? buttonsComp!.buttons : [],
  };
}

const inputCls =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";
const labelCls = "text-xs font-bold text-slate-700";

export default function TemplateComponentsBuilder({
  draft,
  onChange,
  disabled = false,
}: {
  draft: TemplateDraft;
  onChange: (next: TemplateDraft) => void;
  disabled?: boolean;
}) {
  const set = <K extends keyof TemplateDraft>(key: K, value: TemplateDraft[K]) =>
    onChange({ ...draft, [key]: value });

  const headerSlots = useMemo(() => extractPlaceholderNumbers(draft.headerText), [draft.headerText]);
  const bodySlots = useMemo(() => extractPlaceholderNumbers(draft.bodyText), [draft.bodyText]);

  const badSequence = (slots: number[]) => slots.length > 0 && !slots.every((n, i) => n === i + 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="space-y-1">
          <span className={labelCls}>Name</span>
          <input
            value={draft.name}
            disabled={disabled}
            onChange={(e) =>
              set("name", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))
            }
            placeholder="order_confirmation"
            className={inputCls}
          />
          <span className="block text-[10px] text-text-muted">
            lowercase, numbers and underscores only
          </span>
        </label>
        <label className="space-y-1">
          <span className={labelCls}>Language</span>
          <select
            value={draft.language}
            disabled={disabled}
            onChange={(e) => set("language", e.target.value)}
            className={inputCls}
          >
            {LANGUAGE_OPTIONS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label} ({l.code})
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className={labelCls}>Category</span>
          <select
            value={draft.category}
            disabled={disabled}
            onChange={(e) => set("category", e.target.value as WhatsAppTemplateCategory)}
            className={inputCls}
          >
            <option value="MARKETING">Marketing</option>
            <option value="UTILITY">Utility</option>
            <option value="AUTHENTICATION">Authentication</option>
          </select>
        </label>
      </div>

      <div className="space-y-3 bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className={labelCls}>Header (optional)</span>
          <label className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
            <input
              type="checkbox"
              checked={draft.headerEnabled}
              disabled={disabled}
              onChange={(e) => set("headerEnabled", e.target.checked)}
            />
            Include header
          </label>
        </div>
        {draft.headerEnabled && (
          <>
            <input
              value={draft.headerText}
              disabled={disabled}
              onChange={(e) => set("headerText", e.target.value)}
              placeholder="Order update for {{1}}"
              className={inputCls}
            />
            {badSequence(headerSlots) && (
              <p className="text-xs font-medium text-rose-600">
                Header variables must be sequential starting at {"{{1}}"} with no gaps.
              </p>
            )}
            {headerSlots.map((n, i) => (
              <label key={n} className="block space-y-1">
                <span className="text-[11px] text-text-muted">
                  Example value for header {"{{" + n + "}}"}
                </span>
                <input
                  value={draft.headerExamples[i] || ""}
                  disabled={disabled}
                  onChange={(e) => {
                    const next = [...draft.headerExamples];
                    next[i] = e.target.value;
                    set("headerExamples", next);
                  }}
                  className={inputCls}
                />
              </label>
            ))}
          </>
        )}
      </div>

      <div className="space-y-3 bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
        <span className={labelCls}>Body</span>
        <textarea
          value={draft.bodyText}
          disabled={disabled}
          onChange={(e) => set("bodyText", e.target.value)}
          rows={4}
          placeholder="Hi {{1}}, your order #{{2}} has shipped."
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        />
        {badSequence(bodySlots) && (
          <p className="text-xs font-medium text-rose-600">
            Body variables must be sequential starting at {"{{1}}"} with no gaps.
          </p>
        )}
        {bodySlots.map((n, i) => (
          <label key={n} className="block space-y-1">
            <span className="text-[11px] text-text-muted">
              Example value for body {"{{" + n + "}}"}
            </span>
            <input
              value={draft.bodyExamples[i] || ""}
              disabled={disabled}
              onChange={(e) => {
                const next = [...draft.bodyExamples];
                next[i] = e.target.value;
                set("bodyExamples", next);
              }}
              className={inputCls}
            />
          </label>
        ))}
      </div>

      <div className="space-y-3 bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className={labelCls}>Footer (optional)</span>
          <label className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
            <input
              type="checkbox"
              checked={draft.footerEnabled}
              disabled={disabled}
              onChange={(e) => set("footerEnabled", e.target.checked)}
            />
            Include footer
          </label>
        </div>
        {draft.footerEnabled && (
          <input
            value={draft.footerText}
            disabled={disabled}
            onChange={(e) => set("footerText", e.target.value)}
            placeholder="Thanks for shopping with us"
            className={inputCls}
          />
        )}
      </div>

      <div className="space-y-4 bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className={labelCls}>Buttons (optional, max 3)</span>
          {!disabled && draft.buttons.length < 3 && (
            <button
              type="button"
              onClick={() =>
                set("buttons", [...draft.buttons, { type: "QUICK_REPLY", text: "" }])
              }
              className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
            >
              <Plus size={12} /> Add button
            </button>
          )}
        </div>
        {draft.buttons.map((btn, idx) => (
          <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <select
              value={btn.type}
              disabled={disabled}
              onChange={(e) => {
                const next = [...draft.buttons];
                next[idx] = { ...next[idx], type: e.target.value as ButtonDraft["type"] };
                set("buttons", next);
              }}
              className={inputCls}
            >
              <option value="QUICK_REPLY">Quick reply</option>
              <option value="URL">URL</option>
              <option value="PHONE_NUMBER">Phone number</option>
            </select>
            <input
              value={btn.text}
              disabled={disabled}
              placeholder="Button text"
              onChange={(e) => {
                const next = [...draft.buttons];
                next[idx] = { ...next[idx], text: e.target.value };
                set("buttons", next);
              }}
              className={inputCls}
            />
            {btn.type === "URL" && (
              <input
                value={btn.url || ""}
                disabled={disabled}
                placeholder="https://example.com"
                onChange={(e) => {
                  const next = [...draft.buttons];
                  next[idx] = { ...next[idx], url: e.target.value };
                  set("buttons", next);
                }}
                className={inputCls}
              />
            )}
            {btn.type === "PHONE_NUMBER" && (
              <input
                value={btn.phone_number || ""}
                disabled={disabled}
                placeholder="+1 555 0100"
                onChange={(e) => {
                  const next = [...draft.buttons];
                  next[idx] = { ...next[idx], phone_number: e.target.value };
                  set("buttons", next);
                }}
                className={inputCls}
              />
            )}
            {btn.type === "QUICK_REPLY" && <div />}
            {!disabled && (
              <button
                type="button"
                onClick={() => set("buttons", draft.buttons.filter((_, i) => i !== idx))}
                className="flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
