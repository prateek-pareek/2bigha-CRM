"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { crmModalChrome } from "@/lib/pm/jira-ui";
import { cn } from "@/lib/pm/utils";

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
 * Shared right-rail overlay used by lead / contact / deal create panels (Jira-style slide-in).
 */
export default function CrmSlidePanelShell({
  isOpen,
  onClose,
  title,
  subtitle,
  headerActions,
  children,
  footer,
  maxWidthClass = "max-w-lg",
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
          autoHeight && "inset-y-auto top-0 bottom-0 my-auto max-h-[min(92vh,48rem)] rounded-l-[3px]",
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
