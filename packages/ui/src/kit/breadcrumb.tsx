"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "../utils";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

/** @deprecated Prefer `BreadcrumbItem` */
export type CrmBreadcrumbItem = BreadcrumbItem;

export type BreadcrumbProps = {
  items: BreadcrumbItem[];
  className?: string;
};

/** Breadcrumb: Home › Section — muted links, medium active label */
export function Breadcrumb({ items, className }: BreadcrumbProps) {
  if (!items.length) return null;
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex flex-wrap items-center gap-1 text-sm font-normal leading-normal text-[var(--text-muted)]",
        className,
      )}
    >
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <span key={`${item.label}-${i}`} className="inline-flex items-center gap-1">
            {i > 0 ? (
              <ChevronRight
                size={12}
                strokeWidth={2.25}
                className="text-[var(--text-muted)] opacity-70"
                aria-hidden
              />
            ) : null}
            {item.href && !last ? (
              <Link
                href={item.href}
                className="font-normal text-[var(--text-muted)] transition-colors hover:text-[var(--primary)]"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={
                  last
                    ? "font-medium text-[var(--text-main)]"
                    : "font-normal text-[var(--text-muted)]"
                }
                aria-current={last ? "page" : undefined}
              >
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/** @deprecated Prefer `Breadcrumb` */
export const CrmBreadcrumb = Breadcrumb;
export type CrmBreadcrumbProps = BreadcrumbProps;
