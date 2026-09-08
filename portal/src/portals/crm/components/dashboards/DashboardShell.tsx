"use client";

import React from "react";
import { CrmPageHeader } from "@/components/crm/ui";
import { Dropdown } from "@/app/crm/workspace/_components/workspace-ui";
import { CrmIcon } from "@/lib/crm/shared/icons";

export type DateRangeFilter = "today" | "yesterday" | "this_week" | "this_month" | "last_30_days" | "this_quarter" | "this_year";

interface DashboardShellProps {
  title: string;
  description: string;
  dateRange?: DateRangeFilter;
  setDateRange?: (val: DateRangeFilter) => void;
  children: React.ReactNode;
  extraFilters?: React.ReactNode;
}

export function DashboardShell({
  title,
  description,
  dateRange,
  setDateRange,
  children,
  extraFilters,
}: DashboardShellProps) {
  return (
    <div className="crm-workspace-container mx-auto w-full animate-in fade-in duration-500 pb-6">
      <CrmPageHeader
        bordered={false}
        title={title}
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/work" },
          { label: "Dashboard", href: "#" },
          { label: title },
        ]}
        description={description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {extraFilters}
            {dateRange && setDateRange && (
              <div className="inline-flex h-[38px] items-center gap-2 rounded-[5px] border border-[var(--border-color)] bg-white px-2.5 shadow-[var(--crm-shadow-input)] dark:bg-black dark:border-white/10">
                <CrmIcon.Calendar size={16} className="text-[var(--text-muted)]" aria-hidden />
                <Dropdown
                  value={dateRange}
                  onChange={(v: any) => setDateRange(v as DateRangeFilter)}
                  widthClass="min-w-[140px] border-0 shadow-none bg-transparent h-[34px]"
                  showCustomDateRange
                  options={[
                    { value: "today", label: "Today" },
                    { value: "yesterday", label: "Yesterday" },
                    { value: "this_week", label: "This week" },
                    { value: "this_month", label: "This month" },
                    { value: "last_30_days", label: "Last 30 days" },
                    { value: "this_quarter", label: "This quarter" },
                    { value: "this_year", label: "This year" },
                  ]}
                />
              </div>
            )}
          </div>
        }
      />
      <div className="w-full">
        <div className="px-3 sm:px-6 py-4 sm:py-6 bg-[var(--background)]">
          {children}
        </div>
      </div>
    </div>
  );
}
