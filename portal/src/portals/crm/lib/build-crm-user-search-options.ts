"use client";

import type { CrmPortalUserOption } from "@/components/crm/inbox/ActivityLogger";
import {
  formatCrmUserLabel,
  taskAssigneeOptionValue,
} from "@/components/crm/inbox/ActivityLogger";
import type { CrmPersonSearchOption } from "@/components/crm/ui/CrmPersonSearchSelect";

export function buildCrmUserSearchOptions(
  users: CrmPortalUserOption[],
  opts?: {
    taskAssigneeValues?: boolean;
    twobighaGroupLabel?: string;
    crmGroupLabel?: string;
  },
): CrmPersonSearchOption[] {
  const useTaskValues = opts?.taskAssigneeValues !== false;
  const tbLabel = opts?.twobighaGroupLabel || "2bigha staff, employees & agents";
  const crmLabel = opts?.crmGroupLabel || "CRM team";

  const seen = new Set<string>();
  const out: CrmPersonSearchOption[] = [];
  for (const u of users) {
    const label = formatCrmUserLabel(u);
    const value = useTaskValues ? taskAssigneeOptionValue(u) : String(u._id);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push({
      value,
      label,
      keywords: [u.email, u.roleLabel, u.twobighaAdminId, u.firstName, u.lastName]
        .filter(Boolean)
        .join(" "),
      group: u.source === "twobigha" ? tbLabel : crmLabel,
    });
  }
  return out;
}
