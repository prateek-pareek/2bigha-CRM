"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, LayoutDashboard, SlidersHorizontal } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { canAccessCrmSetting, CRM_SETTINGS_ITEMS } from "@/lib/crm/settings/settings-access";
import {
  CRM_SETTINGS_SECTIONS,
  type CrmSettingsNavItem,
  type CrmSettingsNavSection,
} from "@/lib/crm/settings/settings-nav";
import {
  CrmKpiCard,
  CrmPageHeader,
  CrmSearchInput,
  CrmSectionCard,
} from "@/components/crm/ui";
import { CRM_PANEL_RAISED } from "@/lib/crm/ui";
import { cn } from "@/lib/utils";

function canSeeSetting(
  href: string,
  opts: {
    isAdmin: boolean;
    hasAccess: (permission: string) => boolean;
    canViewCrmRevenue: boolean;
  },
): boolean {
  const config = CRM_SETTINGS_ITEMS.find((item) => item.href === href);
  if (config?.superAdminOnly && !opts.canViewCrmRevenue) return false;
  if (opts.isAdmin) return true;
  if (!config) return true;
  return canAccessCrmSetting(opts.hasAccess, config.requiredPermission, {
    canViewCrmRevenue: opts.canViewCrmRevenue,
    superAdminOnly: config.superAdminOnly,
  });
}

/** Dashboard-style raised tile (same language as KPI / workspace cards) */
function SettingTile({ item }: { item: CrmSettingsNavItem }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        CRM_PANEL_RAISED,
        "group flex h-full flex-col gap-3 p-4 transition-colors hover:border-[var(--primary)]/25",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[5px] bg-[var(--primary-light)] text-[var(--primary)]">
          <Icon size={18} strokeWidth={1.75} />
        </span>
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[var(--primary)] opacity-0 transition-opacity group-hover:opacity-100">
          Open <ChevronRight size={14} />
        </span>
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-[var(--text-main)] group-hover:text-[var(--primary)]">
          {item.name}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)] line-clamp-2">
          {item.description}
        </p>
      </div>
    </Link>
  );
}

function SectionBlock({ section }: { section: CrmSettingsNavSection }) {
  const Icon = section.icon;
  return (
    <CrmSectionCard
      title={section.label}
      actions={
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
          <Icon size={13} className="text-[var(--primary)]" />
          {section.items.length} items
        </span>
      }
      bodyClassName="pt-3"
    >
      <p className="-mt-1 mb-3 text-xs text-[var(--text-muted)]">{section.description}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {section.items.map((item) => (
          <SettingTile key={item.href} item={item} />
        ))}
      </div>
    </CrmSectionCard>
  );
}

export default function SettingsPage() {
  const { isAdmin, hasAccess, canViewCrmRevenue } = usePermissions();
  const [query, setQuery] = useState("");
  const [focusSection, setFocusSection] = useState<string>("all");

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CRM_SETTINGS_SECTIONS.map((section) => {
      const items = section.items.filter((item) => {
        if (
          !canSeeSetting(item.href, {
            isAdmin,
            hasAccess,
            canViewCrmRevenue,
          })
        ) {
          return false;
        }
        if (!q) return true;
        return (
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          section.label.toLowerCase().includes(q)
        );
      });
      return { ...section, items };
    }).filter((section) => section.items.length > 0);
  }, [canViewCrmRevenue, hasAccess, isAdmin, query]);

  const visibleSections =
    focusSection === "all"
      ? sections
      : sections.filter((s) => s.id === focusSection);

  const totalCount = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="space-y-4">
      <CrmPageHeader
        bordered={false}
        title="Settings"
        description="Configure email, sales pipelines, automation, and admin tools."
        icon={<SlidersHorizontal className="h-5 w-5" />}
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Settings" },
        ]}
        actions={
          <CrmSearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings…"
            aria-label="Search settings"
            wrapperClassName="w-full max-w-none flex-none sm:w-[260px]"
            className="h-[38px]"
          />
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CrmKpiCard
          label="All settings"
          value={totalCount}
          sub="Across CRM"
          icon={<LayoutDashboard className="h-5 w-5" />}
          onClick={() => setFocusSection("all")}
          className={cn(
            focusSection === "all" && "border-[var(--primary)]/35 ring-1 ring-[var(--primary)]/20",
          )}
        />
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <CrmKpiCard
              key={section.id}
              label={section.label}
              value={section.items.length}
              sub={section.description}
              icon={<Icon className="h-5 w-5" />}
              onClick={() =>
                setFocusSection((prev) => (prev === section.id ? "all" : section.id))
              }
              className={cn(
                focusSection === section.id &&
                  "border-[var(--primary)]/35 ring-1 ring-[var(--primary)]/20",
              )}
            />
          );
        })}
      </div>

      {visibleSections.length === 0 ? (
        <CrmSectionCard title="No matches" accent={false} bodyClassName="py-10 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            No settings match “{query.trim()}”. Try another keyword.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setFocusSection("all");
            }}
            className="mt-3 text-sm font-semibold text-[var(--primary)] hover:underline"
          >
            Clear filters
          </button>
        </CrmSectionCard>
      ) : (
        <div className="space-y-4">
          {visibleSections.map((section) => (
            <SectionBlock key={section.id} section={section} />
          ))}
        </div>
      )}
    </div>
  );
}
