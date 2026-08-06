/** Safe startup log label — never prints credentials. */
export function mongoConnectionLabel(uri: string | undefined, fallback: string): string {
  const value = (uri || fallback).trim();
  if (value.includes('mongodb.net') || value.includes('mongodb+srv://')) {
    return 'Atlas (cloud)';
  }
  if (value.includes('mongodb://mongodb:') || value.includes('@mongodb:')) {
    return 'local Docker Mongo';
  }
  if (value.includes('127.0.0.1') || value.includes('localhost')) {
    return 'local Mongo';
  }
  return 'custom Mongo host';
}
