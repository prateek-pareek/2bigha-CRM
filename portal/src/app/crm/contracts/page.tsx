"use client";

import { CrmDocumentsWorkspace } from "../proposals/CrmDocumentsWorkspace";

/** Dedicated Contracts workspace (Dreams-style sibling of Proposals) with its own pipelines. */
export default function ContractsPage() {
  return <CrmDocumentsWorkspace mode="contracts" />;
}
