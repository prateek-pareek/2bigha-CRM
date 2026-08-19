"use client";

import { Globe } from "lucide-react";
import { CRM_LIST_PAGE } from "@/lib/crm/ui";
import { CrmPageHeader } from "@/components/crm/ui";
import WebsiteLeadsPanel from "@/components/crm/records/list/WebsiteLeadsPanel";

export default function WebsiteLeadsPage() {
  return (
    <div className={CRM_LIST_PAGE}>
      <CrmPageHeader
        bordered={false}
        title="Website leads"
        description="Contact form submissions from your marketing sites"
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Website leads" },
        ]}
        icon={<Globe className="h-4 w-4" />}
      />
      <WebsiteLeadsPanel />
    </div>
  );
}
