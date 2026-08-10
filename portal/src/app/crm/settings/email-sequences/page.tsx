import { redirect } from "next/navigation";

/** Legacy URL redirects to Workflows. */
export default function EmailSequencesLegacyRedirect() {
  redirect("/crm/settings/workflows");
}
