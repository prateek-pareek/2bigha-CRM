import { redirect } from "next/navigation";

/** Legacy — merged into Forecast & Deals → Sales Health. */
export default function Page() {
  redirect("/crm/reports/forecast/health");
}
