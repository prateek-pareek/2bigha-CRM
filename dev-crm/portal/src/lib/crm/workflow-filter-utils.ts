/** Shared workflow filter shape — property, email engagement, or segment membership. */
export type WorkflowFilterValue = {
  field: string;
  operator: string;
  value?: string | number | boolean;
  filterKind?: "property" | "event" | "segment";
  eventType?: "crm_email_has_been_opened" | "crm_email_sent_but_never_opened";
};

export function emptyPropertyFilter(): WorkflowFilterValue {
  return { filterKind: "property", field: "stage", operator: "equals", value: "" };
}

export function emptySegmentFilter(): WorkflowFilterValue {
  return {
    filterKind: "segment",
    field: "_segment",
    operator: "in_segment",
    value: "",
  };
}

export function emptyEventFilter(): WorkflowFilterValue {
  return {
    filterKind: "event",
    field: "_event",
    operator: "equals",
    eventType: "crm_email_has_been_opened",
    value: true,
  };
}

/** @deprecated Prefer emptyPropertyFilter — kept for backwards compatibility */
export function emptyWorkflowFilter(): WorkflowFilterValue {
  return emptyPropertyFilter();
}

export function normalizeWorkflowFilter(raw: unknown): WorkflowFilterValue {
  const f = (raw && typeof raw === "object" ? raw : {}) as WorkflowFilterValue;
  const kind = f.filterKind || "property";

  if (kind === "event") {
    return {
      filterKind: "event",
      field: "_event",
      operator: "equals",
      eventType:
        f.eventType === "crm_email_sent_but_never_opened"
          ? "crm_email_sent_but_never_opened"
          : "crm_email_has_been_opened",
      value: true,
    };
  }

  if (kind === "segment") {
    return {
      filterKind: "segment",
      field: "_segment",
      operator: f.operator === "not_in_segment" ? "not_in_segment" : "in_segment",
      value: f.value === undefined || f.value === null ? "" : String(f.value),
    };
  }

  return {
    filterKind: "property",
    field: String(f.field ?? "").trim(),
    operator: String(f.operator || "equals"),
    value: f.value,
  };
}

/** Filters worth persisting — skips incomplete rows the user has not finished configuring. */
export function isPersistableWorkflowFilter(f: WorkflowFilterValue): boolean {
  const row = normalizeWorkflowFilter(f);
  if (row.filterKind === "event") return true;
  if (row.filterKind === "segment") {
    return Boolean(String(row.value ?? "").trim());
  }
  return Boolean(String(row.field ?? "").trim());
}

export function normalizeWorkflowFilters(rows: unknown[] | undefined): WorkflowFilterValue[] {
  if (!Array.isArray(rows) || !rows.length) return [];
  return rows.map(normalizeWorkflowFilter);
}
