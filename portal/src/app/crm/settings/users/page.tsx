"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { CrmTeamManagement } from "@/components/crm/platform/CrmTeamManagement";
import { HrmsCrmSyncPanel } from "@/components/crm/platform/HrmsCrmSyncPanel";
import { CrmPageHeader } from "@/components/crm/ui";

export default function CrmUsersSettingsPage() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const hrmsTab = useMemo(() => {
    if (tab === "hrms-unavailable") return "unavailable" as const;
    return "pending" as const;
  }, [tab]);

  return (
    <div className="space-y-5 p-5">
      <CrmPageHeader
        title="Users & access"
        description="Invite CRM teammates and assign CRM permissions. HRMS-synced employees appear below until a CRM Admin grants a role."
      />
      <HrmsCrmSyncPanel initialTab={hrmsTab} />
      <CrmTeamManagement variant="settings" />
    </div>
  );
}
