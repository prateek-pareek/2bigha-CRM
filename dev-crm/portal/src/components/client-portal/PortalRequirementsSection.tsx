'use client';

import { useState } from 'react';
import {
  ListTodo,
  FileText,
  KeyRound,
  Link2,
  Package,
  CircleHelp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { HS_PANEL } from './panel-styles';
import { CRM_API_URL } from '@/lib/api/config';
import type { ClientPortalNeed } from './types';

const NEED_CATEGORY_LABEL: Record<string, string> = {
  asset: 'Asset / file',
  credential: 'Credential / access',
  document: 'Document',
  access: 'Environment / access',
  other: 'Other',
};

function needCategoryIcon(category: string) {
  switch (category) {
    case 'credential':
      return KeyRound;
    case 'document':
      return FileText;
    case 'access':
      return Link2;
    case 'asset':
      return Package;
    default:
      return CircleHelp;
  }
}

type PortalRequirementsSectionProps = {
  needs: ClientPortalNeed[] | undefined;
  portalToken?: string;
  authHeaders?: Record<string, string>;
  onUploadSuccess?: () => void;
};

function NeedRow({
  need,
  portalToken,
  authHeaders,
  onUploadSuccess,
}: {
  need: ClientPortalNeed;
  portalToken?: string;
  authHeaders?: Record<string, string>;
  onUploadSuccess?: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const Icon = needCategoryIcon(need.category);
  const open = need.status === 'open';
  const isSubmitable = need.category === 'document' || need.category === 'asset';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      setErrorMsg('Please provide a URL/Link');
      return;
    }
    if (!portalToken) return;

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${CRM_API_URL}/portal/${portalToken}/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          name: need.title,
          url: url.trim(),
          needId: need._id,
        }),
      });

      if (res.ok) {
        setUrl('');
        setShowForm(false);
        if (onUploadSuccess) onUploadSuccess();
      } else {
        const data = await res.json();
        setErrorMsg(data.message || 'Failed to submit document.');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Network error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)]/40 p-4 px-5 sm:flex-row sm:items-start">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border-color)] bg-white text-[var(--text-muted)]">
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-[#ffb7a1]/50 bg-[#fff0ed] px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-[var(--hs-link-hover)]">
            {NEED_CATEGORY_LABEL[need.category] || need.category}
          </span>
          {!open && (
            <span className={cn(
              "rounded-md px-2 py-0.5 text-[8px] font-black uppercase tracking-widest",
              need.status === 'received' ? "border border-emerald-200/50 bg-emerald-50 text-emerald-600" : "text-[var(--text-muted)]"
            )}>
              {need.status === 'received' ? 'Received' : 'Closed'}
            </span>
          )}
        </div>
        <h4 className="text-sm font-bold tracking-tight text-[var(--text-main)]">{need.title}</h4>
        {need.description ? (
          <p className="mt-1 text-xs font-medium leading-relaxed text-[var(--text-muted)]">
            {need.description}
          </p>
        ) : null}
        {need.dueDate ? (
          <p className="mt-2 text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            Due{' '}
            {new Date(need.dueDate).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        ) : null}

        {need.status === 'received' && need.satisfiedDocUrl && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10px] font-bold text-[var(--text-muted)]">Submitted:</span>
            <a
              href={need.satisfiedDocUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-[var(--hs-link)] hover:underline break-all"
            >
              {need.satisfiedDocUrl}
            </a>
          </div>
        )}

        {open && isSubmitable && portalToken && (
          <div className="mt-3">
            {!showForm ? (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--hs-link)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--hs-link-hover)] transition-colors"
              >
                Submit Document
              </button>
            ) : (
              <form onSubmit={handleSubmit} className="mt-2 space-y-2 max-w-lg">
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Paste document URL/Link (e.g. Google Drive, Dropbox)"
                    disabled={isSubmitting}
                    className="h-8 flex-1 rounded-md border border-[var(--border-color)] bg-white px-3 text-xs outline-none focus:border-[var(--hs-link)] disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex h-8 items-center justify-center rounded-md bg-[var(--hs-link)] px-3 text-xs font-bold text-white hover:bg-[var(--hs-link-hover)] disabled:opacity-50"
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setUrl('');
                      setErrorMsg('');
                    }}
                    disabled={isSubmitting}
                    className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--border-color)] bg-white px-3 text-xs font-bold text-[var(--text-main)] hover:bg-[var(--surface-dim)]"
                  >
                    Cancel
                  </button>
                </div>
                {errorMsg && <p className="text-xs text-[#dc2626]">{errorMsg}</p>}
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function PortalRequirementsSection({
  needs,
  portalToken,
  authHeaders,
  onUploadSuccess,
}: PortalRequirementsSectionProps) {
  const list = needs ?? [];

  return (
    <div id="portal-needs" className={cn(HS_PANEL, 'scroll-mt-32 p-8 md:scroll-mt-28')}>
      <h3 className="mb-6 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.25em] text-[var(--text-muted)]">
        <ListTodo size={14} className="text-[#d97706]" />
        Requirements from you
      </h3>
      <div className="space-y-3">
        {list.map((n) => (
          <NeedRow
            key={n._id}
            need={n}
            portalToken={portalToken}
            authHeaders={authHeaders}
            onUploadSuccess={onUploadSuccess}
          />
        ))}
        {list.length === 0 ? (
          <div className="rounded-md border-2 border-dashed border-[var(--border-color)] bg-[var(--surface-dim)]/50 p-10 text-center text-[var(--text-muted)]">
            <p className="text-xs font-medium leading-relaxed">
              Nothing pending from your side right now. If we need logos, credentials, or approvals, they will appear here.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
