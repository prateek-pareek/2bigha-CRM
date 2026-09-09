"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CrmTeamManagement } from "@/components/crm/platform/CrmTeamManagement";
import {
  HrmsCrmSyncPanel,
  type PeopleSyncTab,
} from "@/components/crm/platform/HrmsCrmSyncPanel";
import { CrmPageHeader } from "@/components/crm/ui";

function tabFromQuery(tab: string | null): PeopleSyncTab {
  if (tab === "hrms-unavailable" || tab === "unavailable") return "unavailable";
  if (tab === "twobigha-sync" || tab === "twobigha") return "twobigha";
  return "pending";
}

function queryFromTab(tab: PeopleSyncTab): string | null {
  if (tab === "unavailable") return "hrms-unavailable";
  if (tab === "twobigha") return "twobigha-sync";
  return null;
}

export default function CrmUsersSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const peopleTab = useMemo(() => tabFromQuery(tab), [tab]);

  const onTabChange = useCallback(
    (next: PeopleSyncTab) => {
      const params = new URLSearchParams(searchParams.toString());
      const q = queryFromTab(next);
      if (q) params.set("tab", q);
      else params.delete("tab");
      const qs = params.toString();
      router.replace(qs ? `/crm/settings/users?${qs}` : "/crm/settings/users", {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  return (
    <div className="space-y-5 p-5">
      <CrmPageHeader
        title="Users & access"
        description="CRM teammates, HRMS-synced staff, and 2bigha agents — manage people and sync status in one place."
      />
      <HrmsCrmSyncPanel initialTab={peopleTab} onTabChange={onTabChange} />
      <CrmTeamManagement variant="settings" />
    </div>
  );
}
