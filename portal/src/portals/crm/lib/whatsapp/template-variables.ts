/**
 * `{{n}}` variable extraction/interpolation for WhatsApp template
 * components (HEADER/BODY text, BUTTON URL params).
 *
 * Shared by `WhatsAppTemplatePicker` (fills+sends an approved template from
 * Inbox / the dedicated WhatsApp chat), `NewWhatsAppCampaignPage` (campaigns),
 * and `TemplateComponentsBuilder` (the new template authoring form) so all
 * agree on Meta's placeholder rules.
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
  _id?: string;
  name: string;
  status: string;
  language: string;
  category?: string;
  aisensyCampaignName?: string;
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
  const matches = text.match(/\{\{\s*\d+\s*\}\}/g);
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
      const nums = extractPlaceholderNumbers(comp.text);
      const examples = comp.example?.header_text;
      for (let i = 0; i < nums.length; i++) {
        const num = nums[i];
        slots.push({
          key: `header_${num}`,
          componentType: "HEADER",
          index: i,
          label: `Header {{${num}}}`,
          example: Array.isArray(examples) ? String(examples[i] || "") : undefined,
        });
      }
    }
    if (type === "BODY") {
      // Clean body text by stripping trailing button markup like " | [Button Title, URL]"
      const cleanBodyText = (comp.text || "").replace(/(\s*\|\s*\[[^\]]+\])+$/g, "").trim();
      const nums = extractPlaceholderNumbers(cleanBodyText);
      const examples = comp.example?.body_text?.[0];
      for (let i = 0; i < nums.length; i++) {
        const num = nums[i];
        slots.push({
          key: `body_${num}`,
          componentType: "BODY",
          index: i,
          label: `Body {{${num}}}`,
          example: Array.isArray(examples) ? String(examples[i] || "") : undefined,
        });
      }

      // If trailing button markup exists in comp.text and no separate BUTTONS component was created
      const hasSeparateButtons = components.some((c) => String(c.type || "").toUpperCase() === "BUTTONS");
      if (!hasSeparateButtons && (comp.text || "").includes("| [")) {
        const buttonRegex = /\|\s*\[([^\]]+)\]/g;
        let match: RegExpExecArray | null;
        let btnIdx = 0;
        while ((match = buttonRegex.exec(comp.text || "")) !== null) {
          const content = match[1];
          if (content.includes(",")) {
            const parts = content.split(",");
            const title = parts[0].trim();
            const urlOrVal = parts.slice(1).join(",").trim();
            const btnNums = extractPlaceholderNumbers(urlOrVal);
            for (let bi = 0; bi < btnNums.length; bi++) {
              const num = btnNums[bi];
              slots.push({
                key: `button_${btnIdx}_${num}`,
                componentType: "BUTTON",
                index: bi,
                buttonIndex: btnIdx,
                label: `Button ${btnIdx + 1} (${title}) URL {{${num}}}`,
              });
            }
          }
          btnIdx++;
        }
      }
    }
    if (type === "BUTTONS" && Array.isArray(comp.buttons)) {
      comp.buttons.forEach((btn, buttonIndex) => {
        if (String(btn.type || "").toUpperCase() !== "URL") return;
        const nums = extractPlaceholderNumbers(btn.url);
        for (let i = 0; i < nums.length; i++) {
          const num = nums[i];
          slots.push({
            key: `button_${buttonIndex}_${num}`,
            componentType: "BUTTON",
            index: i,
            buttonIndex,
            label: `Button ${buttonIndex + 1}${btn.text ? ` (${btn.text})` : ""} URL {{${num}}}`,
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
  let rawText = body?.text || `[Template] ${template.name}`;
  // Strip trailing inline buttons from preview text
  let text = rawText.replace(/(\s*\|\s*\[[^\]]+\])+$/g, "").trim();
  const bodySlots = extractSlots(template).filter((s) => s.componentType === "BODY");
  bodySlots.forEach((slot) => {
    const val = values[slot.key]?.trim() || slot.example || `{{${slot.index + 1}}}`;
    const placeholderNum = slot.key.startsWith("body_") ? slot.key.replace("body_", "") : String(slot.index + 1);
    text = text.replace(new RegExp(`\\{\\{\\s*${placeholderNum}\\s*\\}\\}`, "g"), val);
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
