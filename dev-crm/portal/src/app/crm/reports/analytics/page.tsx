import { redirect } from "next/navigation";

/** Legacy — merged into Forecast & Deals. */
export default function Page() {
  redirect("/crm/reports/forecast");
}
