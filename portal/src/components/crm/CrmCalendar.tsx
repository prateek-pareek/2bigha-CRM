"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  format,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  startOfMonth,
  endOfMonth,
  isSameMonth,
  isToday,
  parseISO,
  isAfter,
  startOfDay,
} from "date-fns";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  LayoutList,
  Loader2,
  Link2,
  Plus,
  RefreshCw,
} from "lucide-react";
import api from "@/lib/crm/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/usePermissions";

type CalendarEvent = {
  _id: string;
  title: string;
  content?: string;
  metadata: {
    dueDate: string;
    isCalendarEvent: boolean;
    externalSource?: "google" | "outlook";
  };
  status?: string;
  authorName?: string;
};

type CalendarConnections = {
  google: boolean;
  outlook: boolean;
  needsReconnect?: { google: boolean; outlook: boolean };
};

export function CrmCalendar() {
  const { hasAccess } = usePermissions();
  const [internalEvents, setInternalEvents] = useState<CalendarEvent[]>([]);
  const [externalEvents, setExternalEvents] = useState<CalendarEvent[]>([]);
  const [connections, setConnections] = useState<CalendarConnections>({
    google: false,
    outlook: false,
    needsReconnect: { google: false, outlook: false },
  });
  const [syncErrors, setSyncErrors] = useState<string[]>([]);
  const [oauthNotice, setOauthNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [startingOAuth, setStartingOAuth] = useState<"gmail" | "outlook" | null>(null);

  const events = useMemo(
    () => [...internalEvents, ...externalEvents],
    [internalEvents, externalEvents],
  );
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventTime, setNewEventTime] = useState("12:00");
  const [newEventDesc, setNewEventDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchInternalEvents = async () => {
    const res = await api.get("/crm/calendar-events");
    if (res.data) {
      setInternalEvents(res.data);
    }
  };

  const fetchConnections = async () => {
    try {
      setLoadingConnections(true);
      const res = await api.get("/crm/calendar/connections");
      setConnections({
        google: Boolean(res.data?.google),
        outlook: Boolean(res.data?.outlook),
        needsReconnect: {
          google: Boolean(res.data?.needsReconnect?.google),
          outlook: Boolean(res.data?.needsReconnect?.outlook),
        },
      });
    } catch (e) {
      console.error("Failed to load calendar connections", e);
      setConnections({ google: false, outlook: false });
    } finally {
      setLoadingConnections(false);
    }
  };

  const syncExternalCalendar = useCallback(async () => {
    try {
      setSyncing(true);
      const res = await api.get("/crm/calendar/sync");
      setExternalEvents(Array.isArray(res.data?.events) ? res.data.events : []);
      if (res.data?.connections || res.data?.needsReconnect) {
        setConnections({
          google: Boolean(res.data?.connections?.google ?? res.data?.google),
          outlook: Boolean(res.data?.connections?.outlook ?? res.data?.outlook),
          needsReconnect: {
            google: Boolean(res.data?.needsReconnect?.google),
            outlook: Boolean(res.data?.needsReconnect?.outlook),
          },
        });
      }
      const errs = Array.isArray(res.data?.errors)
        ? Array.from(
            new Set(
              res.data.errors
                .map((e: { message?: string }) => e.message)
                .filter(Boolean),
            ),
          )
        : [];
      setSyncErrors(errs as string[]);
    } catch (e) {
      console.error("Failed to sync external calendar", e);
      setSyncErrors(["Could not sync Google or Outlook calendar. Try reconnecting your account."]);
    } finally {
      setSyncing(false);
    }
  }, []);

  const startCalendarOAuth = async (provider: "gmail" | "outlook") => {
    try {
      setStartingOAuth(provider);
      const endpoint =
        provider === "gmail"
          ? "/crm/calendar/oauth/google/authorize"
          : "/crm/calendar/oauth/microsoft/authorize";
      const res = await api.get(endpoint);
      const url = String(res?.data?.url || "");
      if (!url) return;
      window.location.href = url;
    } catch (e) {
      console.error(`Failed to start ${provider} OAuth`, e);
    } finally {
      setStartingOAuth(null);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        await Promise.all([fetchInternalEvents(), fetchConnections()]);
        await syncExternalCalendar();
      } catch (e) {
        console.error("Failed to load calendar", e);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [syncExternalCalendar]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get("calendar_oauth");
    if (!oauth) return;
    if (oauth === "success") {
      setOauthNotice("Calendar connected successfully. Syncing your events…");
      void fetchConnections().then(() => syncExternalCalendar());
    } else if (oauth === "error") {
      const reason = params.get("reason");
      setOauthNotice(
        reason
          ? `Calendar connection failed: ${reason}`
          : "Calendar connection failed. Please try again.",
      );
    }
  }, [syncExternalCalendar]);

  const hasGoogleConnected = connections.google && !connections.needsReconnect?.google;
  const hasOutlookConnected = connections.outlook && !connections.needsReconnect?.outlook;
  const needsGoogleReconnect = connections.needsReconnect?.google ?? !connections.google;
  const needsOutlookReconnect = connections.needsReconnect?.outlook ?? !connections.outlook;
  const canSyncCalendar = hasAccess("dashboard:read");

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const upcoming = useMemo(() => {
    if (!events?.length) return [];
    const today = startOfDay(new Date());
    return [...events]
      .filter((e) => {
        try {
          if (!e.metadata?.dueDate) return false;
          const d = parseISO(e.metadata.dueDate.split("T")[0]);
          return !isAfter(today, d);
        } catch {
          return false;
        }
      })
      .sort((a, b) => new Date(a.metadata.dueDate).getTime() - new Date(b.metadata.dueDate).getTime())
      .slice(0, 10);
  }, [events]);

  const handleAddEvent = (day?: Date) => {
    const d = day || new Date();
    setSelectedDate(d);
    setNewEventTitle("");
    setNewEventDesc("");
    setNewEventTime("12:00");
    setShowAddModal(true);
  };

  const submitEvent = async () => {
    if (!newEventTitle.trim()) return;
    try {
      setCreating(true);
      const [hours, minutes] = newEventTime.split(':').map(Number);
      const dt = new Date(selectedDate);
      dt.setHours(hours || 12, minutes || 0, 0, 0);

      await api.post("/crm/calendar-events", {
        title: newEventTitle,
        content: newEventDesc,
        dueDate: dt.toISOString()
      });
      setShowAddModal(false);
      void fetchInternalEvents();
    } catch (err) {
      console.error("Failed to create event", err);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-[3px] border border-border/60 bg-card">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {oauthNotice && (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            oauthNotice.includes("failed")
              ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200",
          )}
        >
          {oauthNotice}
        </div>
      )}
      {syncErrors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100">
          {syncErrors.map((msg, i) => (
            <p key={i}>{msg}</p>
          ))}
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300/90">
            Use Connect Google Calendar or Connect Outlook Calendar below and sign in again to restore access.
          </p>
        </div>
      )}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <div className="inline-flex rounded-lg border border-border/80 bg-surface-dim/40 p-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                viewMode === "calendar"
                  ? "bg-card text-primary shadow-sm"
                  : "text-text-muted hover:text-text-main"
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              Calendar
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                viewMode === "list"
                  ? "bg-card text-primary shadow-sm"
                  : "text-text-muted hover:text-text-main"
              )}
            >
              <LayoutList className="h-3.5 w-3.5" />
              List
            </button>
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg border border-border/80 bg-surface-dim/30 px-3 py-1.5 text-xs font-semibold text-text-muted">
            <Link2 className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden md:inline">Calendar sync</span>
            <span className="md:hidden">Sync:</span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-xs shrink-0",
                hasGoogleConnected
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <span className="hidden sm:inline">Google {hasGoogleConnected ? "connected" : "not connected"}</span>
              <span className="sm:hidden">Google {hasGoogleConnected ? "✓" : "✗"}</span>
            </span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-xs shrink-0",
                hasOutlookConnected
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <span className="hidden sm:inline">Outlook {hasOutlookConnected ? "connected" : "not connected"}</span>
              <span className="sm:hidden">Outlook {hasOutlookConnected ? "✓" : "✗"}</span>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm w-full lg:w-auto">
          {canSyncCalendar && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void startCalendarOAuth("gmail")}
                disabled={startingOAuth !== null}
                className="gap-1.5 h-8 text-xs sm:h-9 sm:text-sm"
              >
                {startingOAuth === "gmail" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                {needsGoogleReconnect ? "Connect Google" : "Reconnect Google"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void startCalendarOAuth("outlook")}
                disabled={startingOAuth !== null}
                className="gap-1.5 h-8 text-xs sm:h-9 sm:text-sm"
              >
                {startingOAuth === "outlook" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                {needsOutlookReconnect ? "Connect Outlook" : "Reconnect Outlook"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void Promise.all([fetchConnections(), syncExternalCalendar()])}
                disabled={loadingConnections || syncing}
                className="gap-1.5 h-8 text-xs sm:h-9 sm:text-sm"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", (loadingConnections || syncing) && "animate-spin")} />
                <span className="hidden sm:inline">Sync Calendar</span>
                <span className="sm:hidden">Sync</span>
              </Button>
            </>
          )}
          <Button onClick={() => handleAddEvent()} size="sm" className="gap-2 h-8 text-xs sm:h-9 sm:text-sm">
            <Plus className="h-4 w-4" /> Add Event
          </Button>
        </div>
      </div>

      {viewMode === "list" ? (
        <div className="overflow-hidden rounded-[3px] border border-border/60 bg-card shadow-sm">
          <div className="border-b border-border/60 bg-surface-dim/50 px-4 py-3">
            <h2 className="text-base font-semibold text-text-main">Sales Calendar</h2>
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
              All Planned Follow-ups & Events
            </p>
          </div>
          {events.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-text-muted">
              No calendar events scheduled yet.
            </p>
          ) : (
            <div className="divide-y divide-border/40">
              {events.map((e, i) => {
                if (!e.metadata?.dueDate) return null;
                const d = parseISO(e.metadata.dueDate.split("T")[0]);
                const prev = i > 0 && events[i - 1].metadata?.dueDate ? parseISO(events[i - 1].metadata.dueDate.split("T")[0]) : null;
                const showMonthHeader =
                  !prev || format(d, "yyyy-MM") !== format(prev, "yyyy-MM");
                return (
                  <div key={e._id}>
                    {showMonthHeader && (
                      <div className="bg-surface-dim/40 px-4 py-2 text-xs font-semibold text-text-muted">
                        {format(d, "MMMM yyyy")}
                      </div>
                    )}
                    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        <span className="font-mono text-sm font-semibold tabular-nums text-text-main">
                          {format(new Date(e.metadata.dueDate), "EEE, MMM d, yyyy - h:mm a")}
                        </span>
                        <span
                          className={cn(
                            "inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide bg-primary/10 text-primary"
                          )}
                        >
                          {e.status || 'Scheduled'}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-text-main sm:text-right sm:max-w-[55%] truncate">
                        {e.title}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="overflow-hidden rounded-[3px] border border-border/60 bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border/60 bg-surface-dim/50 px-4 py-3">
              <div>
                <h2 className="text-base font-semibold text-text-main">Calendar</h2>
                <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  Follow-ups & Events
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-[9rem] text-center text-sm font-semibold text-text-main">
                  {format(currentMonth, "MMMM yyyy")}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 border-b border-border/40 bg-surface-dim/30">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div
                  key={d}
                  className="py-2.5 text-center text-xs font-semibold text-text-muted"
                >
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 auto-rows-fr">
              {calendarDays.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const dayEvents = events.filter((e) =>
                  e.metadata?.dueDate?.startsWith(dateStr)
                );
                
                const isCurrentMonth = isSameMonth(day, monthStart);
                const today = isToday(day);

                return (
                  <div
                    key={day.toString()}
                    onClick={() => handleAddEvent(day)}
                    className={cn(
                      "min-h-[100px] border-b border-r border-border/30 p-1.5 flex flex-col cursor-pointer transition-colors hover:bg-surface-dim/20",
                      !isCurrentMonth && "bg-muted/20 text-text-muted/70",
                      today && "bg-primary/[0.04]"
                    )}
                  >
                    <span
                      className={cn(
                        "mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                        today
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : isCurrentMonth
                            ? "text-text-main"
                            : "text-text-muted"
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    <div className="flex flex-col gap-1 mt-auto overflow-hidden">
                      {dayEvents.map((ev, idx) => (
                        <div
                          key={ev._id || idx}
                          className={cn(
                            "rounded-md border px-1.5 py-1 text-xs font-semibold leading-tight truncate border-solid",
                            ev.metadata?.externalSource
                              ? "border-sky-400/50 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-200"
                              : "border-primary/40 bg-primary/10 text-primary",
                          )}
                          title={ev.title}
                        >
                          <span className="truncate">{ev.title}</span>
                          <span className="mt-0.5 block text-[9px] font-medium opacity-80 truncate">
                            {format(new Date(ev.metadata.dueDate), "h:mm a")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="rounded-[3px] border border-border/60 bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-text-main">Upcoming Tasks</h3>
            <p className="mt-0.5 text-xs text-text-muted">Next 10 active tasks</p>
            <ul className="mt-4 max-h-[min(420px,60vh)] space-y-2 overflow-y-auto pr-1">
              {upcoming.length === 0 ? (
                <li className="text-sm text-text-muted">No upcoming calendar tasks.</li>
              ) : (
                upcoming.map((h, i) => (
                  <li
                    key={h._id || i}
                    className="flex flex-col gap-1 rounded-lg border border-border/50 bg-surface-dim/30 px-3 py-2 text-sm"
                  >
                    <div className="flex justify-between items-start gap-2">
                       <span className="font-mono text-xs font-semibold text-text-muted">
                        {format(parseISO(h.metadata.dueDate.split("T")[0]), "MMM d, yyyy")}
                      </span>
                      <span className="text-xs font-bold text-primary px-1.5 py-0.5 rounded-sm bg-primary/10">
                        {format(new Date(h.metadata.dueDate), "h:mm a")}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-text-main truncate">
                      {h.title}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </aside>
        </div>
      )}

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Calendar Event</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="title" className="text-sm font-medium">Title <span className="text-rose-500">*</span></label>
              <Input
                id="title"
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
                placeholder="Follow up with client..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div className="grid gap-2">
                <label className="text-sm font-medium">Date</label>
                <div className="px-3 py-2 border border-border rounded-md bg-muted/30 text-sm font-medium text-text-main">
                  {format(selectedDate, "MMM d, yyyy")}
                </div>
              </div>
              <div className="grid gap-2">
                <label htmlFor="time" className="text-sm font-medium">Time</label>
                <Input
                  id="time"
                  type="time"
                  value={newEventTime}
                  onChange={(e) => setNewEventTime(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <label htmlFor="desc" className="text-sm font-medium">Notes</label>
              <Textarea
                id="desc"
                value={newEventDesc}
                onChange={(e) => setNewEventDesc(e.target.value)}
                placeholder="Optional details..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button onClick={submitEvent} disabled={!newEventTitle.trim() || creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
