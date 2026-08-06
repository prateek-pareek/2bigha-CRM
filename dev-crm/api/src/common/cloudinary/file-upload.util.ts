import { BadRequestException } from '@nestjs/common';

/** Non-image uploads (PM tickets, HRMS employee docs, etc.) */
export const ALLOWED_FILE_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
]);

export const DEFAULT_MAX_FILE_BYTES = 25 * 1024 * 1024;

/** 25 MB default — override only if needed via FILE_UPLOAD_MAX_BYTES. */
export function parseMaxFileBytes(): number {
  const fromEnv = parseInt(process.env.FILE_UPLOAD_MAX_BYTES || '', 10);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_MAX_FILE_BYTES;
}

export function assertAllowedFileMime(mimetype: string | undefined): void {
  const mime = (mimetype || '').toLowerCase().split(';')[0].trim();
  if (!mime || !ALLOWED_FILE_MIMES.has(mime)) {
    throw new BadRequestException(
      'File type not allowed. Use PDF, Word, Excel, CSV, TXT, or ZIP.',
    );
  }
}

export function fileExtFromMime(mimetype: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip',
  };
  return map[mimetype.toLowerCase()] || 'bin';
}
