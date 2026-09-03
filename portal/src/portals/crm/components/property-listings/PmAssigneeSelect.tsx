"use client";

import { useMemo } from "react";
import { CrmLabel } from "@/components/crm/ui";
import { CrmPersonSearchSelect } from "@/components/crm/ui/CrmPersonSearchSelect";
import {
  parseStaffOption,
  staffOptionValue,
  type PmAssignPick,
  type PmStaffPerson,
} from "@/lib/crm/property-management/assignment-api";

export function personLabel(person: PmStaffPerson) {
  const bits = [person.name];
  if (person.email) bits.push(person.email);
  if (person.source === "crm" && !person.synced) bits.push("CRM only");
  if (person.source === "twobigha" && person.crmUserId) bits.push("linked CRM");
  return bits.join(" · ");
}

type Pool = { twobigha: PmStaffPerson[]; crm: PmStaffPerson[] };

export default function PmAssigneeSelect({
  label,
  pool,
  value,
  onChange,
  emptyHint,
}: {
  label: string;
  pool: Pool;
  value: string;
  onChange: (pick: PmAssignPick | null, raw: string) => void;
  emptyHint?: string;
}) {
  const twobigha = pool.twobigha || [];
  const crm = pool.crm || [];
  const empty = twobigha.length === 0 && crm.length === 0;

  const options = useMemo(
    () => [
      ...twobigha.map((p) => ({
        value: staffOptionValue(p),
        label: personLabel(p),
        keywords: [p.email, p.name].filter(Boolean).join(" "),
        group: "2bigha staff (live roster)",
      })),
      ...crm.map((p) => ({
        value: staffOptionValue(p),
        label: personLabel(p),
        keywords: [p.email, p.name].filter(Boolean).join(" "),
        group: "CRM team (added in CRM)",
      })),
    ],
    [twobigha, crm],
  );

  return (
    <div className="min-w-[220px] flex-1">
      <CrmLabel>{label}</CrmLabel>
      <CrmPersonSearchSelect
        className="mt-1"
        value={value}
        onChange={(raw) => onChange(parseStaffOption(raw, pool), raw)}
        options={options}
        emptyLabel="Select…"
        placeholder="Type a name to search…"
      />
      {empty ? (
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
          {emptyHint || "No people in this list yet. Sync agents in Settings → 2bigha Sync."}
        </p>
      ) : null}
    </div>
  );
}
