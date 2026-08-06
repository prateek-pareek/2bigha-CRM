declare module 'mailparser' {
  export function simpleParser(
    source: Buffer | NodeJS.ReadableStream,
  ): Promise<{
    from?: {
      text?: string;
      addresses?: Array<{ address?: string; name?: string }>;
    };
    to?: {
      text?: string;
      addresses?: Array<{ address?: string; name?: string }>;
    };
    subject?: string;
    text?: string;
    html?: string;
    date?: Date;
    attachments?: Array<unknown>;
  }>;
}
