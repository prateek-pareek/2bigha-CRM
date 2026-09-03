"use client";

import {
  forwardRef,
  useRef,
  type CSSProperties,
  type ReactNode,
  type HTMLAttributes,
  type DragEvent,
} from "react";
import { cn } from "@/lib/utils";
import { crmStageAccent } from "@/lib/crm/stage-accent";
import { CrmIcon } from "@/lib/crm/shared/icons";

/**
 * Dreams CRMS kanban card — measured from
 * https://crms.dreamstechnologies.com/html/leads.html
 *
 * .card.kanban-card.border.shadow
 *   .card-body (20px)
 *     .card-topbar.mb-3.pt-1          (4px inset accent)
 *     .d-flex.mb-3                   (40px soft avatar + fs-14 name)
 *     .d-flex.flex-column            (meta: icons text-dark, copy text-default #707070)
 *     .border-top.pt-3               (xs avatar + social icons)
 */

const COL =
  "crm-kanban-column flex w-[300px] max-w-[300px] shrink-0 flex-col rounded-[5px] border border-[#e2e8f0] bg-transparent p-2 min-h-[320px]";

const COL_HEADER =
  "crm-kanban-column-header flex items-center justify-between gap-2 rounded-[5px] border-0 bg-white p-2 shadow-[0_4px_4px_0_rgba(219,219,219,0.25)]";

const CARD =
  "crm-kanban-card group relative mt-4 box-border rounded-[5px] border border-[#e2e8f0] bg-white p-5 shadow-[0_4px_4px_0_rgba(219,219,219,0.25)] transition-shadow hover:shadow-[0_6px_12px_0_rgba(219,219,219,0.35)]";

export const CrmKanbanBoard = forwardRef<
  HTMLDivElement,
  { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>
>(function CrmKanbanBoard({ children, className, ...rest }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "crm-kanban-board flex h-full items-start gap-4 overflow-x-auto pb-4 custom-scrollbar",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});

type CrmKanbanColumnProps = {
  title: string;
  count?: number;
  summary?: ReactNode;
  stageKey?: string;
  accent?: string;
  children: ReactNode;
  headerExtra?: ReactNode;
  onAdd?: () => void;
  className?: string;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  style?: CSSProperties;
};

export function CrmKanbanColumn({
  title,
  count,
  summary,
  stageKey,
  accent,
  children,
  headerExtra,
  onAdd,
  className,
  onDragOver,
  onDrop,
  style,
}: CrmKanbanColumnProps) {
  const stageAccent = accent || crmStageAccent(stageKey || title);
  // HTML5 DnD requires preventDefault on dragover or the browser rejects the drop.
  const allowDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!onDrop) {
      onDragOver?.(e);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    onDragOver?.(e);
  };
  return (
    <div
      className={cn(COL, className)}
      onDragOver={allowDrop}
      onDrop={onDrop}
      style={
        {
          ["--crm-stage-accent" as string]: stageAccent,
          ...style,
        } as CSSProperties
      }
    >
      <div className={COL_HEADER}>
        <div className="crm-kanban-column-header-main min-w-0 flex-1">
          <h3 className="crm-kanban-column-title mb-1 flex items-center gap-1 text-base font-bold leading-[1.2] tracking-normal text-[#1f2020]">
            <span
              className="crm-kanban-stage-dot inline-block h-[10px] w-[10px] shrink-0 rounded-full"
              style={{ background: stageAccent }}
              aria-hidden
            />
            {title}
          </h3>
          <p className="crm-kanban-column-summary m-0 text-sm font-medium leading-snug text-[#1f2020]">
            {summary ??
              (typeof count === "number"
                ? `${count} item${count === 1 ? "" : "s"}`
                : null)}
          </p>
        </div>
        <div className="crm-kanban-header-actions flex shrink-0 items-center gap-2">
          {onAdd ? (
            <button
              type="button"
              onClick={onAdd}
              className="crm-kanban-header-action crm-kanban-header-action--add inline-flex h-7 w-7 items-center justify-center rounded border-0 bg-transparent text-[#2f80ed] transition-colors hover:bg-[#f7f8f9] hover:text-[var(--primary)]"
              title="Add"
              aria-label={`Add to ${title}`}
            >
              <CrmIcon.Plus size={16} />
            </button>
          ) : null}
          <button
            type="button"
            className="crm-kanban-header-action crm-kanban-header-action--menu inline-flex h-7 w-7 items-center justify-center rounded border border-[#e2e8f0] bg-white text-[#707070] shadow-[0_4px_4px_0_rgba(219,219,219,0.25)] transition-colors hover:bg-[#f7f8f9] hover:text-[var(--primary)]"
            title="More"
            aria-label={`${title} options`}
          >
            <CrmIcon.DotsVertical size={14} />
          </button>
          {headerExtra}
        </div>
      </div>
      <div
        className="crm-kanban-column-body flex min-h-0 flex-1 flex-col overflow-y-auto"
        onDragOver={allowDrop}
        onDrop={onDrop}
      >
        {children}
      </div>
    </div>
  );
}

type CrmKanbanCardProps = {
  children: ReactNode;
  className?: string;
  stageKey?: string;
  accent?: string;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  style?: CSSProperties;
} & Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "onClick" | "onDragStart" | "draggable" | "style"
>;

export const CrmKanbanCard = forwardRef<HTMLDivElement, CrmKanbanCardProps>(
  function CrmKanbanCard(
    {
      children,
      className,
      stageKey,
      accent,
      onClick,
      draggable,
      onDragStart,
      style,
      ...rest
    },
    ref,
  ) {
    const stageAccent = accent || (stageKey ? crmStageAccent(stageKey) : "#ffa201");
    const didDragRef = useRef(false);
    return (
      <div
        ref={ref}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        draggable={draggable}
        onDragStart={(e) => {
          if (!draggable) return;
          didDragRef.current = true;
          e.dataTransfer.effectAllowed = "move";
          onDragStart?.(e);
          // Fallback MIME for browsers that drop custom types on drop.
          try {
            if (!e.dataTransfer.getData("text/plain")) {
              const fallback =
                e.dataTransfer.getData("leadId") ||
                e.dataTransfer.getData("propertyId") ||
                e.dataTransfer.getData("legalCaseId") ||
                e.dataTransfer.getData("text/pm-id");
              if (fallback) e.dataTransfer.setData("text/plain", fallback);
            }
          } catch {
            /* ignore */
          }
        }}
        onDragEnd={() => {
          // Keep flag until click handler runs (dragend then click).
          window.setTimeout(() => {
            didDragRef.current = false;
          }, 50);
        }}
        onClick={(e) => {
          if (didDragRef.current) {
            didDragRef.current = false;
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          onClick?.();
        }}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
        className={cn(
          CARD,
          draggable && "cursor-grab active:cursor-grabbing select-none",
          onClick && !draggable && "cursor-pointer",
          className,
        )}
        style={
          {
            ["--crm-stage-accent" as string]: stageAccent,
            WebkitUserDrag: draggable ? "element" : undefined,
            ...style,
          } as CSSProperties
        }
        {...rest}
      >
        {/* .card-topbar.mb-3.pt-1 — 4px inset accent bar */}
        <div
          className="crm-kanban-topbar mb-4 block h-[4px] w-full shrink-0"
          style={{ background: stageAccent }}
          aria-hidden
        />
        {children}
      </div>
    );
  },
);

const AVATAR_TONES: Record<string, string> = {
  info: "bg-[#eaf2fd] text-[#2f80ed]",
  danger: "bg-[#fde9e9] text-[#ef1e1e]",
  warning: "bg-[#fef8e6] text-[#f9b801]",
  success: "bg-[#e8f9e8] text-[#1abe17]",
  primary: "bg-[#fce9e6] text-[#e41f07]",
};

export function CrmKanbanAvatar({
  children,
  className,
  size = "md",
  tone,
}: {
  children: ReactNode;
  className?: string;
  size?: "sm" | "md";
  tone?: "info" | "danger" | "warning" | "success" | "primary";
}) {
  return (
    <div
      className={cn(
        "crm-kanban-avatar inline-flex shrink-0 items-center justify-center rounded-full font-medium leading-none",
        size === "sm"
          ? "crm-kanban-avatar--sm h-6 w-6 border border-[#e2e8f0] bg-white p-0.5 text-[10px] text-[#707070]"
          : cn("h-10 w-10 text-sm", tone ? AVATAR_TONES[tone] : AVATAR_TONES.info),
        tone && size !== "sm" && `crm-kanban-avatar--${tone}`,
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CrmKanbanCardHead({
  initials,
  title,
  subtitle,
  leading,
  trailing,
  className,
  tone,
}: {
  initials: string;
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  tone?: "info" | "danger" | "warning" | "success" | "primary";
}) {
  return (
    <div
      className={cn(
        /* .d-flex.align-items-center.mb-3 */
        "crm-kanban-card-head relative mb-4 flex items-center gap-2",
        className,
      )}
    >
      {leading}
      <CrmKanbanAvatar tone={tone}>{initials}</CrmKanbanAvatar>
      <div className="min-w-0 flex-1">
        {/* h6.fw-medium.fs-14 */}
        <div className="crm-kanban-card-title truncate text-sm font-medium leading-[1.2] text-[#1f2020] group-hover:text-[var(--primary)]">
          {title}
        </div>
        {subtitle ? (
          <div className="crm-kanban-card-subtitle mt-0.5 truncate text-xs font-medium text-[#707070]">
            {subtitle}
          </div>
        ) : null}
      </div>
      {trailing ? (
        <div
          className="crm-kanban-card-head-trailing absolute right-0 top-0 hidden items-center gap-0.5 group-hover:flex group-focus-within:flex"
          onClick={(e) => e.stopPropagation()}
        >
          {trailing}
        </div>
      ) : null}
    </div>
  );
}

export function CrmKanbanMetaRow({
  icon,
  children,
  className,
}: {
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    /* p.text-default — copy #707070; icons text-dark #1f2020 */
    <p
      className={cn(
        "crm-kanban-meta-row mb-2 flex items-center gap-1 text-sm font-normal leading-[21px] text-[#707070] last:mb-4",
        className,
      )}
    >
      {icon ? (
        <span className="crm-kanban-meta-icon inline-flex shrink-0 items-center justify-center text-[#1f2020] [&_svg]:size-[15px]">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 truncate">{children}</span>
    </p>
  );
}

export function CrmKanbanMetaList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("crm-kanban-meta-list flex flex-col", className)}>
      {children}
    </div>
  );
}

export function CrmKanbanCardFooter({
  children,
  className,
  left,
  actions,
}: {
  children?: ReactNode;
  className?: string;
  left?: ReactNode;
  actions?: boolean | ReactNode;
}) {
  const defaultActions = (
    <div className="crm-kanban-card-actions icons-social flex items-center gap-1">
      <span
        className="crm-kanban-card-action me-1 inline-flex items-center justify-center text-[#1f2020] hover:text-[var(--primary)]"
        aria-hidden
      >
        <CrmIcon.PhoneCall size={14} />
      </span>
      <span
        className="crm-kanban-card-action me-1 inline-flex items-center justify-center text-[#1f2020] hover:text-[var(--primary)]"
        aria-hidden
      >
        <CrmIcon.Message size={14} />
      </span>
      <span
        className="crm-kanban-card-action inline-flex items-center justify-center text-[#1f2020] hover:text-[var(--primary)]"
        aria-hidden
      >
        <CrmIcon.Palette size={14} />
      </span>
    </div>
  );

  return (
    /* .border-top.pt-3 — 16px top pad */
    <div
      className={cn(
        "crm-kanban-card-footer flex items-center justify-between gap-2 border-t border-[#e2e8f0] pt-4",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {left}
        {children}
      </div>
      {actions === true ? defaultActions : actions || null}
    </div>
  );
}

export function crmKanbanAvatarTone(
  seed: string,
): "info" | "danger" | "warning" | "success" | "primary" {
  const tones = ["info", "danger", "warning", "success", "primary"] as const;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return tones[h % tones.length];
}
