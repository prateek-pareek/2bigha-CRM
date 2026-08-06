/**
 * Next.js App Router `useParams()` dynamic segments may be `string | string[]`.
 * Always pass a single string id into CRM APIs and activity payloads so `relatedTo`
 * matches MongoDB ObjectId queries (arrays were saved incorrectly and notes vanished on refresh).
 */
export function crmRecordIdFromParams(id: string | string[] | undefined): string {
  if (id == null) return "";
  if (Array.isArray(id)) return id[0] ?? "";
  return id;
}
