import { redirect } from "next/navigation";

/** Legacy — removed from Reports; use Automation / Sales AI for ops. */
export default function Page() {
  redirect("/crm/reports/overview");
}
