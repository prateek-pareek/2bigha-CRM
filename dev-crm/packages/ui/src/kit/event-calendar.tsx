"use client";

import { useMemo, useState, type ReactNode } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../dialog";
import { cn } from "../utils";
import { KitButton } from "./kit-button";
import { FieldInput, FieldLabel, FieldSelect, FieldTextarea } from "./field";
import { CRM_PANEL } from "./tokens";
import {
  EVENT_CALENDAR_FORM_CATEGORIES,
  EVENT_CALENDAR_SIDEBAR_FILTERS,
  type EventCalendarCategory,
  type EventCalendarSidebarFilter,
  eventCalendarCategoryMeta,
  eventMatchesSidebarFilters,
  normalizeEventCalendarCategory,
} from "./event-calendar-categories";

export type KitCalendarEvent = {
  id: string;
  title: string;
  content?: string;
  /** ISO datetime */
  dueDate: string;
  category?: string;
  externalSource?: string;
  status?: string;
  reminderAt?: string;
  reminderType?: "follow_up" | "custom";
  reminderMessage?: string;
};

export type EventCalendarCreatePayload = {
  title: string;
  content: string;
  dueDate: string;
  category: EventCalendarCategory;
  reminderType?: "follow_up" | "custom";
  reminderAt?: string;
  reminderMessage?: string;
};

export type EventCalendarSyncProps = {
  enabled?: boolean;
  googleConnected?: boolean;
  outlookConnected?: boolean;
  needsGoogleReconnect?: boolean;
  needsOutlookReconnect?: boolean;
  syncing?: boolean;
  loadingConnections?: boolean;
  startingOAuth?: "gmail" | "outlook" | null;
  onConnectGoogle?: () => void;
  onConnectOutlook?: () => void;
  onSync?: () => void;
};

export type EventCalendarProps = {
  events: KitCalendarEvent[];
  loading?: boolean;
  creating?: boolean;
  title?: string;
  description?: string;
  /** Banner / alert content above the toolbar (OAuth notices, sync errors, …) */
  notices?: ReactNode;
  sync?: EventCalendarSyncProps;
  onCreateEvent?: (payload: EventCalendarCreatePayload) => void | Promise<void>;
  className?: string;
};

const EXTERNAL_CHIP =
  "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-200";

function eventChipClass(ev: KitCalendarEvent) {
  if (ev.externalSource) return EXTERNAL_CHIP;
  return eventCalendarCategoryMeta(normalizeEventCalendarCategory(ev.category)).chipClass;
}

/**
 * Product kit event calendar — Dreams CRM–style layout (sidebar filters + month grid).
 * Host apps supply events + create/sync callbacks; no API coupling.
 */
export function EventCalendar({
  events,
  loading = false,
  creating = false,
  title = "Calendar",
  description = "Meetings, follow-ups, and synced external events",
  notices,
  sync,
  onCreateEvent,
  className,
}: EventCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [activeFilters, setActiveFilters] = useState<Set<EventCalendarSidebarFilter>>(
    () => new Set(EVENT_CALENDAR_SIDEBAR_FILTERS.map((f) => f.key)),
  );

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedEvent, setSelectedEvent] = useState<KitCalendarEvent | null>(null);

  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventTime, setNewEventTime] = useState("12:00");
  const [newEventDesc, setNewEventDesc] = useState("");
  const [newEventCategory, setNewEventCategory] =
    useState<EventCalendarCategory>("meeting");
  const [reminderOption, setReminderOption] = useState("none");
  const [customReminderAt, setCustomReminderAt] = useState("");
  const [customReminderMessage, setCustomReminderMessage] = useState("");

  const filteredEvents = useMemo(
    () => events.filter((e) => eventMatchesSidebarFilters(e, activeFilters)),
    [events, activeFilters],
  );

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const upcoming = useMemo(() => {
    if (!filteredEvents.length) return [];
    const today = startOfDay(new Date());
    return [...filteredEvents]
      .filter((e) => {
        try {
          if (!e.dueDate) return false;
          const d = parseISO(e.dueDate.split("T")[0]);
          return !isAfter(today, d);
        } catch {
          return false;
        }
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 15);
  }, [filteredEvents]);

  const toggleFilter = (key: EventCalendarSidebarFilter) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleAddEvent = (day?: Date) => {
    setSelectedDate(day || new Date());
    setNewEventTitle("");
    setNewEventDesc("");
    setNewEventTime("12:00");
    setNewEventCategory("meeting");
    setReminderOption("none");
    setCustomReminderAt("");
    setCustomReminderMessage("");
    setShowAddModal(true);
  };

  const submitEvent = async () => {
    if (!newEventTitle.trim() || !onCreateEvent) return;
    const [hours, minutes] = newEventTime.split(":").map(Number);
    const dt = new Date(selectedDate);
    dt.setHours(hours || 12, minutes || 0, 0, 0);
    const isCustomReminder = reminderOption === "custom";
    const reminderMinutes = isCustomReminder || reminderOption === "none"
      ? null
      : Number(reminderOption);
    const reminderAt = isCustomReminder
      ? customReminderAt
        ? new Date(customReminderAt).toISOString()
        : undefined
      : reminderMinutes != null
        ? new Date(dt.getTime() - reminderMinutes * 60_000).toISOString()
        : undefined;
    await onCreateEvent({
      title: newEventTitle,
      content: newEventDesc,
      dueDate: dt.toISOString(),
      category: newEventCategory,
      reminderType: reminderAt ? (isCustomReminder ? "custom" : "follow_up") : undefined,
      reminderAt,
      reminderMessage: isCustomReminder
        ? customReminderMessage.trim() || undefined
        : undefined,
    });
    setShowAddModal(false);
  };

  const syncEnabled = Boolean(sync?.enabled);

  if (loading) {
    return (
      <div className={cn(CRM_PANEL, "flex min-h-[320px] items-center justify-center", className)}>
        <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {notices}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[20px] font-bold leading-tight text-[var(--text-main)]">{title}</h1>
          {description ? (
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">{description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] p-0.5 shadow-[var(--crm-shadow-input)]">
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[calc(var(--radius-md)-2px)] px-3 py-1.5 text-xs font-semibold transition-colors",
                viewMode === "calendar"
                  ? "bg-[var(--primary)] text-white shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)]",
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              Calendar
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[calc(var(--radius-md)-2px)] px-3 py-1.5 text-xs font-semibold transition-colors",
                viewMode === "list"
                  ? "bg-[var(--primary)] text-white shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)]",
              )}
            >
              <LayoutList className="h-3.5 w-3.5" />
              List
            </button>
          </div>
          {syncEnabled ? (
            <>
              <KitButton
                variant="secondary"
                onClick={sync?.onConnectGoogle}
                disabled={sync?.startingOAuth != null}
                className="h-8 gap-1.5 text-xs sm:h-9 sm:text-sm"
              >
                {sync?.startingOAuth === "gmail" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Link2 className="h-3.5 w-3.5" />
                )}
                {sync?.needsGoogleReconnect ? "Connect Google" : "Reconnect Google"}
              </KitButton>
              <KitButton
                variant="secondary"
                onClick={sync?.onConnectOutlook}
                disabled={sync?.startingOAuth != null}
                className="h-8 gap-1.5 text-xs sm:h-9 sm:text-sm"
              >
                {sync?.startingOAuth === "outlook" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Link2 className="h-3.5 w-3.5" />
                )}
                {sync?.needsOutlookReconnect ? "Connect Outlook" : "Reconnect Outlook"}
              </KitButton>
              <KitButton
                variant="secondary"
                onClick={sync?.onSync}
                disabled={sync?.loadingConnections || sync?.syncing}
                className="h-8 gap-1.5 text-xs sm:h-9 sm:text-sm"
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5",
                    (sync?.loadingConnections || sync?.syncing) && "animate-spin",
                  )}
                />
                Sync
              </KitButton>
            </>
          ) : null}
          {onCreateEvent ? (
            <KitButton onClick={() => handleAddEvent()} className="gap-2">
              <Plus className="h-4 w-4" />
              New Event
            </KitButton>
          ) : null}
        </div>
      </div>

      {syncEnabled ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
          <Link2 className="h-3.5 w-3.5 shrink-0" />
          <span
            className={cn(
              "rounded px-1.5 py-0.5 font-semibold",
              sync?.googleConnected
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                : "bg-[var(--surface-dim)]",
            )}
          >
            Google {sync?.googleConnected ? "connected" : "not connected"}
          </span>
          <span
            className={cn(
              "rounded px-1.5 py-0.5 font-semibold",
              sync?.outlookConnected
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                : "bg-[var(--surface-dim)]",
            )}
          >
            Outlook {sync?.outlookConnected ? "connected" : "not connected"}
          </span>
        </div>
      ) : null}

      {viewMode === "list" ? (
        <div className={cn(CRM_PANEL, "overflow-hidden")}>
          <div className="border-b border-[var(--border-color)] px-4 py-3 sm:px-5">
            <h2 className="text-base font-semibold text-[var(--text-main)]">All events</h2>
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Planned follow-ups & meetings
            </p>
          </div>
          {filteredEvents.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
              No calendar events scheduled yet.
            </p>
          ) : (
            <div className="divide-y divide-[var(--border-color)]">
              {filteredEvents.map((e, i) => {
                if (!e.dueDate) return null;
                const d = parseISO(e.dueDate.split("T")[0]);
                const prev =
                  i > 0 && filteredEvents[i - 1].dueDate
                    ? parseISO(filteredEvents[i - 1].dueDate.split("T")[0])
                    : null;
                const showMonthHeader = !prev || format(d, "yyyy-MM") !== format(prev, "yyyy-MM");
                const catMeta = eventCalendarCategoryMeta(
                  normalizeEventCalendarCategory(e.category),
                );
                return (
                  <div key={e.id}>
                    {showMonthHeader ? (
                      <div className="bg-[var(--surface-dim)]/50 px-4 py-2 text-xs font-semibold text-[var(--text-muted)] sm:px-5">
                        {format(d, "MMMM yyyy")}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setSelectedEvent(e)}
                      className="flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-dim)]/40 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                    >
                      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        <span className="font-mono text-sm font-semibold tabular-nums text-[var(--text-main)]">
                          {format(new Date(e.dueDate), "EEE, MMM d, yyyy - h:mm a")}
                        </span>
                        <span
                          className={cn(
                            "inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide",
                            eventChipClass(e),
                          )}
                        >
                          {e.externalSource ? "External" : catMeta.label}
                        </span>
                      </div>
                      <p className="truncate text-sm font-medium text-[var(--text-main)] sm:max-w-[55%] sm:text-right">
                        {e.title}
                      </p>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className={cn(CRM_PANEL, "p-4")}>
              <h3 className="text-sm font-semibold text-[var(--text-main)]">Event</h3>
              <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
                Drag and drop your event or click in the calendar
              </p>
              {onCreateEvent ? (
                <KitButton className="mt-4 w-full gap-2" onClick={() => handleAddEvent()}>
                  <Plus className="h-4 w-4" />
                  Create New Event
                </KitButton>
              ) : null}
            </div>

            <div className={cn(CRM_PANEL, "p-4")}>
              <ul className="space-y-2">
                {EVENT_CALENDAR_SIDEBAR_FILTERS.map((filter) => {
                  const active = activeFilters.has(filter.key);
                  return (
                    <li key={filter.key}>
                      <button
                        type="button"
                        onClick={() => toggleFilter(filter.key)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-[var(--surface-dim)] text-[var(--text-main)]"
                            : "text-[var(--text-muted)] hover:bg-[var(--surface-dim)]/60 hover:text-[var(--text-main)]",
                        )}
                      >
                        <span
                          className={cn(
                            "h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-offset-1 ring-offset-[var(--card-bg)]",
                            filter.dotClass,
                            active ? "ring-[var(--border-color)]" : "opacity-40 ring-transparent",
                          )}
                        />
                        {filter.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className={cn(CRM_PANEL, "overflow-hidden")}>
              <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
                <h3 className="text-sm font-semibold text-[var(--text-main)]">Upcoming Event</h3>
                <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-[6px] bg-[var(--primary-light)] px-1.5 py-0.5 text-xs font-semibold tabular-nums text-[var(--primary)]">
                  {upcoming.length}
                </span>
              </div>
              <ul className="max-h-[min(360px,50vh)] divide-y divide-[var(--border-color)] overflow-y-auto">
                {upcoming.length === 0 ? (
                  <li className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                    No upcoming events
                  </li>
                ) : (
                  upcoming.map((h, i) => {
                    const catMeta = eventCalendarCategoryMeta(
                      normalizeEventCalendarCategory(h.category),
                    );
                    return (
                      <li key={h.id || i}>
                        <button
                          type="button"
                          onClick={() => setSelectedEvent(h)}
                          className="w-full px-4 py-3 text-left transition-colors hover:bg-[var(--surface-dim)]/50"
                        >
                          <p className="truncate text-sm font-semibold text-[var(--text-main)]">
                            {h.title}
                          </p>
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            {format(parseISO(h.dueDate.split("T")[0]), "dd MMM yyyy")}
                            {h.externalSource ? " · External" : ` · ${catMeta.label}`}
                          </p>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </aside>

          <div className={cn(CRM_PANEL, "overflow-hidden")}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3 sm:px-5">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-muted)] shadow-[var(--crm-shadow-input)] transition-colors hover:bg-[var(--background)] hover:text-[var(--text-main)]"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-muted)] shadow-[var(--crm-shadow-input)] transition-colors hover:bg-[var(--background)] hover:text-[var(--text-main)]"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <h2 className="text-base font-semibold text-[var(--text-main)]">
                {format(currentMonth, "MMMM yyyy")}
              </h2>
              <button
                type="button"
                onClick={() => setCurrentMonth(new Date())}
                className="text-xs font-semibold text-[var(--primary)] hover:underline"
              >
                Today
              </button>
            </div>

            <div className="grid grid-cols-7 border-b border-[var(--border-color)] bg-[var(--surface-dim)]/40">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div
                  key={d}
                  className="py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]"
                >
                  {d}
                </div>
              ))}
            </div>

            <div className="grid auto-rows-fr grid-cols-7">
              {calendarDays.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const dayEvents = filteredEvents.filter((e) => e.dueDate?.startsWith(dateStr));
                const isCurrentMonth = isSameMonth(day, monthStart);
                const today = isToday(day);

                return (
                  <div
                    key={day.toString()}
                    onClick={() => onCreateEvent && handleAddEvent(day)}
                    className={cn(
                      "flex min-h-[108px] cursor-pointer flex-col border-b border-r border-[var(--border-color)]/60 p-1.5 transition-colors hover:bg-[var(--surface-dim)]/30",
                      !isCurrentMonth && "bg-[var(--surface-dim)]/25 text-[var(--text-muted)]",
                      today && "bg-[color-mix(in_srgb,var(--primary)_6%,var(--card-bg))]",
                      !onCreateEvent && "cursor-default",
                    )}
                  >
                    <span
                      className={cn(
                        "mb-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                        today
                          ? "bg-[var(--primary)] text-white shadow-sm"
                          : isCurrentMonth
                            ? "text-[var(--text-main)]"
                            : "text-[var(--text-muted)]",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    <div className="flex flex-col gap-1 overflow-hidden">
                      {dayEvents.slice(0, 3).map((ev, idx) => (
                        <button
                          key={ev.id || idx}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(ev);
                          }}
                          className={cn(
                            "truncate rounded-[4px] border px-1.5 py-0.5 text-left text-[11px] font-semibold leading-tight",
                            eventChipClass(ev),
                          )}
                          title={ev.title}
                        >
                          <span className="block truncate">{ev.title}</span>
                          <span className="mt-0.5 block truncate text-[9px] font-medium opacity-80">
                            {format(new Date(ev.dueDate), "h:mm a")}
                          </span>
                        </button>
                      ))}
                      {dayEvents.length > 3 ? (
                        <span className="px-1 text-[10px] font-semibold text-[var(--text-muted)]">
                          +{dayEvents.length - 3} more
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Add New Event</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <FieldLabel htmlFor="kit-cal-event-name" required>
                Event Name
              </FieldLabel>
              <FieldInput
                id="kit-cal-event-name"
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
                placeholder="Meeting with team..."
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel required>Event Date</FieldLabel>
                <div className="mt-1.5 flex h-[38px] items-center rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)]/40 px-3 text-sm font-medium text-[var(--text-main)]">
                  {format(selectedDate, "MMM d, yyyy")}
                </div>
              </div>
              <div>
                <FieldLabel htmlFor="kit-cal-event-time">Time</FieldLabel>
                <FieldInput
                  id="kit-cal-event-time"
                  type="time"
                  value={newEventTime}
                  onChange={(e) => setNewEventTime(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="kit-cal-event-category" required>
                Event Category
              </FieldLabel>
              <FieldSelect
                id="kit-cal-event-category"
                value={newEventCategory}
                onChange={(e) =>
                  setNewEventCategory(e.target.value as EventCalendarCategory)
                }
                className="mt-1.5"
              >
                {EVENT_CALENDAR_FORM_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </FieldSelect>
            </div>
            <div>
              <FieldLabel htmlFor="kit-cal-event-reminder">Reminder</FieldLabel>
              <FieldSelect
                id="kit-cal-event-reminder"
                value={reminderOption}
                onChange={(e) => setReminderOption(e.target.value)}
                className="mt-1.5"
              >
                <option value="none">No reminder</option>
                <option value="10">Follow-up · 10 minutes before</option>
                <option value="30">Follow-up · 30 minutes before</option>
                <option value="60">Follow-up · 1 hour before</option>
                <option value="1440">Follow-up · 1 day before</option>
                <option value="custom">Custom date and time</option>
              </FieldSelect>
            </div>
            {reminderOption === "custom" ? (
              <div className="grid gap-4 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)]/30 p-3">
                <div>
                  <FieldLabel htmlFor="kit-cal-custom-reminder-at" required>
                    Remind me at
                  </FieldLabel>
                  <FieldInput
                    id="kit-cal-custom-reminder-at"
                    type="datetime-local"
                    value={customReminderAt}
                    onChange={(e) => setCustomReminderAt(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="kit-cal-custom-reminder-message">
                    Reminder message
                  </FieldLabel>
                  <FieldInput
                    id="kit-cal-custom-reminder-message"
                    value={customReminderMessage}
                    onChange={(e) => setCustomReminderMessage(e.target.value)}
                    placeholder="Call the client about the proposal..."
                    className="mt-1.5"
                  />
                </div>
              </div>
            ) : null}
            <div>
              <FieldLabel htmlFor="kit-cal-event-notes">Notes</FieldLabel>
              <FieldTextarea
                id="kit-cal-event-notes"
                value={newEventDesc}
                onChange={(e) => setNewEventDesc(e.target.value)}
                placeholder="Optional details..."
                className="mt-1.5 min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <KitButton variant="secondary" onClick={() => setShowAddModal(false)}>
              Cancel
            </KitButton>
            <KitButton
              onClick={() => void submitEvent()}
              disabled={
                !newEventTitle.trim() ||
                creating ||
                (reminderOption === "custom" && !customReminderAt)
              }
              loading={creating}
            >
              Add Event
            </KitButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedEvent)}
        onOpenChange={(open) => !open && setSelectedEvent(null)}
      >
        <DialogContent className="sm:max-w-[440px]">
          {selectedEvent ? (
            <>
              <DialogHeader>
                <DialogTitle>{selectedEvent.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    When
                  </p>
                  <p className="mt-1 font-medium text-[var(--text-main)]">
                    {format(new Date(selectedEvent.dueDate), "EEE, MMM d, yyyy")}
                  </p>
                  <p className="text-[var(--text-muted)]">
                    {format(new Date(selectedEvent.dueDate), "h:mm a")}
                  </p>
                </div>
                {selectedEvent.externalSource ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Source
                    </p>
                    <p className="mt-1 capitalize text-[var(--text-main)]">
                      {selectedEvent.externalSource}
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Category
                    </p>
                    <span
                      className={cn(
                        "mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-bold uppercase",
                        eventChipClass(selectedEvent),
                      )}
                    >
                      {
                        eventCalendarCategoryMeta(
                          normalizeEventCalendarCategory(selectedEvent.category),
                        ).label
                      }
                    </span>
                  </div>
                )}
                {selectedEvent.content ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Notes
                    </p>
                    <p className="mt-1 text-[var(--text-main)]">{selectedEvent.content}</p>
                  </div>
                ) : null}
                {selectedEvent.reminderAt ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Reminder
                    </p>
                    <p className="mt-1 font-medium text-[var(--text-main)]">
                      {format(new Date(selectedEvent.reminderAt), "EEE, MMM d, yyyy · h:mm a")}
                    </p>
                    {selectedEvent.reminderMessage ? (
                      <p className="mt-0.5 text-[var(--text-muted)]">
                        {selectedEvent.reminderMessage}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <DialogFooter>
                <KitButton variant="secondary" onClick={() => setSelectedEvent(null)}>
                  Close
                </KitButton>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** @deprecated Prefer `EventCalendar` */
export const KitEventCalendar = EventCalendar;
