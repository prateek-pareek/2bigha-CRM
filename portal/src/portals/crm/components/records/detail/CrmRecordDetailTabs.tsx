"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { crmRecordChrome } from "@/lib/crm/chrome";

/** Default tab set most record detail pages use; pass a wider literal union (e.g. add "History") via the generic when a page needs more tabs. */
export type CrmRecordDetailTabId = "Activity" | "Details";

type TabDef<TTabId extends string> = {
  id: TTabId;
  label: string;
  icon: LucideIcon;
};

type Props<TTabId extends string> = {
  tabs: TabDef<TTabId>[];
  activeTab: TTabId;
  onTabChange: (tab: TTabId) => void;
  detailsToolbar?: React.ReactNode;
};

/** CRMS-style underline tabs on record detail. */
export default function CrmRecordDetailTabs<TTabId extends string = CrmRecordDetailTabId>({
  tabs,
  activeTab,
  onTabChange,
  detailsToolbar,
}: Props<TTabId>) {
  return (
    <div className={crmRecordChrome.tabBar}>
      <div className={crmRecordChrome.tabs} role="tablist" aria-label="Record sections">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab.id)}
              className={cn(crmRecordChrome.tab, isActive && crmRecordChrome.tabActive)}
            >
              <Icon size={14} strokeWidth={isActive ? 2.25 : 2} />
              {tab.label}
            </button>
          );
        })}
      </div>
      {activeTab === "Details" && detailsToolbar ? (
        <div className="flex items-center gap-1">{detailsToolbar}</div>
      ) : null}
    </div>
  );
}
