"use client";

import { CrmRolesSettings } from "@/components/crm/platform/CrmRolesSettings";
import { CrmPageHeader } from "@/components/crm/ui";

export default function CrmRolesSettingsPage() {
  return (
    <div className="space-y-5 p-5">
      <CrmPageHeader
        title="Roles & permissions"
        description="Create CRM roles and map module permissions (view / create / edit / delete)."
      />
      <CrmRolesSettings />
    </div>
  );
}
