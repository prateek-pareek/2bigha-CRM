"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
};

/** Collapsible sidebar group — reduces scroll fatigue on record detail pages. */
export default function CrmRecordSidebarGroup({
  title,
  children,
  defaultOpen = true,
  className,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={cn("crm-record-sidebar-group min-w-0", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="crm-record-sidebar-group__toggle"
        aria-expanded={open}
      >
        <span>{title}</span>
        <ChevronDown
          size={14}
          className={cn("shrink-0 transition-transform duration-200", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? <div className="crm-record-sidebar-group__body">{children}</div> : null}
    </section>
  );
}
