"use client";

import { CrmLabel, CrmSelect } from "@/components/crm/ui";
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

  return (
    <div className="min-w-[220px] flex-1">
      <CrmLabel>{label}</CrmLabel>
      <CrmSelect
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(parseStaffOption(raw, pool), raw);
        }}
        className="mt-1"
      >
        <option value="">Select…</option>
        {twobigha.length > 0 ? (
          <optgroup label="2bigha staff (live roster)">
            {twobigha.map((p) => (
              <option key={staffOptionValue(p)} value={staffOptionValue(p)}>
                {personLabel(p)}
              </option>
            ))}
          </optgroup>
        ) : null}
        {crm.length > 0 ? (
          <optgroup label="CRM team (added in CRM)">
            {crm.map((p) => (
              <option key={staffOptionValue(p)} value={staffOptionValue(p)}>
                {personLabel(p)}
              </option>
            ))}
          </optgroup>
        ) : null}
      </CrmSelect>
      {empty ? (
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
          {emptyHint || "No people in this list yet. Sync agents in Settings → 2bigha Sync."}
        </p>
      ) : null}
    </div>
  );
}
