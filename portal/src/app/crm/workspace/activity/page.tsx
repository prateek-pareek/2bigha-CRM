import { redirect } from "next/navigation";

export default function Page() {
  redirect("/crm/settings/audit-logs?tab=activity");
}
