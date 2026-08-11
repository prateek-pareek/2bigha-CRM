'use client';

import { useEffect, useRef } from 'react';
import { Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { CRM_API_URL } from '@/lib/crm/config';
import { invalidateCrmForEntityType } from '@/lib/crm/shared/invalidate-on-mutation';
import { toast } from 'sonner';
import {
  useCrmImportStore,
  type CrmImportEntityType,
} from '@/stores/crmImportStore';

const TYPE_LABEL: Record<CrmImportEntityType, string> = {
  leads: 'leads',
  contacts: 'contacts',
  deals: 'deals',
  clients: 'clients',
  organizations: 'companies',
};

export default function CrmImportProgressTracker() {
  const jobs = useCrmImportStore((s) => s.jobs);
  const updateJob = useCrmImportStore((s) => s.updateJob);
  const removeJob = useCrmImportStore((s) => s.removeJob);
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const processing = jobs.filter((j) => j.status === 'processing');
    if (processing.length === 0) return;

    let cancelled = false;

    const poll = async () => {
      const token = localStorage.getItem('token');
      for (const job of processing) {
        if (cancelled) return;
        try {
          const res = await fetch(
            `${CRM_API_URL}/crm/import/jobs/${job.jobId}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (!res.ok) continue;
          const data = await res.json();
          updateJob(job.jobId, {
            processed: data.processed ?? 0,
            successCount: data.successCount ?? 0,
            failedCount: data.failedCount ?? 0,
            status: data.status,
            error: data.error,
            createdCount: data.createdCount ?? 0,
            mergedCount: data.mergedCount ?? 0,
            replacedCount: data.replacedCount ?? 0,
            skippedCount: data.skippedCount ?? 0,
            existingClientCount: data.existingClientCount ?? 0,
            invalidRoleCount: data.invalidRoleCount ?? 0,
          });

          if (data.status === 'completed' && !notifiedRef.current.has(job.jobId)) {
            notifiedRef.current.add(job.jobId);
            invalidateCrmForEntityType(job.type);
            job.onSuccess?.();
            const label = TYPE_LABEL[job.type];
            const created = data.createdCount ?? 0;
            const merged = data.mergedCount ?? 0;
            const replaced = data.replacedCount ?? 0;
            const skipped = data.skippedCount ?? 0;
            const failed = data.failedCount ?? 0;
            const existingClients = data.existingClientCount ?? 0;
            const invalidRoles = data.invalidRoleCount ?? 0;
            const parts: string[] = [];
            if (created > 0) parts.push(`${created} added`);
            if (merged > 0) parts.push(`${merged} merged`);
            if (replaced > 0) parts.push(`${replaced} replaced`);
            if (skipped > 0) parts.push(`${skipped} duplicates skipped`);
            if (existingClients > 0) parts.push(`${existingClients} already existing users`);
            if (invalidRoles > 0) parts.push(`${invalidRoles} invalid roles defaulted to USER`);
            if (failed > 0) parts.push(`${failed} failed`);
            toast.success(
              parts.length > 0
                ? `Import finished: ${parts.join(', ')} (${label}).`
                : `Import finished (${label}).`,
            );
            window.setTimeout(() => removeJob(job.jobId), 6000);
          } else if (data.status === 'failed' && !notifiedRef.current.has(job.jobId)) {
            notifiedRef.current.add(job.jobId);
            toast.error(data.error || 'Import failed.');
            window.setTimeout(() => removeJob(job.jobId), 8000);
          }
        } catch {
          /* retry on next tick */
        }
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [jobs, removeJob, updateJob]);

  if (jobs.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      {jobs.map((job) => {
        const label = TYPE_LABEL[job.type];
        const pct =
          job.total > 0
            ? Math.min(100, Math.round((job.processed / job.total) * 100))
            : job.status === 'completed'
              ? 100
              : 0;

        return (
          <div
            key={job.jobId}
            className="pointer-events-auto bg-card border border-[var(--border-color)] rounded-[var(--radius-md)] shadow-lg shadow-slate-900/10 p-4 animate-in slide-in-from-bottom-4 duration-300"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                {job.status === 'processing' && (
                  <Loader2 size={18} className="text-primary animate-spin shrink-0" />
                )}
                {job.status === 'completed' && (
                  <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                )}
                {job.status === 'failed' && (
                  <AlertCircle size={18} className="text-rose-500 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-black text-text-main truncate">
                    {job.status === 'processing'
                      ? `Importing ${label}…`
                      : job.status === 'completed'
                        ? 'Import complete'
                        : 'Import failed'}
                  </p>
                  <p className="text-xs font-medium text-text-muted">
                    {job.status === 'processing'
                      ? `${job.processed} / ${job.total} rows`
                      : job.status === 'completed'
                        ? [
                            `${job.successCount} updated`,
                            job.existingClientCount ? `${job.existingClientCount} already existing users` : null,
                            job.skippedCount ? `${job.skippedCount} skipped` : null,
                            job.failedCount > 0 ? `${job.failedCount} failed` : null,
                          ]
                            .filter(Boolean)
                            .join(', ')
                        : job.error || 'Something went wrong'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeJob(job.jobId)}
                className="p-1 rounded-lg hover:bg-slate-100 text-text-muted shrink-0"
                aria-label="Dismiss"
              >
                <X size={16} />
              </button>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  job.status === 'failed'
                    ? 'bg-rose-500'
                    : job.status === 'completed'
                      ? 'bg-emerald-500'
                      : 'bg-primary'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}