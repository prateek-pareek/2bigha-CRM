"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, X, Check } from "lucide-react";
import { toast } from "sonner";
import crmApi from "@/lib/crm/api";
import { invalidateCrmForEntityType } from "@/lib/crm/shared/invalidate-on-mutation";
import { CrmButton } from "@/components/crm/ui";

type Reason = "name" | "email" | "phone";

interface DuplicateGroup {
  group: number;
  reasons: Reason[];
  nameOnly: boolean;
  masterId: string;
  members: {
    _id: string;
    name: string;
    email: string;
    phone: string;
    createdAt: string | null;
    hasTwobighaUser: boolean;
  }[];
}

const REASON_LABELS: Record<Reason, string> = {
  email: "Same email",
  phone: "Same phone",
  name: "Same name",
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onMerged: () => void;
}

/** Bulk duplicate manager: review every cluster, pick the record to keep, merge many at once. */
export default function ClientDuplicatesModal({ isOpen, onClose, onMerged }: Props) {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [masters, setMasters] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await crmApi.get("/crm/clients/duplicates/groups");
      const list: DuplicateGroup[] = Array.isArray(data?.groups) ? data.groups : [];
      setGroups(list);
      setMasters(Object.fromEntries(list.map((g) => [g.group, g.masterId])));
      // Name-only clusters may be different people — never pre-selected.
      setSelected(new Set(list.filter((g) => !g.nameOnly).map((g) => g.group)));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to load duplicates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);

  const toggle = (g: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  const selectedGroups = useMemo(() => groups.filter((g) => selected.has(g.group)), [groups, selected]);
  const recordsToRemove = selectedGroups.reduce((n, g) => n + g.members.length - 1, 0);

  const merge = async () => {
    if (!selectedGroups.length) return;
    if (
      !window.confirm(
        `Merge ${selectedGroups.length} duplicate group(s)? ${recordsToRemove} record(s) will be moved to trash; their activities, emails and links are kept on the record you keep.`,
      )
    )
      return;
    setMerging(true);
    try {
      const { data } = await crmApi.post("/crm/clients/duplicates/merge-bulk", {
        groups: selectedGroups.map((g) => ({
          masterId: masters[g.group] || g.masterId,
          duplicateIds: g.members.map((m) => m._id).filter((id) => id !== (masters[g.group] || g.masterId)),
        })),
      });
      invalidateCrmForEntityType("client");
      const failed = (data?.results || []).filter((r: any) => r.error).length;
      if (failed) toast.warning(`Merged ${data.groupsMerged} group(s); ${failed} failed.`);
      else toast.success(`Merged ${data.recordsMerged} duplicate record(s) into ${data.groupsMerged} client(s).`);
      onMerged();
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to merge duplicates.");
    } finally {
      setMerging(false);
    }
  };

  if (!isOpen) return null;

  const allSelected = groups.length > 0 && selected.size === groups.length;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Manage duplicate clients"
        className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-[var(--crm-radius-ui)] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-[var(--border-color)] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[#1f2020]">Manage duplicate clients</h2>
            <p className="mt-0.5 text-xs text-[#707070]">
              In each group, pick the record to keep. The others are merged into it and moved to trash.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[#707070] hover:text-[#1f2020]">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() =>
                setSelected(allSelected ? new Set() : new Set(groups.map((g) => g.group)))
              }
            />
            Select all ({groups.length} groups)
          </label>
          <span className="text-xs text-[#707070]">
            Groups that only share a name are unchecked by default — review them before merging.
          </span>
        </div>

        <div className="min-h-[160px] flex-1 space-y-3 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex justify-center py-12 text-[#707070]">
              <Loader2 className="animate-spin" size={20} />
            </div>
          ) : groups.length === 0 ? (
            <p className="py-12 text-center text-sm text-[#707070]">No duplicate clients found.</p>
          ) : (
            groups.map((g) => {
              const master = masters[g.group] || g.masterId;
              return (
                <div
                  key={g.group}
                  className={`rounded-[var(--crm-radius-ui)] border p-3 ${
                    selected.has(g.group) ? "border-[var(--primary)]" : "border-[var(--border-color)]"
                  }`}
                >
                  <label className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#1f2020]">
                    <input type="checkbox" checked={selected.has(g.group)} onChange={() => toggle(g.group)} />
                    Group {g.group} · {g.members.length} records
                    <span className="font-normal text-[#707070]">
                      ({g.reasons.map((r) => REASON_LABELS[r]).join(", ")})
                    </span>
                    {g.nameOnly && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">
                        Name only — may be different people
                      </span>
                    )}
                  </label>
                  <div className="space-y-1">
                    {g.members.map((m) => (
                      <label
                        key={m._id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[#f7f8f9]"
                      >
                        <input
                          type="radio"
                          name={`master-${g.group}`}
                          checked={master === m._id}
                          onChange={() => setMasters((prev) => ({ ...prev, [g.group]: m._id }))}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium text-[#1f2020]">
                          {m.name || "Unnamed"}
                        </span>
                        <span className="w-48 truncate text-xs text-[#707070]">{m.email || "—"}</span>
                        <span className="w-28 truncate text-xs text-[#707070]">{m.phone || "—"}</span>
                        <span className="w-20 text-xs text-[#707070]">
                          {m.createdAt ? new Date(m.createdAt).toLocaleDateString() : "—"}
                        </span>
                        {master === m._id && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--success)]">
                            <Check size={12} /> Keep
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border-color)] px-5 py-3">
          <span className="text-xs text-[#707070]">
            {selectedGroups.length} group(s) selected · {recordsToRemove} record(s) will be merged away
          </span>
          <div className="flex gap-2">
            <CrmButton variant="secondary" onClick={onClose}>
              Close
            </CrmButton>
            <CrmButton variant="primary" onClick={() => void merge()} disabled={merging || !selectedGroups.length}>
              {merging ? "Merging…" : `Merge ${selectedGroups.length} group(s)`}
            </CrmButton>
          </div>
        </div>
      </div>
    </div>
  );
}
