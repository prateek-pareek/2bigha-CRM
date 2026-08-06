import { redirect } from "next/navigation";

/** Legacy workspace revenue view — canonical page is Reports → Forecast. */
export default function WorkspaceRevenueRedirect() {
  redirect("/crm/reports/forecast");
}
