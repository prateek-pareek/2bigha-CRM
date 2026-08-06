"use client";

import { CheckCircle2, Mail, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type BulkEmailSendResultRow = {
  email: string;
  name?: string;
  error?: string;
};

export type BulkEmailSendReport = {
  sent: BulkEmailSendResultRow[];
  failed: BulkEmailSendResultRow[];
};

type Props = {
  open: boolean;
  report: BulkEmailSendReport | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
};

function RecipientLine({
  row,
  showError,
}: {
  row: BulkEmailSendResultRow;
  showError?: boolean;
}) {
  const label = row.name?.trim() || row.email;
  const showEmail = row.name?.trim() && row.email;

  return (
    <li className="rounded-md border border-[var(--border-color)] bg-white px-3 py-2 text-sm">
      <div className="flex items-start gap-2">
        <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[var(--text-main)] truncate">{label}</p>
          {showEmail ? (
            <p className="text-xs text-[var(--text-muted)] truncate">{row.email}</p>
          ) : null}
          {showError && row.error ? (
            <p className="mt-1 text-xs text-rose-600 leading-snug">{row.error}</p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function BulkEmailSendResultDialog({
  open,
  report,
  onOpenChange,
  onDone,
}: Props) {
  if (!report) return null;

  const sentCount = report.sent.length;
  const failedCount = report.failed.length;
  const total = sentCount + failedCount;
  const allOk = failedCount === 0 && sentCount > 0;
  const allFailed = sentCount === 0 && failedCount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0 overflow-hidden">
        <DialogHeader className="border-b border-[var(--border-color)] px-5 py-4 text-left">
          <DialogTitle className="text-base font-semibold text-[var(--text-main)]">
            {allOk
              ? "Bulk email sent"
              : allFailed
                ? "Bulk email could not be sent"
                : "Bulk email partially sent"}
          </DialogTitle>
          <DialogDescription className="text-sm text-[var(--text-muted)]">
            {allOk
              ? `All ${sentCount} email${sentCount === 1 ? "" : "s"} were sent successfully.`
              : allFailed
                ? `None of the ${failedCount} email${failedCount === 1 ? "" : "s"} could be sent. Review the issues below and try again.`
                : `${sentCount} of ${total} sent successfully. ${failedCount} could not be sent — those contacts are listed below.`}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[min(52vh,420px)] overflow-y-auto px-5 py-4 space-y-4">
          {sentCount > 0 ? (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                <h3 className="text-xs font-bold uppercase tracking-wide text-emerald-800">
                  Sent ({sentCount})
                </h3>
              </div>
              <ul className="space-y-1.5">
                {report.sent.map((row) => (
                  <RecipientLine key={`sent-${row.email}`} row={row} />
                ))}
              </ul>
            </section>
          ) : null}

          {failedCount > 0 ? (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <XCircle className="h-4 w-4 text-amber-600" aria-hidden />
                <h3
                  className={cn(
                    "text-xs font-bold uppercase tracking-wide",
                    allFailed ? "text-rose-800" : "text-amber-800",
                  )}
                >
                  Not sent ({failedCount})
                </h3>
              </div>
              <ul className="space-y-1.5">
                {report.failed.map((row) => (
                  <RecipientLine
                    key={`fail-${row.email}`}
                    row={row}
                    showError
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <DialogFooter className="border-t border-[var(--border-color)] bg-[var(--surface-dim)] px-5 py-3 sm:justify-end">
          <Button type="button" onClick={onDone} className="h-9 font-semibold">
            {allFailed ? "Close and retry" : "Done"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function buildBulkEmailSendReport(
  apiResults: Array<{ email?: string; success?: boolean; error?: string; name?: string }>,
  recipients: Array<{ email: string; name?: string }>,
): BulkEmailSendReport {
  const metaByEmail = new Map(
    recipients.map((r) => [
      r.email.trim().toLowerCase(),
      { name: r.name?.trim() || undefined, email: r.email.trim() },
    ]),
  );

  const sent: BulkEmailSendResultRow[] = [];
  const failed: BulkEmailSendResultRow[] = [];
  const seen = new Set<string>();

  for (const row of apiResults) {
    const email = String(row.email || "").trim();
    if (!email.includes("@")) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const meta = metaByEmail.get(key);
    const item: BulkEmailSendResultRow = {
      email: meta?.email || email,
      name: row.name?.trim() || meta?.name,
      error: row.error,
    };
    if (row.success) sent.push(item);
    else failed.push(item);
  }

  for (const r of recipients) {
    const email = r.email.trim();
    if (!email.includes("@")) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    failed.push({
      email,
      name: r.name?.trim() || undefined,
      error: "No send result returned for this contact.",
    });
  }

  return { sent, failed };
}
