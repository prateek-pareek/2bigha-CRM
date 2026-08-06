"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutDashboard, Menu, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { MathionixSuiteSidebarBrand } from "@/components/MathionixBrand";

export type ClientPortalSectionNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type ClientPortalShellProps = {
  /** Primary line in the top header (e.g. organization or deal title) */
  title: string;
  /** Optional second line under the title (e.g. deal name) */
  subtitle?: string;
  /** Short project / deal id shown on the right of the header */
  projectIdLabel?: string;
  /** Stage or status text */
  statusLabel?: string;
  /** In-page section links for the sidebar (hash anchors inside main) */
  sectionNavItems?: readonly ClientPortalSectionNavItem[];
  children: React.ReactNode;
};

function SidebarNav({
  sectionNavItems,
  activeSectionId,
  onNavigate,
  scrollMainToId,
}: {
  sectionNavItems?: readonly ClientPortalSectionNavItem[];
  activeSectionId: string;
  onNavigate?: () => void;
  scrollMainToId: (id: string) => void;
}) {
  const items =
    sectionNavItems && sectionNavItems.length > 0
      ? sectionNavItems
      : [
          {
            href: "#portal-overview",
            label: "Project overview",
            icon: LayoutDashboard,
          },
        ];

  return (
    <>
      <MathionixSuiteSidebarBrand
        collapsed={false}
        productLine={
          <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--primary)]">
            Client portal
          </span>
        }
      />

      <nav
        className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-3"
        aria-label="Page sections"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(255,255,255,0.25) transparent",
        }}
      >
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-widest text-[color:var(--suite-sidebar-muted)]">
          On this page
        </p>
        {items.map(({ href, label, icon: Icon }) => {
          const id = href.replace(/^#/, "");
          const isActive = activeSectionId === id;
          return (
            <a
              key={href}
              href={href}
              onClick={(e) => {
                e.preventDefault();
                scrollMainToId(id);
                onNavigate?.();
                try {
                  window.history.replaceState(null, "", href);
                } catch {
                  /* ignore */
                }
              }}
              className={cn(
                "crm-hs-nav-item flex items-center gap-3 rounded-md border-l-[3px] py-2 pl-3 pr-3 text-sm font-semibold transition-colors",
                isActive
                  ? "border-l-[color:var(--primary)] bg-[var(--suite-sidebar-active-bg)] text-[color:var(--suite-sidebar-fg)]"
                  : "border-l-transparent text-[color:var(--suite-sidebar-fg)]/85 hover:bg-[var(--suite-sidebar-hover)]",
              )}
              aria-current={isActive ? "location" : undefined}
            >
              <Icon
                size={18}
                className={cn(
                  "shrink-0",
                  isActive ? "text-[color:var(--suite-sidebar-fg)]" : "text-[color:var(--suite-sidebar-muted)]",
                )}
                strokeWidth={isActive ? 2.25 : 2}
              />
              <span className="min-w-0 leading-snug">{label}</span>
            </a>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-[color:var(--suite-sidebar-border)] px-4 py-3">
        <p className="text-[9px] font-semibold uppercase tracking-widest text-[color:var(--suite-sidebar-muted)]">
          Secure access
        </p>
        <p className="mt-1 text-xs leading-snug text-[color:var(--suite-sidebar-fg)] opacity-90">
          This page is private to your organization. Do not forward your link.
        </p>
      </div>
    </>
  );
}

export default function ClientPortalShell({
  title,
  subtitle,
  projectIdLabel,
  statusLabel,
  sectionNavItems,
  children,
}: ClientPortalShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const [activeSectionId, setActiveSectionId] = useState("portal-overview");

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  const scrollMainToId = useCallback((id: string) => {
    const main = mainRef.current;
    const el = document.getElementById(id);
    if (!main || !el) return;
    const mainRect = main.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const top = elRect.top - mainRect.top + main.scrollTop - 12;
    main.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, []);

  const navKey =
    sectionNavItems && sectionNavItems.length > 0
      ? sectionNavItems.map((i) => i.href).join("|")
      : "#portal-overview";

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    const navIds = navKey.split("|").map((h) => h.replace(/^#/, ""));

    const headerOffset = 88;

    const syncFromHash = () => {
      const h = window.location.hash.replace(/^#/, "");
      if (h && navIds.includes(h)) {
        setActiveSectionId(h);
      }
    };

    const updateActiveFromScroll = () => {
      const scrollPos = main.scrollTop + headerOffset;
      let current = navIds[0];
      for (const id of navIds) {
        const el = document.getElementById(id);
        if (!el) continue;
        const mainRect = main.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const top = elRect.top - mainRect.top + main.scrollTop;
        if (scrollPos >= top - 4) {
          current = id;
        }
      }
      setActiveSectionId((prev) => (prev === current ? prev : current));
    };

    syncFromHash();
    updateActiveFromScroll();

    const onHash = () => syncFromHash();
    window.addEventListener("hashchange", onHash);
    main.addEventListener("scroll", updateActiveFromScroll, { passive: true });

    return () => {
      window.removeEventListener("hashchange", onHash);
      main.removeEventListener("scroll", updateActiveFromScroll);
    };
  }, [navKey]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  useEffect(() => {
    if (mobileNavOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileNavOpen]);

  return (
    <div className="crm-app-shell flex h-screen min-h-screen overflow-hidden bg-[var(--background)]">
      <aside
        className={cn(
          "crm-suite-sidebar hidden h-screen w-64 shrink-0 flex-col border-r border-[color:var(--suite-sidebar-border)] lg:flex",
          "bg-[var(--suite-sidebar-bg)] text-[color:var(--suite-sidebar-fg)]",
        )}
      >
        <SidebarNav
          sectionNavItems={sectionNavItems}
          activeSectionId={activeSectionId}
          scrollMainToId={scrollMainToId}
        />
      </aside>

      {mobileNavOpen ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={closeMobileNav}
          />
          <aside
            id="portal-mobile-nav"
            className={cn(
              "crm-suite-sidebar fixed inset-y-0 left-0 z-50 flex w-[min(18rem,88vw)] flex-col shadow-xl lg:hidden",
              "animate-in slide-in-from-left-4 duration-200",
              "bg-[var(--suite-sidebar-bg)] text-[color:var(--suite-sidebar-fg)]",
            )}
          >
            <div className="flex h-14 shrink-0 items-center justify-end border-b border-[color:var(--suite-sidebar-border)] px-3">
              <button
                type="button"
                onClick={closeMobileNav}
                className="flex h-9 w-9 items-center justify-center rounded-md text-[color:var(--suite-sidebar-fg)] hover:bg-[var(--suite-sidebar-hover)]"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>
            <SidebarNav
              sectionNavItems={sectionNavItems}
              activeSectionId={activeSectionId}
              onNavigate={closeMobileNav}
              scrollMainToId={scrollMainToId}
            />
          </aside>
        </>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="crm-app-header z-30 flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-[var(--border-color)] bg-white px-4 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:px-6 md:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--border-color)] bg-[var(--background)] text-[var(--text-main)] hover:bg-[var(--surface-dim)] lg:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-expanded={mobileNavOpen}
              aria-controls="portal-mobile-nav"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0 flex-1 pr-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                Your project
              </p>
              <h1 className="truncate text-base font-semibold leading-tight text-[var(--text-main)]">{title}</h1>
              {subtitle ? (
                <p className="mt-0.5 truncate text-xs font-medium text-[var(--text-muted)]">{subtitle}</p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            {statusLabel ? (
              <div className="hidden rounded-md border border-[var(--border-color)] bg-gradient-to-br from-[var(--background)] to-white px-3 py-2 sm:block">
                <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Status</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--hs-link)]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--hs-link)]" aria-hidden />
                  {statusLabel}
                </p>
              </div>
            ) : null}
            {projectIdLabel ? (
              <div className="hidden max-w-[7rem] text-right sm:block sm:max-w-none">
                <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                  Reference
                </p>
                <p className="truncate font-mono text-xs font-semibold text-[var(--text-main)]">{projectIdLabel}</p>
              </div>
            ) : null}
          </div>
        </header>

        <main
          ref={mainRef}
          className="crm-app-main custom-scrollbar min-h-0 flex-1 overflow-y-auto bg-[var(--background)] p-4 sm:p-6 md:p-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
