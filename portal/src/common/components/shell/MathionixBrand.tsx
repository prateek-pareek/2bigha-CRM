import type { ReactNode } from "react";
import Image from "next/image";
import { MATHIONIX_MARK_PNG } from "@/lib/brand-assets";
import { cn } from "@/lib/utils";

type SuiteSidebarBrandProps = {
  collapsed: boolean;
  /** Second line(s) under the company name, e.g. product (CRM / HRMS). */
  productLine: ReactNode;
  /** Extra classes on the outer h-20 row */
  className?: string;
};

/**
 * Suite / client-portal sidebar header: mark + 2Bigha wordmark text.
 */
export function MathionixSuiteSidebarBrand({ collapsed, productLine, className }: SuiteSidebarBrandProps) {
  if (collapsed) {
    return (
      <div
        className={cn(
          "flex h-14 shrink-0 items-center justify-center border-b border-[color:var(--suite-sidebar-border)] px-0",
          className,
        )}
      >
        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-[3px] border border-[color:var(--suite-sidebar-logo-ring)]">
          <Image
            src={MATHIONIX_MARK_PNG}
            alt="2Bigha"
            fill
            priority
            loading="eager"
            className="object-contain"
            sizes="36px"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-14 shrink-0 items-center gap-2.5 border-b border-[color:var(--suite-sidebar-border)] px-4",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-[3px] border border-[color:var(--suite-sidebar-logo-ring)]">
          <Image
            src={MATHIONIX_MARK_PNG}
            alt="2Bigha"
            fill
            priority
            loading="eager"
            className="object-contain"
            sizes="36px"
          />
        </div>
        <div className="flex min-w-0 flex-col overflow-hidden">
          <span className="truncate text-sm font-semibold text-[color:var(--suite-sidebar-fg)]">
            2Bigha
          </span>
          {productLine}
        </div>
      </div>
    </div>
  );
}

type LoginBrandHeroProps = {
  className?: string;
};

/** Centered brand for auth: mark + 2Bigha name. */
export function MathionixLoginBrandHero({ className }: LoginBrandHeroProps) {
  return (
    <div className={cn("mx-auto mb-6 flex flex-col items-center hover:scale-105 transition-transform duration-500", className)}>
      <Image
        src={MATHIONIX_MARK_PNG}
        alt="2Bigha"
        width={110}
        height={110}
        priority
        className="rounded-[28px] object-contain shadow-sm border border-[#f1f3f5]"
      />
      <span className="mt-3 text-xl font-semibold tracking-tight text-[var(--text-main)]">
        2Bigha
      </span>
    </div>
  );
}
