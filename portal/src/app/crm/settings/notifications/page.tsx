"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, ChevronLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";

type ChannelPrefs = { inApp: boolean; email: boolean; label: string };
type PrefsMap = Record<string, ChannelPrefs>;

export default function NotificationSettingsPage() {
  const [events, setEvents] = useState<PrefsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reminders, setReminders] = useState<any[]>([]);
  const [teamReminders, setTeamReminders] = useState<any[]>([]);
  const [loadingReminders, setLoadingReminders] = useState(true);

  const authHeaders = () => {
    const token = localStorage.getItem("token");
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  };

  const loadPrefs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/notification-preferences/me`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load preferences");
      const data = await res.json();
      setEvents(data?.events || {});
    } catch (err: any) {
      toast.error(err?.message || "Could not load notification preferences");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReminders = useCallback(async () => {
    setLoadingReminders(true);
    try {
      const [mine, team] = await Promise.all([
        fetch(`${CRM_API_URL}/crm/reminders?limit=40`, { headers: authHeaders() }).then((r) =>
          r.ok ? r.json() : { items: [] },
        ),
        fetch(`${CRM_API_URL}/crm/reminders?team=1&limit=40`, {
          headers: authHeaders(),
        }).then((r) => (r.ok ? r.json() : { items: [] })),
      ]);
      setReminders(Array.isArray(mine?.items) ? mine.items : []);
      setTeamReminders(Array.isArray(team?.items) ? team.items : []);
    } catch {
      setReminders([]);
      setTeamReminders([]);
    } finally {
      setLoadingReminders(false);
    }
  }, []);

  useEffect(() => {
    void loadPrefs();
    void loadReminders();
  }, [loadPrefs, loadReminders]);

  const toggle = (key: string, channel: "inApp" | "email") => {
    setEvents((prev) => {
      const cur = prev[key] || { inApp: true, email: false, label: key };
      return {
        ...prev,
        [key]: { ...cur, [channel]: !cur[channel] },
      };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: Record<string, { inApp: boolean; email: boolean }> = {};
      for (const [key, val] of Object.entries(events)) {
        payload[key] = { inApp: Boolean(val.inApp), email: Boolean(val.email) };
      }
      const res = await fetch(`${CRM_API_URL}/crm/notification-preferences/me`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ events: payload }),
      });
      if (!res.ok) throw new Error("Save failed");
      const data = await res.json();
      setEvents(data?.events || events);
      toast.success("Notification preferences saved");
    } catch (err: any) {
      toast.error(err?.message || "Could not save preferences");
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
      toast.success("Reminder marked done");
      void loadReminders();
    } catch {
      toast.error("Could not mark reminder done");
    }
  };

  const reschedule = async (id: string) => {
    const next = window.prompt("New date/time (YYYY-MM-DDTHH:mm)", "");
    if (!next) return;
    try {
      const scheduledAt = new Date(next).toISOString();
      if (Number.isNaN(new Date(scheduledAt).getTime())) {
        toast.error("Invalid date");
        return;
      }
      const res = await fetch(`${CRM_API_URL}/crm/reminders/${id}/reschedule`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ scheduledAt }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Reminder rescheduled");
      void loadReminders();
    } catch {
      toast.error("Could not reschedule");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link
          href="/crm/settings"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-color)] text-[var(--text-muted)] hover:bg-[var(--surface-dim)]"
        >
          <ChevronLeft size={16} />
        </Link>
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-[var(--text-main)]">
            <Bell size={20} />
            Notifications & reminders
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Choose which events alert you in-app and by email. Managers can also
            review team reminders below.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || loading}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--hs-link)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save
        </button>
      </div>

      <section className="rounded-lg border border-[var(--border-color)] bg-white">
        <div className="border-b border-[var(--border-color)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--text-main)]">
            Delivery preferences
          </h2>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-[var(--text-muted)]">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-color)]">
            <div className="grid grid-cols-[1fr_72px_72px] gap-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              <span>Event</span>
              <span className="text-center">In-app</span>
              <span className="text-center">Email</span>
            </div>
            {Object.entries(events).map(([key, pref]) => (
              <div
                key={key}
                className="grid grid-cols-[1fr_72px_72px] items-center gap-2 px-4 py-2.5 text-sm"
              >
                <span className="text-[var(--text-main)]">{pref.label || key}</span>
                <label className="flex justify-center">
                  <input
                    type="checkbox"
                    checked={Boolean(pref.inApp)}
                    onChange={() => toggle(key, "inApp")}
                  />
                </label>
                <label className="flex justify-center">
                  <input
                    type="checkbox"
                    checked={Boolean(pref.email)}
                    onChange={() => toggle(key, "email")}
                  />
                </label>
              </div>
            ))}
          </div>
        )}
      </section>

      <ReminderList
        title="My reminders"
        loading={loadingReminders}
        items={reminders}
        onDone={markDone}
        onReschedule={reschedule}
      />
      <ReminderList
        title="Team reminders"
        subtitle="Visible when you have team or all lead access"
        loading={loadingReminders}
        items={teamReminders}
        onDone={markDone}
        onReschedule={reschedule}
      />
    </div>
  );
}

function ReminderList({
  title,
  subtitle,
  loading,
  items,
  onDone,
  onReschedule,
}: {
  title: string;
  subtitle?: string;
  loading: boolean;
  items: any[];
  onDone: (id: string) => void;
  onReschedule: (id: string) => void;
}) {
  return (
    <section className="rounded-lg border border-[var(--border-color)] bg-white">
      <div className="border-b border-[var(--border-color)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--text-main)]">{title}</h2>
        {subtitle ? (
          <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>
        ) : null}
      </div>
      {loading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-[var(--text-muted)]">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <p className="p-6 text-sm text-[var(--text-muted)]">No open reminders.</p>
      ) : (
        <ul className="divide-y divide-[var(--border-color)]">
          {items.map((r) => (
            <li
              key={r._id}
              className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <div className="font-medium text-[var(--text-main)]">{r.title}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {r.relatedType} ·{" "}
                  {r.nextFireAt
                    ? new Date(r.nextFireAt).toLocaleString()
                    : "—"}
                  {r.recurrence && r.recurrence !== "none"
                    ? ` · ${r.recurrence}`
                    : ""}
                </div>
                {r.description ? (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {r.description}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onReschedule(r._id)}
                  className="rounded-md border border-[var(--border-color)] px-2 py-1 text-xs hover:bg-[var(--surface-dim)]"
                >
                  Reschedule
                </button>
                <button
                  type="button"
                  onClick={() => onDone(r._id)}
                  className="rounded-md border border-[var(--border-color)] px-2 py-1 text-xs hover:bg-[var(--surface-dim)]"
                >
                  Done
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
