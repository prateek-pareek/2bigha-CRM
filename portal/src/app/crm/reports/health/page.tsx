import { redirect } from "next/navigation";

/** Legacy — merged into Pipeline Insights → Sales Health. */
export default function Page() {
  redirect("/crm/reports/forecast/health");
}
