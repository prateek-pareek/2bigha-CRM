import type { ReactNode } from "react";
import Image from "next/image";
import { MATHIONIX_MARK_PNG, MATHIONIX_WORDMARK_DARK_BG_PNG } from "@/lib/brand-assets";
import { cn } from "@/lib/utils";

type SuiteSidebarBrandProps = {
  collapsed: boolean;
  /** Second line(s) under the company name, e.g. product (CRM / HRMS). */
  productLine: ReactNode;
  /** Extra classes on the outer h-20 row */
  className?: string;
};

/**
 * Suite / client-portal sidebar header: favicon mark + wordmark text in light mode;
 * full wordmark image on dark surfaces (matches `.dark` + dark sidebar tokens).
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
            alt="Mathionix"
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
      <div className="flex min-w-0 flex-1 items-center gap-2.5 dark:hidden">
        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-[3px] border border-[color:var(--suite-sidebar-logo-ring)]">
          <Image
            src={MATHIONIX_MARK_PNG}
            alt="Mathionix"
            fill
            priority
            loading="eager"
            className="object-contain"
            sizes="36px"
          />
        </div>
        <div className="flex min-w-0 flex-col overflow-hidden">
          <span className="truncate text-sm font-semibold text-[color:var(--suite-sidebar-fg)]">
            Mathionix Technologies
          </span>
          {productLine}
        </div>
      </div>

      <div className="hidden min-w-0 flex-1 flex-col justify-center gap-1 dark:flex">
        <div className="relative h-8 w-full max-w-[220px]">
          <Image
            src={MATHIONIX_WORDMARK_DARK_BG_PNG}
            alt="Mathionix Technologies"
            fill
            priority
            loading="eager"
            className="object-contain object-left"
            sizes="220px"
          />
        </div>
        {productLine}
      </div>
    </div>
  );
}

type LoginBrandHeroProps = {
  className?: string;
};

/** Centered brand for auth: mark on light card, wordmark when `dark` is active. */
export function MathionixLoginBrandHero({ className }: LoginBrandHeroProps) {
  return (
    <div className={cn("mx-auto mb-6 flex flex-col items-center hover:scale-105 transition-transform duration-500", className)}>
      <div className="relative dark:hidden">
        <Image
          src={MATHIONIX_MARK_PNG}
          alt="Mathionix"
          width={110}
          height={110}
          priority
          className="rounded-[28px] object-contain shadow-sm border border-[#f1f3f5]"
        />
      </div>
      <div className="hidden dark:block w-full max-w-[280px]">
        <Image
          src={MATHIONIX_WORDMARK_DARK_BG_PNG}
          alt="Mathionix Technologies"
          width={280}
          height={72}
          priority
          className="h-14 w-auto max-w-full object-contain mx-auto"
        />
      </div>
    </div>
  );
}
