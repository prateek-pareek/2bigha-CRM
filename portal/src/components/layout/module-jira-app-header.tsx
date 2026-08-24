"use client";

import { useState, useMemo, type ComponentType } from "react";
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
} from "lucide-react";
import { ThemeModeToggle } from "@/components/ThemeModeToggle";
import NotificationList from "@/components/hrms/NotificationList";
import { jiraAppChrome } from "@/lib/pm/jira-ui";
import { cn } from "@/lib/pm/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { tools } from "@/components/Sidebar";
import { jiraSidebarChrome } from "@/lib/pm/jira-ui";
import { MATHIONIX_MARK_PNG } from "@/lib/brand-assets";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LazyGlobalSearch = dynamic(() => import("@/components/LazyGlobalSearch"), {
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
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
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
      if (isAdmin) return true;
      return (
        Array.isArray(permittedTools) &&
        permittedTools.some((p) => p?.toUpperCase() === "CRM")
      );
    });
  }, [isAdmin, permittedTools]);

  const activeToolId = useMemo(() => {
    return "crm";
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

  return (
    <header className={jiraAppChrome.header}>
      <div className={jiraAppChrome.inner}>
        <div className={jiraAppChrome.left}>
          {/* Mobile Menu Toggle */}
          <button
            type="button"
            onClick={onMobileMenuClick}
            className={jiraAppChrome.mobileMenuBtn}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          </button>

          {/* 1. Sidebar Toggle */}
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

          {/* 2. Nine-dots App Switcher */}
          <div className="relative">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-8 w-8 shrink-0 flex items-center justify-center rounded-[3px] text-[#44546f] hover:bg-[#f4f5f7]"
                  title="Switch apps"
                  aria-label="Switch apps"
                >
                  <LayoutGrid className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="bottom"
                align="start"
                sideOffset={6}
                className={jiraSidebarChrome.workspaceMenu}
              >
                <DropdownMenuLabel className={jiraSidebarChrome.workspaceMenuLabel}>
                  Apps
                </DropdownMenuLabel>
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
                          jiraSidebarChrome.workspaceMenuItem,
                          isActive && jiraSidebarChrome.workspaceMenuItemActive,
                        )}
                      >
                        <span
                          className={cn(
                            jiraSidebarChrome.workspaceMenuIcon,
                            isActive
                              ? cn(jiraSidebarChrome.workspaceMenuIconActive, tool.logoClass)
                              : tool.logoClassIdle,
                          )}
                        >
                          <Icon size={14} strokeWidth={isActive ? 2.25 : 1.75} />
                        </span>
                        <span className="min-w-0 flex-1 text-left leading-tight">
                          <span
                            className={cn(
                              "flex items-center gap-1.5",
                              isActive
                                ? jiraSidebarChrome.workspaceMenuTitleActive
                                : jiraSidebarChrome.workspaceMenuTitle,
                            )}
                          >
                            {tool.name}
                            {isActive && (
                              <Check
                                className="h-3.5 w-3.5 shrink-0 text-[#0c66e4]"
                                strokeWidth={2.5}
                              />
                            )}
                          </span>
                          <span className={jiraSidebarChrome.workspaceMenuTagline}>
                            {tool.tagline}
                          </span>
                        </span>
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* 3. 2Bigha brand mark */}
          <Link
            href="/"
            className="hidden lg:flex shrink-0 items-center gap-2 rounded-[3px] px-1 outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[#0c66e4]/30"
            aria-label="2Bigha home"
          >
            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-[3px] border border-[#dfe1e6] bg-white shadow-sm">
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
              <span className="text-[11px] font-bold text-[#172b4d] tracking-tight">
                2Bigha
              </span>
              <span className="text-[9px] font-medium text-[#5e6c84] tracking-widest uppercase">
                Technologies
              </span>
            </div>
          </Link>

          {/* Divider */}
          <div className="hidden lg:block h-5 w-px bg-[#dfe1e6] mx-0.5" aria-hidden />

          {/* 4. Product logo + name — always visible */}
          <Link href={productHref} className={jiraAppChrome.productLink}>
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] text-white ml-1",
                productLogoClass,
              )}
              aria-hidden
            >
              <ProductIcon className="h-4 w-4" strokeWidth={2.25} />
            </div>
            <span className={jiraAppChrome.productName}>{productName}</span>
          </Link>
        </div>

        <div className={jiraAppChrome.search} data-tour="global-search">
          <LazyGlobalSearch />
        </div>

        <div className={jiraAppChrome.actions}>
          <div
            className="relative"
            data-tour="notifications"
            onMouseEnter={() => setIsNotificationOpen(true)}
            onMouseLeave={() => setIsNotificationOpen(false)}
          >
            <button
              type="button"
              className={cn(jiraAppChrome.iconBtn, "relative")}
              aria-label="Notifications"
            >
              <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
              {unreadCount > 0 ? (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#de350b] px-1 text-[9px] font-bold leading-none text-white">
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
            className={cn(jiraAppChrome.iconBtn, "hidden sm:inline-flex")}
            aria-label="Help"
            title="Help"
          >
            <HelpCircle className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </button>

          <div className="pm-jira-header-theme">
            <ThemeModeToggle className="pm-jira-header-icon !h-8 !w-8 !rounded-[3px]" />
          </div>

          <div className={jiraAppChrome.divider} aria-hidden />

          <div className="group/profile relative" data-tour="profile-menu">
            <div className={jiraAppChrome.profileBtn}>
              <div className={cn(jiraAppChrome.avatar, productLogoClass)}>{initials}</div>
              <span className={jiraAppChrome.profileName}>{displayName}</span>
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
