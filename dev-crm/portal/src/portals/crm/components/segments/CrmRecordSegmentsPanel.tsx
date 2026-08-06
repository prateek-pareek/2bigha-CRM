"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ListFilter, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  addCrmSegmentMember,
  createCrmSegment,
  fetchCrmSegmentsForRecord,
  removeCrmSegmentMember,
  type CrmRecordSegmentMembership,
  type CrmSegmentMemberModule,
} from "@/lib/crm/segments";

type Props = {
  module: CrmSegmentMemberModule;
  entityId: string;
  recordLabel?: string;
};

export default function CrmRecordSegmentsPanel({
  module,
  entityId,
  recordLabel,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<CrmRecordSegmentMembership[]>([]);
  const [staticLists, setStaticLists] = useState<
    Array<{ id: string; name: string; isMember: boolean }>
  >([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [listQuery, setListQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const data = await fetchCrmSegmentsForRecord(module, entityId);
      setMemberships(data.memberships || []);
      setStaticLists(data.staticLists || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load segment lists");
      setMemberships([]);
      setStaticLists([]);
    } finally {
      setLoading(false);
    }
  }, [module, entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const availableToAdd = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    return staticLists
      .filter((s) => !s.isMember)
      .filter((s) => !q || s.name.toLowerCase().includes(q));
  }, [staticLists, listQuery]);

  const handleAdd = async (segmentId: string) => {
    setBusyId(segmentId);
    try {
      await addCrmSegmentMember(segmentId, module, entityId);
      toast.success("Added to segment list");
      setPickerOpen(false);
      setListQuery("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add to list");
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (segmentId: string) => {
    setBusyId(segmentId);
    try {
      await removeCrmSegmentMember(segmentId, module, entityId);
      toast.success("Removed from segment list");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove from list");
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateList = async () => {
    const name = listQuery.trim();
    if (!name) {
      toast.error("Enter a name for the new list");
      return;
    }
    setCreating(true);
    try {
      const created = await createCrmSegment({
        name,
        listType: "static",
        description: recordLabel
          ? `${module === "leads" ? "Lead" : "Contact"}: ${recordLabel}`
          : undefined,
      });
      await addCrmSegmentMember(created.id, module, entityId);
      toast.success(`Created "${name}" and added this record`);
      setPickerOpen(false);
      setListQuery("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create list");
    } finally {
      setCreating(false);
    }
  };

  const entityNoun = module === "leads" ? "lead" : "contact";

  return (
    <div className="rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--card-bg)] p-4 shadow-[var(--crm-shadow-card)]">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ListFilter className="h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--text-main)]">Segment lists</h3>
            <p className="text-[11px] text-[var(--text-muted)] leading-snug mt-0.5">
              Static lists for campaigns and outreach. Dynamic lists use filters on the segment page.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white px-2.5 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--surface-dim)]"
          title={`Add this ${entityNoun} to a static list`}
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6 text-[var(--text-muted)]">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : memberships.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)] py-2">
          Not on any static segment lists yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {memberships.map((seg) => (
            <li
              key={seg.id}
              className="flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)]/40 px-2.5 py-2"
            >
              <Link
                href={`/crm/segments/${seg.id}`}
                className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--hs-link)] hover:underline"
              >
                {seg.name}
              </Link>
              <button
                type="button"
                disabled={busyId === seg.id}
                onClick={() => void handleRemove(seg.id)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-white hover:text-rose-600 disabled:opacity-40"
                title="Remove from this list"
                aria-label={`Remove from ${seg.name}`}
              >
                {busyId === seg.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {pickerOpen ? (
        <div className="mt-3 space-y-2 rounded-lg border border-[var(--border-color)] bg-white p-3">
          <input
            type="search"
            value={listQuery}
            onChange={(e) => setListQuery(e.target.value)}
            placeholder="Search or name a new list…"
            className="h-9 w-full rounded-md border border-[var(--border-color)] px-3 text-sm"
            autoFocus
          />
          <div className="max-h-40 overflow-y-auto space-y-1">
            {availableToAdd.length === 0 ? (
              <p className="px-1 py-2 text-xs text-[var(--text-muted)]">
                {listQuery.trim()
                  ? "No matching lists. Create one below."
                  : "Already on all static lists, or none exist yet."}
              </p>
            ) : (
              availableToAdd.map((seg) => (
                <button
                  key={seg.id}
                  type="button"
                  disabled={busyId === seg.id}
                  onClick={() => void handleAdd(seg.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium",
                    "hover:bg-[var(--surface-dim)] disabled:opacity-50",
                  )}
                >
                  <span className="truncate">{seg.name}</span>
                  {busyId === seg.id ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  )}
                </button>
              ))
            )}
          </div>
          {listQuery.trim() ? (
            <button
              type="button"
              disabled={creating}
              onClick={() => void handleCreateList()}
              className="w-full rounded-md border border-dashed border-[var(--border-color)] py-2 text-xs font-semibold text-[var(--hs-link)] hover:bg-[var(--surface-dim)] disabled:opacity-50"
            >
              {creating ? "Creating…" : `Create "${listQuery.trim()}" and add this ${entityNoun}`}
            </button>
          ) : null}
          <Link
            href="/crm/segments"
            className="block text-center text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--hs-link)]"
          >
            Manage all segments →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
