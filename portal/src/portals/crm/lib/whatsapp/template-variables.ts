/**
 * `{{n}}` variable extraction/interpolation for WhatsApp template
 * components (HEADER/BODY text, BUTTON URL params).
 *
 * Shared by `WhatsAppTemplatePicker` (fills+sends an approved template from
 * Inbox / the dedicated WhatsApp chat) and `TemplateComponentsBuilder` (the
 * new template authoring form) so both agree on Meta's placeholder rules.
 */

export type WhatsAppTemplateComponent = {
  type?: string;
  format?: string;
  text?: string;
  example?: Record<string, any>;
  buttons?: Array<Record<string, any>>;
};

export type WhatsAppCachedTemplate = {
  id?: string;
  name: string;
  status: string;
  language: string;
  category?: string;
  components?: WhatsAppTemplateComponent[];
};

export type VariableSlot = {
  key: string;
  componentType: "HEADER" | "BODY" | "BUTTON";
  index: number;
  buttonIndex?: number;
  label: string;
  example?: string;
};

export function countPlaceholders(text?: string): number {
  if (!text) return 0;
  const matches = text.match(/\{\{\d+\}\}/g);
  return matches ? matches.length : 0;
}

/** Sorted, deduped `{{n}}` numbers found in `text`. */
export function extractPlaceholderNumbers(text?: string): number[] {
  if (!text) return [];
  const matches = [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)];
  return [...new Set(matches.map((m) => parseInt(m[1], 10)))].sort((a, b) => a - b);
}

export function extractSlots(template: {
  components?: WhatsAppTemplateComponent[];
}): VariableSlot[] {
  const slots: VariableSlot[] = [];
  const components = template.components || [];

  for (const comp of components) {
    const type = String(comp.type || "").toUpperCase();
    if (type === "HEADER" && String(comp.format || "TEXT").toUpperCase() === "TEXT") {
      const count = countPlaceholders(comp.text);
      const examples = comp.example?.header_text;
      for (let i = 0; i < count; i++) {
        slots.push({
          key: `header_${i + 1}`,
          componentType: "HEADER",
          index: i,
          label: `Header {{${i + 1}}}`,
          example: Array.isArray(examples) ? String(examples[i] || "") : undefined,
        });
      }
    }
    if (type === "BODY") {
      const count = countPlaceholders(comp.text);
      const examples = comp.example?.body_text?.[0];
      for (let i = 0; i < count; i++) {
        slots.push({
          key: `body_${i + 1}`,
          componentType: "BODY",
          index: i,
          label: `Body {{${i + 1}}}`,
          example: Array.isArray(examples) ? String(examples[i] || "") : undefined,
        });
      }
    }
    if (type === "BUTTONS" && Array.isArray(comp.buttons)) {
      comp.buttons.forEach((btn, buttonIndex) => {
        if (String(btn.type || "").toUpperCase() !== "URL") return;
        const count = countPlaceholders(btn.url);
        for (let i = 0; i < count; i++) {
          slots.push({
            key: `button_${buttonIndex}_${i + 1}`,
            componentType: "BUTTON",
            index: i,
            buttonIndex,
            label: `Button ${buttonIndex + 1} URL {{${i + 1}}}`,
          });
        }
      });
    }
  }

  return slots;
}

export function bodyPreview(
  template: WhatsAppCachedTemplate,
  values: Record<string, string>,
): string {
  const body = (template.components || []).find(
    (c) => String(c.type || "").toUpperCase() === "BODY",
  );
  let text = body?.text || `[Template] ${template.name}`;
  const bodySlots = extractSlots(template).filter((s) => s.componentType === "BODY");
  bodySlots.forEach((slot) => {
    const val = values[slot.key]?.trim() || slot.example || `{{${slot.index + 1}}}`;
    text = text.replace(`{{${slot.index + 1}}}`, val);
  });
  return text;
}

export function buildComponents(
  slots: VariableSlot[],
  values: Record<string, string>,
): Array<{
  type: string;
  sub_type?: string;
  index?: string | number;
  parameters: Array<{ type: string; text: string }>;
}> {
  const headerParams = slots
    .filter((s) => s.componentType === "HEADER")
    .sort((a, b) => a.index - b.index)
    .map((s) => ({ type: "text", text: values[s.key]?.trim() || "" }));

  const bodyParams = slots
    .filter((s) => s.componentType === "BODY")
    .sort((a, b) => a.index - b.index)
    .map((s) => ({ type: "text", text: values[s.key]?.trim() || "" }));

  const components: Array<{
    type: string;
    sub_type?: string;
    index?: string | number;
    parameters: Array<{ type: string; text: string }>;
  }> = [];

  if (headerParams.length) {
    components.push({ type: "header", parameters: headerParams });
  }
  if (bodyParams.length) {
    components.push({ type: "body", parameters: bodyParams });
  }

  const buttonSlots = slots.filter((s) => s.componentType === "BUTTON");
  const byButton = new Map<number, VariableSlot[]>();
  for (const slot of buttonSlots) {
    const bi = slot.buttonIndex ?? 0;
    if (!byButton.has(bi)) byButton.set(bi, []);
    byButton.get(bi)!.push(slot);
  }
  for (const [buttonIndex, list] of byButton) {
    components.push({
      type: "button",
      sub_type: "url",
      index: String(buttonIndex),
      parameters: list
        .sort((a, b) => a.index - b.index)
        .map((s) => ({ type: "text", text: values[s.key]?.trim() || "" })),
    });
  }

  return components;
}
