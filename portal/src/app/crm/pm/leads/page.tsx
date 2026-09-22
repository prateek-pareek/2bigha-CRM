"use client";

import CrmLeadsView from '@/portals/crm/components/CrmLeadsView';

export default function PmLeadsPage() {
  return (
    <CrmLeadsView
      fixedVertical="property_management"
      pageTitle="Property Management Leads"
    />
  );
}
