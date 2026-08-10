"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type CrmSubnavItem = {
  href: string;
  label: string;
  /** Hide when false */
  visible?: boolean;
};

/**
 * CRMS-style secondary page nav under the title row (Dashboard children / Report children).
 * Longest href wins when several items share a path prefix (e.g. /crm/reports/leads vs …/funnel).
 */
export function CrmSubnav({ items, className }: { items: CrmSubnavItem[]; className?: string }) {
  const pathname = usePathname();
  const visible = items.filter((i) => i.visible !== false);

  const activeHref =
    visible
      .map((i) => i.href)
      .filter((href) => {
        if (pathname === href) return true;
        if (href === "/crm/workspace" || href === "/crm/reports") return false;
        return pathname.startsWith(`${href}/`);
      })
      .sort((a, b) => b.length - a.length)[0] ?? null;

  return (
    <nav
      aria-label="Section"
      className={cn(
        "mb-4 flex flex-wrap gap-0 overflow-x-auto border-b border-[var(--border-color)] no-scrollbar",
        className,
      )}
    >
      {visible.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4",
              active
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
