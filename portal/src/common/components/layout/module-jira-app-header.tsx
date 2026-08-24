"use client";

import { useState, useMemo, useEffect, useCallback, type ComponentType } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import {
  Bell,
  LogOut,
  HelpCircle,
  Menu,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Check,
  Maximize2,
  Minimize2,
  PieChart,
  Search,
} from "lucide-react";
import { CrmIcon } from "@/lib/crm/shared/icons";
import { ThemeModeToggle } from "@/components/suite/shell/ThemeModeToggle";
import NotificationList from '@/components/suite/notifications/NotificationList';
import { jiraAppChrome, jiraSidebarChrome } from "@/lib/pm/jira-ui";
import { crmAppChrome } from "@/lib/crm/shell";
import { hrmsAppChrome } from "@/lib/hrms/shell";
import { socialAppChrome } from "@/lib/social/shell";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { tools } from "@/components/suite/shell/Sidebar";
import { MATHIONIX_MARK_PNG } from "@/lib/brand-assets";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LazyGlobalSearch = dynamic(() => import("@/components/suite/search/LazyGlobalSearch"), {
  ssr: false,
});
const LazyPMGlobalSearch = dynamic(() => import("@/components/pm/layout/LazyPMGlobalSearch"), {
  ssr: false,
});

type ModuleJiraAppHeaderProps = {
  onMobileMenuClick: () => void;
  user: {
    firstName?: string;
    lastName?: string;
    role?: string;
  } | null;
  unreadCount: number;
  productName: string;
  productHref: string;
  productIcon: ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Tailwind bg class for the product logo chip, e.g. "bg-[#0c66e4]" */
  productLogoClass?: string;
  isSidebarPinned: boolean;
  onSidebarToggleClick: () => void;
  onSidebarToggleMouseEnter?: () => void;
  onSidebarToggleMouseLeave?: () => void;
};

const CRM_HEADER_COLLAPSED_KEY = "crmHeaderCollapsed";

function AppsSwitcherMenu({
  isSuiteChrome,
  menu,
  visibleTools,
  activeToolId,
  getToolLandingPage,
}: {
  isSuiteChrome: boolean;
  menu: typeof crmAppChrome | typeof hrmsAppChrome | typeof socialAppChrome | typeof jiraSidebarChrome;
  visibleTools: typeof tools;
  activeToolId: string;
  getToolLandingPage: (id: string) => string;
}) {
  const suiteMenu = menu as typeof crmAppChrome;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={
            isSuiteChrome
              ? suiteMenu.iconChipTeal
              : "h-8 w-8 shrink-0 flex items-center justify-center rounded-[3px] text-[#44546f] hover:bg-[#f4f5f7]"
          }
          title="Switch apps"
          aria-label="Switch apps"
        >
          {isSuiteChrome ? (
            <CrmIcon.Apps size={18} />
          ) : (
            <LayoutGrid className="h-[18px] w-[18px]" strokeWidth={1.75} />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align={isSuiteChrome ? "end" : "start"}
        sideOffset={6}
        className={menu.workspaceMenu}
      >
        <DropdownMenuLabel className={menu.workspaceMenuLabel}>Apps</DropdownMenuLabel>
        {visibleTools.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeToolId === tool.id;
          const targetHref = getToolLandingPage(tool.id);
          return (
            <DropdownMenuItem
              key={tool.id}
              asChild
              className="h-auto cursor-pointer rounded-[3px] p-0 focus:bg-transparent data-[highlighted]:bg-transparent"
            >
              <Link
                href={targetHref}
                prefetch={false}
                className={cn(
                  menu.workspaceMenuItem,
                  isActive && menu.workspaceMenuItemActive,
                )}
              >
                <span
                  className={cn(
                    menu.workspaceMenuIcon,
                    isActive
                      ? cn(menu.workspaceMenuIconActive, !isSuiteChrome && tool.logoClass)
                      : isSuiteChrome
                        ? suiteMenu.workspaceMenuIconIdle
                        : tool.logoClassIdle,
                  )}
                >
                  <Icon size={14} strokeWidth={isActive ? 2.25 : 1.75} />
                </span>
                <span className="min-w-0 flex-1 text-left leading-tight">
                  <span
                    className={cn(
                      "flex items-center gap-1.5",
                      isActive ? menu.workspaceMenuTitleActive : menu.workspaceMenuTitle,
                    )}
                  >
                    {tool.name}
                    {isActive && (
                      <Check
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          isSuiteChrome ? "text-[var(--primary)]" : "text-[#0c66e4]",
                        )}
                        strokeWidth={2.5}
                      />
                    )}
                  </span>
                  <span className={menu.workspaceMenuTagline}>{tool.tagline}</span>
                </span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ModuleJiraAppHeader({
  onMobileMenuClick,
  user,
  unreadCount,
  productName,
  productHref,
  productIcon: ProductIcon,
  productLogoClass = "bg-[#0c66e4]",
  isSidebarPinned,
  onSidebarToggleClick,
  onSidebarToggleMouseEnter,
  onSidebarToggleMouseLeave,
}: ModuleJiraAppHeaderProps) {
  const isCrm = productHref.startsWith("/crm");
  const isHrms = productHref.startsWith("/hrms");
  const isSocial = productHref.startsWith("/social");
  const isPm = productHref.startsWith("/pm");
  /** CRM / HRMS / Social / PM share the Dreams CRMS white-bar header */
  const isSuiteCrms = isCrm || isHrms || isSocial || isPm;
  const app = isCrm || isPm
    ? crmAppChrome
    : isHrms
      ? hrmsAppChrome
      : isSocial
        ? socialAppChrome
        : jiraAppChrome;
  const menu = isCrm || isPm
    ? crmAppChrome
    : isHrms
      ? hrmsAppChrome
      : isSocial
        ? socialAppChrome
        : jiraSidebarChrome;
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const {
    hasAccess,
    isAdmin,
    hasExecutiveAccess,
    permittedTools,
    permissions,
    getToolLandingPage,
  } = usePermissions();

  const visibleTools = useMemo(() => {
    return tools.filter((t) => {
      if (t.id === "executive") return hasExecutiveAccess;
      const hasExplicitTool =
        Array.isArray(permittedTools) &&
        permittedTools.some((p) => p?.toUpperCase() === t.id.toUpperCase());
      if (isAdmin) return true;
      if (t.id === "hrms") {
        const hasSubAccess =
          Array.isArray(permissions) && permissions.some((p) => p.startsWith("hrms:"));
        return hasExplicitTool || hasSubAccess;
      }
      if (t.id === "vault") {
        return hasExplicitTool || hasAccess("vault:read") || hasAccess("hrms:admin");
      }
      return hasExplicitTool;
    });
  }, [isAdmin, hasExecutiveAccess, permittedTools, permissions, hasAccess]);

  const activeToolId = useMemo(() => {
    const path = typeof window !== "undefined" ? window.location.pathname : "";
    if (path.startsWith("/executive")) return "executive";
    if (path.startsWith("/pm")) return "pm";
    if (path.startsWith("/crm")) return "crm";
    if (path.startsWith("/hrms")) return "hrms";
    if (path.startsWith("/social")) return "social";
    if (path.startsWith("/vault")) return "vault";
    return "";
  }, [productHref]);

  const initials =
    `${user?.firstName?.[0] || ""}${user?.lastName?.[0] || ""}`.toUpperCase() || "U";
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Member";

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("pm_token");
    document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT";
    window.location.href = "/auth/login";
  };

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!isCrm) return;
    const stored = localStorage.getItem(CRM_HEADER_COLLAPSED_KEY);
    if (stored === "true") setHeaderCollapsed(true);

    const onToggle = () => {
      setHeaderCollapsed((prev) => {
        const next = !prev;
        localStorage.setItem(CRM_HEADER_COLLAPSED_KEY, String(next));
        window.dispatchEvent(
          new CustomEvent("crm-header:collapsed", { detail: { collapsed: next } }),
        );
        return next;
      });
    };
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener("crm-header:toggle-collapse", onToggle);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("crm-header:toggle-collapse", onToggle);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [isCrm]);

  if (isCrm && headerCollapsed) {
    return null;
  }

  /* ── CRM / HRMS / Social / PM top bar — Dreams CRMS navbar-header pattern ── */
  if (isSuiteCrms) {
    const suite = app as typeof crmAppChrome;
    const analyticsHref = isHrms
      ? "/hrms/analytics"
      : isSocial
        ? "/social/analytics"
        : isPm
          ? "/pm/reports"
          : "/crm/reports/overview";
    return (
      <header className={app.header}>
        <div className={app.inner}>
          <div className={app.left}>
            <button
              type="button"
              onClick={onMobileMenuClick}
              className={app.mobileMenuBtn}
              aria-label="Open navigation"
            >
              <CrmIcon.Menu size={20} />
            </button>

            <button
              type="button"
              onClick={onSidebarToggleClick}
              onMouseEnter={onSidebarToggleMouseEnter}
              onMouseLeave={onSidebarToggleMouseLeave}
              className={cn(suite.iconChip, "hidden lg:inline-flex")}
              title={isSidebarPinned ? "Collapse sidebar" : "Pin sidebar"}
              aria-label="Toggle sidebar"
            >
              {isSidebarPinned ? (
                <CrmIcon.SidebarCollapse size={16} />
              ) : (
                <CrmIcon.SidebarExpand size={16} />
              )}
            </button>

            <div className={app.search} data-tour="global-search">
              {isPm ? (
                <LazyPMGlobalSearch variant="default" />
              ) : (
                <LazyGlobalSearch placeholder="Search Keyword" className="!max-w-none" />
              )}
            </div>
          </div>

          <div className={app.actions}>
            <button
              type="button"
              className={cn(suite.iconChip, "lg:hidden")}
              aria-label="Search"
              title="Search"
              onClick={() => {
                const el = document.querySelector<HTMLElement>(
                  '[data-tour="global-search"] button, [data-tour="global-search"] input',
                );
                el?.click();
                el?.focus();
              }}
            >
              <CrmIcon.Search size={16} />
            </button>

            <button
              type="button"
              className={cn(suite.iconChip, "hidden sm:inline-flex")}
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={() => void toggleFullscreen()}
            >
              {isFullscreen ? (
                <CrmIcon.Minimize size={16} />
              ) : (
                <CrmIcon.Maximize size={16} />
              )}
            </button>

            <div className="hidden sm:block">
              <ThemeModeToggle className={cn(suite.iconChip, "!h-[38px] !w-[38px]")} />
            </div>

            <div className="relative hidden sm:block">
              <AppsSwitcherMenu
                isSuiteChrome
                menu={menu}
                visibleTools={visibleTools}
                activeToolId={activeToolId}
                getToolLandingPage={getToolLandingPage}
              />
            </div>

            <button
              type="button"
              className={cn(suite.iconChipPurple, "hidden sm:inline-flex")}
              aria-label="Help"
              title="Help"
            >
              <CrmIcon.Help size={18} />
            </button>

            <Link
              href={analyticsHref}
              className={cn(suite.iconChipAmber, "hidden sm:inline-flex")}
              aria-label="Analytics"
              title="Analytics"
            >
              <CrmIcon.ChartPie size={18} />
            </Link>

            <div className={app.divider} aria-hidden />

            <div
              className="relative"
              data-tour="notifications"
              onMouseEnter={() => setIsNotificationOpen(true)}
              onMouseLeave={() => setIsNotificationOpen(false)}
            >
              <button
                type="button"
                className={cn(app.iconBtn, "relative")}
                aria-label="Notifications"
              >
                <CrmIcon.Bell size={18} />
                {unreadCount > 0 ? (
                  <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--primary)] px-1 text-[9px] font-bold leading-none text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
              </button>
              {isNotificationOpen ? (
                <div className="absolute right-0 top-full z-50 mt-1">
                  <NotificationList serverUnreadCount={unreadCount} />
                </div>
              ) : null}
            </div>

            <div className="group/profile relative" data-tour="profile-menu">
              <div className={app.profileBtn} title={displayName}>
                <div className={cn(app.avatar, productLogoClass)}>
                  {initials}
                  <span className={suite.avatarOnline} aria-hidden />
                </div>
                <span className={app.profileName}>{displayName}</span>
              </div>
              <div className={suite.profileMenu}>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--primary)] hover:bg-[var(--primary-light)]"
                >
                  <CrmIcon.Logout size={16} />
                  Log out
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>
    );
  }

  /* ── Non-CRM (Jira-style) header ── */
  return (
    <header className={app.header}>
      <div className={app.inner}>
        <div className={app.left}>
          <button
            type="button"
            onClick={onMobileMenuClick}
            className={app.mobileMenuBtn}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          </button>

          <button
            type="button"
            onClick={onSidebarToggleClick}
            onMouseEnter={onSidebarToggleMouseEnter}
            onMouseLeave={onSidebarToggleMouseLeave}
            className="hidden lg:inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] border border-[#dfe1e6] bg-[#fafbfc] text-[#44546f] hover:bg-[#f4f5f7] hover:border-[#c1c7d0]"
            title={isSidebarPinned ? "Collapse sidebar" : "Pin sidebar"}
            aria-label="Toggle sidebar"
          >
            {isSidebarPinned ? (
              <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
            ) : (
              <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
            )}
          </button>

          <div className="relative">
            <AppsSwitcherMenu
              isSuiteChrome={false}
              menu={menu}
              visibleTools={visibleTools}
              activeToolId={activeToolId}
              getToolLandingPage={getToolLandingPage}
            />
          </div>

          <Link
            href="/"
            className="hidden lg:flex shrink-0 items-center gap-2 px-1 outline-none hover:opacity-90 rounded-[3px] focus-visible:ring-2 focus-visible:ring-[#0c66e4]/30"
            aria-label="2Bigha home"
          >
            <div className="relative h-8 w-8 shrink-0 overflow-hidden bg-white shadow-sm rounded-[3px] border border-[#dfe1e6]">
              <Image
                src={MATHIONIX_MARK_PNG}
                alt="2Bigha"
                fill
                priority
                className="object-contain p-0.5"
                sizes="32px"
              />
            </div>
            <div className="hidden xl:flex flex-col leading-none">
              <span className="text-[11px] font-bold tracking-tight text-[#172b4d]">
                2Bigha
              </span>
              <span className="text-[9px] font-medium tracking-widest uppercase text-[#5e6c84]">
                Technologies
              </span>
            </div>
          </Link>

          <div className="hidden lg:block h-5 w-px mx-0.5 bg-[#dfe1e6]" aria-hidden />

          <Link href={productHref} className={app.productLink}>
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center text-white ml-1 rounded-[3px]",
                productLogoClass,
              )}
              aria-hidden
            >
              <ProductIcon className="h-4 w-4" strokeWidth={2.25} />
            </div>
            <span className={app.productName}>{productName}</span>
          </Link>
        </div>

        <div className={app.search} data-tour="global-search">
          <LazyGlobalSearch />
        </div>

        <div className={app.actions}>
          <div
            className="relative"
            data-tour="notifications"
            onMouseEnter={() => setIsNotificationOpen(true)}
            onMouseLeave={() => setIsNotificationOpen(false)}
          >
            <button
              type="button"
              className={cn(app.iconBtn, "relative")}
              aria-label="Notifications"
            >
              <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
              {unreadCount > 0 ? (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#de350b] px-1 text-[9px] font-bold leading-none text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </button>
            {isNotificationOpen ? (
              <div className="absolute right-0 top-full z-50 mt-1">
                <NotificationList serverUnreadCount={unreadCount} />
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className={cn(app.iconBtn, "hidden sm:inline-flex")}
            aria-label="Help"
            title="Help"
          >
            <HelpCircle className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </button>

          <div className="pm-jira-header-theme">
            <ThemeModeToggle className="pm-jira-header-icon !h-8 !w-8 !rounded-[3px]" />
          </div>

          <div className={app.divider} aria-hidden />

          <div className="group/profile relative" data-tour="profile-menu">
            <div className={app.profileBtn}>
              <div className={cn(app.avatar, productLogoClass)}>{initials}</div>
              <span className={app.profileName}>{displayName}</span>
            </div>
            <div className="invisible absolute right-0 top-full z-50 mt-1 w-44 rounded-[3px] border border-[#dfe1e6] bg-white py-1 opacity-0 shadow-[0_4px_8px_rgba(9,30,66,0.15)] transition-all group-hover/profile:visible group-hover/profile:opacity-100">
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#de350b] hover:bg-[#ffebe6]"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.75} />
                Log out
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
