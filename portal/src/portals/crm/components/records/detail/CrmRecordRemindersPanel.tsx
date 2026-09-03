"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";

type Props = {
  relatedType: "Lead" | "Client" | "Contact" | "Task" | "Organization";
  relatedTo?: string;
};

export default function CrmRecordRemindersPanel({ relatedType, relatedTo }: Props) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [recurrence, setRecurrence] = useState("none");
  const [saving, setSaving] = useState(false);

  const authHeaders = () => {
    const token = localStorage.getItem("token");
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  };

  const load = useCallback(async () => {
    if (!relatedTo) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        relatedType,
        relatedTo,
        limit: "20",
      });
      const res = await fetch(`${CRM_API_URL}/crm/reminders?${qs}`, {
        headers: authHeaders(),
      });
      const data = res.ok ? await res.json() : { items: [] };
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [relatedTo, relatedType]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!relatedTo || !title.trim() || !scheduledAt) {
      toast.error("Title and date/time are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/reminders`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          relatedType,
          relatedTo,
          scheduledAt: new Date(scheduledAt).toISOString(),
          recurrence,
        }),
      });
      if (!res.ok) throw new Error("Create failed");
      toast.success("Reminder created");
      setOpen(false);
      setTitle("");
      setDescription("");
      setScheduledAt("");
      setRecurrence("none");
      void load();
    } catch {
      toast.error("Could not create reminder");
    } finally {
      setSaving(false);
    }
  };

  const markDone = async (id: string) => {
    try {
      const res = await fetch(`${CRM_API_URL}/crm/reminders/${id}/done`, {
        method: "PATCH",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed");
      void load();
    } catch {
      toast.error("Could not mark done");
    }
  };

  if (!relatedTo) return null;

  return (
    <div className="rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          <Bell size={12} />
          Reminders
        </h4>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-[var(--hs-link)] hover:bg-[var(--surface-dim)]"
        >
          <Plus size={12} />
          Add
        </button>
      </div>

      {open ? (
        <div className="mb-3 space-y-2 rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)]/40 p-2">
          <input
            className="h-8 w-full rounded-md border border-[var(--border-color)] bg-white px-2 text-sm"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            type="datetime-local"
            className="h-8 w-full rounded-md border border-[var(--border-color)] bg-white px-2 text-sm"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
          <textarea
            className="min-h-[56px] w-full rounded-md border border-[var(--border-color)] bg-white px-2 py-1 text-sm"
            placeholder="Note (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <select
            className="h-8 w-full rounded-md border border-[var(--border-color)] bg-white px-2 text-sm"
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value)}
          >
            <option value="none">One-time</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <button
            type="button"
            disabled={saving}
            onClick={() => void create()}
            className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-md bg-[var(--hs-link)] text-xs font-semibold text-white disabled:opacity-60"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : null}
            Save reminder
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
          <Loader2 size={12} className="animate-spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">No open reminders.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => (
            <li key={r._id} className="rounded-md border border-[var(--border-color)] px-2 py-1.5">
              <div className="text-xs font-medium text-[var(--text-main)]">{r.title}</div>
              <div className="text-[10px] text-[var(--text-muted)]">
                {r.nextFireAt ? new Date(r.nextFireAt).toLocaleString() : "—"}
                {r.recurrence && r.recurrence !== "none" ? ` · ${r.recurrence}` : ""}
              </div>
              <button
                type="button"
                onClick={() => void markDone(r._id)}
                className="mt-1 text-[10px] font-medium text-[var(--hs-link)]"
              >
                Mark done
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
