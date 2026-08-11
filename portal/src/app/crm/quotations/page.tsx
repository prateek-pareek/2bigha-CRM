"use client";

import { CrmDocumentsWorkspace } from "../proposals/CrmDocumentsWorkspace";

/** Dedicated Quotations workspace (sibling of Proposals and Contracts) with its own pipeline. */
export default function QuotationsPage() {
  return <CrmDocumentsWorkspace mode="quotations" />;
}
