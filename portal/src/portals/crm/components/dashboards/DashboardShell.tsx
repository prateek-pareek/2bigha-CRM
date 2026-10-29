"use client";

import React from "react";
import { CrmPageHeader } from "@/components/crm/ui";
import CRMDateRangePicker from "@/components/crm/CRMDateRangePicker";

export type DateRangeFilter = "today" | "yesterday" | "this_week" | "this_month" | "last_30_days" | "this_quarter" | "this_year" | "all_time" | (string & {});

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
              <CRMDateRangePicker
                value={dateRange}
                onWindowChange={(windowKey) => setDateRange(windowKey)}
              />
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
