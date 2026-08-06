import { cn } from '@/lib/utils';
import { HS_PANEL } from './panel-styles';
import { PortalInquiryForm } from './PortalInquiryForm';
import { PortalChatBox } from './PortalChatBox';

type PortalContactColumnProps = {
  portalToken: string;
  dealId: string;
  authHeaders: Record<string, string>;
};

export function PortalContactColumn({ portalToken, dealId, authHeaders }: PortalContactColumnProps) {
  return (
    <div id="portal-contact" className="scroll-mt-32 space-y-6 lg:col-span-4 md:scroll-mt-28">
      <div className={cn(HS_PANEL, 'p-6')}>
        <h3 className="mb-6 text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
          Your project manager
        </h3>
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[var(--hs-link)] text-sm font-bold text-white shadow-md shadow-[var(--hs-link)]/25">
            MX
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--text-main)]">Mathionix Hub Manager</p>
            <p className="mt-1 text-xs font-bold uppercase leading-none tracking-widest text-[var(--text-muted)]">
              Support &amp; delivery
            </p>
          </div>
        </div>
      </div>
      <PortalChatBox portalToken={portalToken} dealId={dealId} authHeaders={authHeaders} />
      <PortalInquiryForm token={portalToken} />
    </div>
  );
}

