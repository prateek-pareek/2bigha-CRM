"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";

type ChannelPrefs = { inApp: boolean; email: boolean; label: string };
type PrefsMap = Record<string, ChannelPrefs>;

type TeamScheduleItem = {
  kind: string;
  title: string;
  scheduledAt: string;
  status: "upcoming" | "due" | "overdue";
  ownerLabel?: string;
  link?: string;
  relatedType?: string;
};

function authHeaders() {
  const token = localStorage.getItem("token");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export default function CrmRemindersAndPrefs({
  showHeading = false,
  mode = "all",
}: {
  showHeading?: boolean;
  mode?: "all" | "prefs" | "reminders";
}) {
  const [events, setEvents] = useState<PrefsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reminders, setReminders] = useState<any[]>([]);
  const [teamSchedule, setTeamSchedule] = useState<TeamScheduleItem[]>([]);
  const [canViewTeam, setCanViewTeam] = useState(false);
  const [loadingReminders, setLoadingReminders] = useState(true);

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
        fetch(`${CRM_API_URL}/crm/reminders?limit=40`, {
          headers: authHeaders(),
        }).then((r) => (r.ok ? r.json() : { items: [] })),
        fetch(`${CRM_API_URL}/crm/reminders/team-schedule?limit=60`, {
          headers: authHeaders(),
        }).then((r) => (r.ok ? r.json() : { items: [], canViewTeam: false })),
      ]);
      setReminders(Array.isArray(mine?.items) ? mine.items : []);
      setCanViewTeam(Boolean(team?.canViewTeam));
      setTeamSchedule(Array.isArray(team?.items) ? team.items : []);
    } catch {
      setReminders([]);
      setTeamSchedule([]);
      setCanViewTeam(false);
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

  const showPrefs = mode === "all" || mode === "prefs";
  const showReminders = mode === "all" || mode === "reminders";

  return (
    <div className="space-y-6">
      {showPrefs ? (
        showHeading ? (
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || loading}
              className="inline-flex items-center gap-2 rounded-md bg-[var(--hs-link)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save preferences
            </button>
          </div>
        ) : (
          <div className="flex justify-end">
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
        )
      ) : null}

      {showPrefs ? (
        <section className="rounded-lg border border-[var(--border-color)] bg-white">
          <div className="border-b border-[var(--border-color)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--text-main)]">
              Delivery preferences
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Choose which events alert you in-app and by email. Email sends only
              when SMTP is configured on the CRM API (MAIL_HOST or SMTP_HOST).
            </p>
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
      ) : null}

      {showReminders ? (
        <ReminderList
          title="My reminders"
          loading={loadingReminders}
          items={reminders}
          onDone={markDone}
          onReschedule={reschedule}
        />
      ) : null}

      {showReminders && canViewTeam ? (
        <section className="rounded-lg border border-[var(--border-color)] bg-white">
          <div className="border-b border-[var(--border-color)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--text-main)]">
              Team follow-ups & reminders
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Follow-up dates, callbacks, tasks, and custom reminders for your team.
            </p>
          </div>
          {loadingReminders ? (
            <div className="flex items-center gap-2 p-6 text-sm text-[var(--text-muted)]">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : teamSchedule.length === 0 ? (
            <p className="p-6 text-sm text-[var(--text-muted)]">
              No team follow-ups in the next two weeks.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border-color)]">
              {teamSchedule.map((row, idx) => (
                <li
                  key={`${row.kind}-${row.relatedType || ""}-${row.link}-${idx}`}
                  className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    {row.link ? (
                      <Link
                        href={row.link}
                        className="font-medium text-[var(--hs-link)] hover:underline"
                      >
                        {row.title}
                      </Link>
                    ) : (
                      <div className="font-medium text-[var(--text-main)]">{row.title}</div>
                    )}
                    <div className="text-xs text-[var(--text-muted)]">
                      {row.kind.replace(/_/g, " ")} · {row.status}
                      {row.ownerLabel ? ` · ${row.ownerLabel}` : ""} ·{" "}
                      {row.scheduledAt
                        ? new Date(row.scheduledAt).toLocaleString()
                        : "—"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

function ReminderList({
  title,
  loading,
  items,
  onDone,
  onReschedule,
}: {
  title: string;
  loading: boolean;
  items: any[];
  onDone: (id: string) => void;
  onReschedule: (id: string) => void;
}) {
  return (
    <section className="rounded-lg border border-[var(--border-color)] bg-white">
      <div className="border-b border-[var(--border-color)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--text-main)]">{title}</h2>
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
                  {r.relatedType}
                  {r.medium === "whatsapp"
                    ? " · WhatsApp"
                    : r.medium === "email"
                      ? " · Email"
                      : r.medium === "later"
                        ? " · Decide later"
                        : ""}{" "}
                  · {r.status || "PENDING"} ·{" "}
                  {r.nextFireAt ? new Date(r.nextFireAt).toLocaleString() : "—"}
                  {r.recurrence && r.recurrence !== "none" ? ` · ${r.recurrence}` : ""}
                </div>
                {r.description ? (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{r.description}</p>
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
