'use client';

import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HS_PANEL } from './panel-styles';

type PortalScopeSectionProps = {
  scopeSummary: string | undefined;
};

export function PortalScopeSection({ scopeSummary }: PortalScopeSectionProps) {
  return (
    <div id="portal-scope" className={cn(HS_PANEL, 'scroll-mt-32 p-8 md:scroll-mt-28')}>
      <h3 className="mb-6 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.25em] text-[var(--text-muted)]">
        <FileText size={14} className="text-[var(--hs-link)]" />
        Project scope
      </h3>
      {scopeSummary ? (
        <div className="whitespace-pre-wrap text-sm font-medium leading-relaxed text-[var(--text-main)]">
          {scopeSummary}
        </div>
      ) : (
        <p className="text-xs font-medium leading-relaxed text-[var(--text-muted)]">
          Your delivery team can add a written scope summary here so everyone stays aligned on what is in and out of the engagement.
        </p>
      )}
    </div>
  );
}
