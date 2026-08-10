"use client";

import { CrmTeamManagement } from "@/components/crm/platform/CrmTeamManagement";
import { CrmPageHeader } from "@/components/crm/ui";

export default function CrmUsersSettingsPage() {
  return (
    <div className="space-y-5 p-5">
      <CrmPageHeader
        title="Users & access"
        description="Invite CRM teammates and assign CRM permissions. This is CRM-only RBAC — not HRMS."
      />
      <CrmTeamManagement variant="settings" />
    </div>
  );
}
