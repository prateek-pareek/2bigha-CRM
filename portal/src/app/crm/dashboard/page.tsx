import { redirect } from "next/navigation";

/** Legacy URL — CRM Work dashboard lives at `/crm/workspace/work`. */
export default function CrmDashboardRedirect() {
  redirect("/crm/workspace/work");
}
