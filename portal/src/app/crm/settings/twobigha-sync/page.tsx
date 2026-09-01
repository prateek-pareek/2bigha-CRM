"use client";

import { CrmPageHeader } from "@/components/crm/ui";
import TwoBighaSyncHub from "@/components/crm/platform/TwoBighaSyncHub";

export default function TwoBighaSyncSettingsPage() {
  return (
    <div className="space-y-5 p-5">
      <CrmPageHeader
        title="2bigha platform sync"
        description="Monitor and reconcile CRM clients (platform users) and agents (admins) with the 2bigha platform. Sync is env-configured — not part of the integrations marketplace."
      />
      <TwoBighaSyncHub />
    </div>
  );
}
