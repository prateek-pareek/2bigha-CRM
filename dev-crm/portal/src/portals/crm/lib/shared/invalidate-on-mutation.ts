import { notifyCrmDataChanged } from "@/lib/crm/shared/prefetch-cache";

export type CrmMutationScope =
  | "leads"
  | "deals"
  | "contacts"
  | "organizations"
  | "clients"
  | "workspace"
  | "attention"
  | "pipelines"
  | "all";

const SCOPE_PREFIX: Record<Exclude<CrmMutationScope, "all">, string> = {
  leads: "leads:",
  deals: "deals:",
  contacts: "contacts:",
  organizations: "organizations:",
  clients: "clients:",
  workspace: "workspace:",
  attention: "attention:",
  pipelines: "pipelines:",
};

/** Default scopes refreshed when a record type changes (lists + sales workspace). */
const ENTITY_DEFAULT_SCOPES: Record<string, CrmMutationScope[]> = {
  lead: ["leads", "workspace", "attention"],
  leads: ["leads", "workspace", "attention"],
  deal: ["deals", "workspace", "attention"],
  deals: ["deals", "workspace", "attention"],
  contact: ["contacts", "workspace", "attention"],
  contacts: ["contacts", "workspace", "attention"],
  organization: ["organizations", "workspace"],
  organizations: ["organizations", "workspace"],
  org: ["organizations", "workspace"],
  client: ["clients", "workspace"],
  clients: ["clients", "workspace"],
  activity: ["workspace", "attention"],
  activities: ["workspace", "attention"],
  note: ["workspace", "attention"],
  task: ["workspace", "attention"],
  call: ["workspace", "attention"],
};

/**
 * Invalidate shared CRM prefetch cache after creates, updates, or deletes.
 * Pass explicit scopes or use {@link invalidateCrmForEntityType}.
 */
export function invalidateCrmAfterMutation(
  ...scopes: CrmMutationScope[]
): void {
  if (scopes.includes("all")) {
    notifyCrmDataChanged();
    return;
  }
  const unique = [...new Set(scopes.filter((s): s is Exclude<CrmMutationScope, "all"> => s !== "all"))];
  for (const scope of unique) {
    notifyCrmDataChanged({ scope: SCOPE_PREFIX[scope] });
  }
}

export function invalidateCrmForEntityType(
  entityType: string,
  extraScopes: CrmMutationScope[] = [],
): void {
  const key = String(entityType || "").trim().toLowerCase();
  const defaults = ENTITY_DEFAULT_SCOPES[key] ?? ["workspace"];
  invalidateCrmAfterMutation(...defaults, ...extraScopes);
}
