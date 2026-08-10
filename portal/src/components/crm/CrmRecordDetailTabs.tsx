"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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

export default function CrmRecordDetailTabs({
  tabs,
  activeTab,
  onTabChange,
  detailsToolbar,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3 sm:px-5">
      <div
        className="inline-flex rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--surface-dim)] p-0.5"
        role="tablist"
        aria-label="Record sections"
      >
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
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[calc(var(--crm-radius-ui)-2px)] px-3 py-1.5 text-xs font-semibold transition-colors",
                isActive
                  ? "bg-[var(--card-bg)] text-[var(--text-main)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)]",
              )}
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
