/** Matches Mongo ObjectId hex strings; avoids sending bad `pipeline` query params. */
export function isMongoObjectIdString(
  value: string | null | undefined,
): boolean {
  return typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value.trim());
}
