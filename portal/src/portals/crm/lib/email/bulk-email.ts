/** Recipient row for CRM bulk send (GlobalEmailComposer + send-bulk-smart). */
export type BulkEmailModule =
  | "leads"
  | "contacts"
  | "organizations"
  | "clients";

export type BulkEmailRecipient = {
  email: string;
  name?: string;
  module?: BulkEmailModule;
  entityId?: string;
};

type RecordWithEmail = {
  _id: string;
  email?: string | null;
  firstName?: string;
  lastName?: string;
  name?: string;
};

function displayName(r: RecordWithEmail): string | undefined {
  const fromParts = `${r.firstName || ""} ${r.lastName || ""}`.trim();
  if (fromParts) return fromParts;
  const n = String(r.name || "").trim();
  return n || undefined;
}

/** Build bulk send list from table selection (leads, contacts, outreach, etc.). */
export function buildBulkEmailRecipients<T extends RecordWithEmail>(
  selectedIds: Iterable<string>,
  records: T[],
  module: BulkEmailModule,
): BulkEmailRecipient[] {
  const byId = new Map(records.map((r) => [r._id, r]));
  return Array.from(selectedIds)
    .map((id) => byId.get(id))
    .filter((r): r is T => Boolean(r))
    .map((r) => ({
      email: String(r.email || "").trim(),
      name: displayName(r),
      module,
      entityId: r._id,
    }))
    .filter((r) => r.email.includes("@"));
}
