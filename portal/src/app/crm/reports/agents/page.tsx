import { redirect } from "next/navigation";

/** Legacy — removed from Reports; use Sales AI for agent activity. */
export default function Page() {
  redirect("/crm/agents/activity");
}
