import React from "react";
import { CrmPageHeader } from "@/components/crm/ui";
import { CreditCard } from "lucide-react";
import SubscriptionPlansView from "@/portals/crm/components/subscriptions/SubscriptionPlansView";

export default function SubscriptionsPage() {
  return (
    <div className="theme-crm-hubspot mx-auto w-full max-w-6xl animate-in fade-in duration-500 pb-10">
      <CrmPageHeader
        icon={<CreditCard size={18} />}
        title="Subscription Plans"
        description="Manage your platform subscription and access premium CRM features."
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Settings", href: "/crm/settings" },
          { label: "Subscription Plans" },
        ]}
        className="mb-6"
      />

      <div className="mt-4">
        <SubscriptionPlansView />
      </div>
    </div>
  );
}
