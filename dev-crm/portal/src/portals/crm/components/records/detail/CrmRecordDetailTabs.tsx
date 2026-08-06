"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { crmRecordChrome } from "@/lib/crm/chrome";

export type CrmRecordDetailTabId = "Activity" | "Details";

type TabDef = {
  id: CrmRecordDetailTabId;
  label: string;
  icon: LucideIcon;
};

type Props = {
  tabs: TabDef[];
  activeTab: CrmRecordDetailTabId;
  onTabChange: (tab: CrmRecordDetailTabId) => void;
  detailsToolbar?: React.ReactNode;
};

/** CRMS-style underline tabs on record detail (matches deals record chrome). */
export default function CrmRecordDetailTabs({
  tabs,
  activeTab,
  onTabChange,
  detailsToolbar,
}: Props) {
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
