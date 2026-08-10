"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { canAccessCrmSetting, CRM_SETTINGS_ITEMS } from "@/lib/crm/settings/settings-access";
import {
  CRM_SETTINGS_OVERVIEW,
  CRM_SETTINGS_SECTIONS,
  isCrmSettingsPathActive,
} from "@/lib/crm/settings/settings-nav";
import { CRM_BTN_ICON, CRM_PANEL } from "@/lib/crm/ui";

function NavRow({
  href,
  name,
  icon: Icon,
  active,
  collapsed,
}: {
  href: string;
  name: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "crm-hs-nav-item flex h-9 items-center gap-2.5 rounded-[6px] px-2.5 text-[13px] font-medium transition-colors",
        collapsed && "justify-center px-0",
        active
          ? "bg-[var(--suite-sidebar-active-bg)] font-medium text-[var(--primary)] hover:bg-[var(--suite-sidebar-active-bg)] hover:text-[var(--primary)]"
          : "text-[var(--text-muted)] hover:bg-[var(--suite-sidebar-hover)] hover:text-[var(--text-main)]",
      )}
      title={collapsed ? name : undefined}
    >
      <Icon
        size={15}
        className={cn("shrink-0", active ? "text-[var(--primary)]" : "text-[var(--text-muted)]")}
        strokeWidth={1.75}
      />
      {!collapsed && <span className="truncate">{name}</span>}
    </Link>
  );
}

export default function CrmSettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { isLoaded, isAdmin, hasAccess, canViewCrmRevenue } = usePermissions();

  useEffect(() => {
    const saved = localStorage.getItem("crm-settings-sidebar-collapsed");
    if (saved === "true") setIsCollapsed(true);
  }, []);

  const handleToggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("crm-settings-sidebar-collapsed", String(next));
      return next;
    });
  };

  const sectionAccess = useMemo(
    () =>
      new Set(
        CRM_SETTINGS_ITEMS.filter(
          (item) =>
            (isAdmin ||
              canAccessCrmSetting(hasAccess, item.requiredPermission, {
                canViewCrmRevenue,
                superAdminOnly: item.superAdminOnly,
              })) &&
            (!item.superAdminOnly || canViewCrmRevenue),
        ).map((item) => item.href),
      ),
    [canViewCrmRevenue, hasAccess, isAdmin],
  );

  const visibleSections = useMemo(
    () =>
      CRM_SETTINGS_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((item) => isAdmin || sectionAccess.has(item.href)),
      })).filter((section) => section.items.length > 0),
    [isAdmin, sectionAccess],
  );

  useEffect(() => {
    if (!isLoaded) return;
    if (pathname === "/crm/settings") return;
    const exact = CRM_SETTINGS_ITEMS.find((item) => pathname === item.href);
    const nested = CRM_SETTINGS_ITEMS.find(
      (item) => pathname.startsWith(`${item.href}/`) && item.href !== "/crm/settings",
    );
    const current = exact || nested;
    if (!current) return;
    if (current.superAdminOnly && !canViewCrmRevenue) {
      router.replace("/crm/settings");
      return;
    }
    if (isAdmin) return;
    if (
      canAccessCrmSetting(hasAccess, current.requiredPermission, {
        canViewCrmRevenue,
        superAdminOnly: current.superAdminOnly,
      })
    ) {
      return;
    }
    const firstAccessible = CRM_SETTINGS_ITEMS.find((item) =>
      canAccessCrmSetting(hasAccess, item.requiredPermission, {
        canViewCrmRevenue,
        superAdminOnly: item.superAdminOnly,
      }),
    );
    router.replace(firstAccessible?.href || "/crm/workspace");
  }, [hasAccess, isAdmin, isLoaded, pathname, router, canViewCrmRevenue]);

  return (
    <div className="theme-crm-hubspot mx-auto w-full animate-in fade-in duration-500 pb-6">
      <div
        className={cn(
          "grid grid-cols-1 gap-4 lg:items-start",
          isCollapsed ? "lg:grid-cols-[72px_minmax(0,1fr)]" : "lg:grid-cols-[260px_minmax(0,1fr)]",
        )}
      >
        <aside
          className={cn(
            CRM_PANEL,
            "crm-suite-sidebar relative overflow-hidden transition-all duration-300 lg:sticky lg:top-4 lg:max-h-[calc(100vh-5.5rem)]",
            isCollapsed ? "lg:w-[72px]" : "lg:w-[260px]",
          )}
        >
          <div
            className={cn(
              "flex items-center border-b border-[var(--border-color)]",
              isCollapsed ? "justify-center px-2 py-3.5" : "gap-2.5 px-4 py-3.5",
            )}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] bg-[var(--primary-light)] text-[var(--primary)]">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            {!isCollapsed ? (
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold text-[var(--text-main)]">Settings</h2>
                <p className="truncate text-[11px] text-[var(--text-muted)]">CRM configuration</p>
              </div>
            ) : null}
          </div>

          <nav
            aria-label="Settings sections"
            className="max-h-[min(70vh,calc(100vh-9rem))] space-y-0.5 overflow-y-auto p-2 no-scrollbar lg:max-h-[calc(100vh-9.5rem)]"
          >
            <NavRow
              href={CRM_SETTINGS_OVERVIEW.href}
              name={CRM_SETTINGS_OVERVIEW.name}
              icon={CRM_SETTINGS_OVERVIEW.icon}
              active={pathname === "/crm/settings"}
              collapsed={isCollapsed}
            />

            {visibleSections.map((section) => (
              <div key={section.id} className="mt-3 pt-1">
                {!isCollapsed ? (
                  <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                    {section.label}
                  </p>
                ) : (
                  <div className="mx-auto mb-1.5 h-px w-6 bg-[var(--border-color)]" aria-hidden />
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavRow
                      key={item.href}
                      href={item.href}
                      name={item.name}
                      icon={item.icon}
                      active={isCrmSettingsPathActive(pathname, item.href)}
                      collapsed={isCollapsed}
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <button
            type="button"
            onClick={handleToggleSidebar}
            className={cn(
              CRM_BTN_ICON,
              "absolute -right-3 top-4 z-10 hidden h-7 w-7 shadow-[var(--crm-shadow-card)] lg:flex",
            )}
            aria-label={isCollapsed ? "Expand settings sidebar" : "Collapse settings sidebar"}
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
