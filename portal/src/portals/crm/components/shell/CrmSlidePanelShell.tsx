"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { crmModalChrome } from "@/lib/crm/chrome";
import { cn } from "@/lib/utils";

type CrmSlidePanelShellProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Extra controls shown left of the header close button (e.g. Fields). */
  headerActions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Match lead create: compact rail */
  maxWidthClass?: string;
  /** @deprecated Jira styling is always used; kept for call-site compatibility */
  headerTone?: "default" | "hubspot";
  /** When true the panel sizes to its content instead of full viewport height. */
  autoHeight?: boolean;
  /** Override scrollable body padding (default `px-5 py-5`). */
  contentClassName?: string;
  zIndexClass?: string;
};

/**
 * Shared right-rail offcanvas used by lead / contact / deal create panels.
 * Layout follows CRMS Admin Kit (Dreams) — wide enough for 2-column forms.
 */
export default function CrmSlidePanelShell({
  isOpen,
  onClose,
  title,
  subtitle,
  headerActions,
  children,
  footer,
  maxWidthClass = "max-w-2xl",
  autoHeight = false,
  contentClassName,
  zIndexClass = "z-[9999]",
}: CrmSlidePanelShellProps) {
  if (!isOpen) return null;

  return (
    <div className={cn(crmModalChrome.overlay, zIndexClass)}>
      <div className={crmModalChrome.backdrop} onClick={onClose} aria-hidden />

      <div
        className={cn(
          crmModalChrome.slidePanel,
          maxWidthClass,
          autoHeight && "inset-y-auto top-0 bottom-0 my-auto max-h-[min(92vh,48rem)] rounded-l-[var(--crm-radius-modal)]",
        )}
      >
        <div className={crmModalChrome.slideHeader}>
          <div className="min-w-0 flex-1">
            <h2 className={crmModalChrome.slideTitle}>{title}</h2>
            {subtitle ? <p className={crmModalChrome.slideSubtitle}>{subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
            <button type="button" onClick={onClose} className={crmModalChrome.closeBtn} aria-label="Close">
              <X size={16} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        <div className={cn(crmModalChrome.slideBody, contentClassName)}>{children}</div>

        {footer ? <div className={crmModalChrome.slideFooter}>{footer}</div> : null}
      </div>
    </div>
  );
}
