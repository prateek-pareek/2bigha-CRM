"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/crm/api";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import {
  EventCalendar,
  type EventCalendarCreatePayload,
  type KitCalendarEvent,
} from "@mathionix/ui/kit/event-calendar";

type CrmCalendarApiEvent = {
  _id: string;
  title: string;
  content?: string;
  metadata?: {
    dueDate?: string;
    isCalendarEvent?: boolean;
    externalSource?: "google" | "outlook" | string;
    eventCategory?: string;
    reminderAt?: string;
    reminderType?: "follow_up" | "custom";
    reminderMessage?: string;
  };
  status?: string;
  authorName?: string;
};

type CalendarConnections = {
  google: boolean;
  outlook: boolean;
  needsReconnect?: { google: boolean; outlook: boolean };
};

function toKitEvent(e: CrmCalendarApiEvent): KitCalendarEvent | null {
  const dueDate = e.metadata?.dueDate;
  if (!dueDate) return null;
  return {
    id: e._id,
    title: e.title,
    content: e.content,
    dueDate,
    category: e.metadata?.eventCategory,
    externalSource: e.metadata?.externalSource,
    status: e.status,
    reminderAt: e.metadata?.reminderAt,
    reminderType: e.metadata?.reminderType,
    reminderMessage: e.metadata?.reminderMessage,
  };
}

/**
 * CRM workspace calendar — wires API + OAuth into the shared kit `EventCalendar`.
 */
export function CrmCalendar() {
  const { hasAccess } = usePermissions();
  const [internalEvents, setInternalEvents] = useState<CrmCalendarApiEvent[]>([]);
  const [externalEvents, setExternalEvents] = useState<CrmCalendarApiEvent[]>([]);
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
  const [creating, setCreating] = useState(false);

  const events = useMemo(() => {
    const mapped = [...internalEvents, ...externalEvents]
      .map(toKitEvent)
      .filter((e): e is KitCalendarEvent => Boolean(e));
    return mapped;
  }, [internalEvents, externalEvents]);

  const fetchInternalEvents = async () => {
    const res = await api.get("/crm/calendar-events");
    if (res.data) setInternalEvents(res.data);
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

  const handleCreate = async (payload: EventCalendarCreatePayload) => {
    try {
      setCreating(true);
      await api.post("/crm/calendar-events", {
        title: payload.title,
        content: payload.content,
        dueDate: payload.dueDate,
        metadata: {
          eventCategory: payload.category,
          reminderAt: payload.reminderAt,
          reminderType: payload.reminderType,
          reminderMessage: payload.reminderMessage,
          reminderDisabled: !payload.reminderAt,
        },
      });
      await fetchInternalEvents();
    } catch (err) {
      console.error("Failed to create event", err);
    } finally {
      setCreating(false);
    }
  };

  const notices = (
    <>
      {oauthNotice ? (
        <div
          className={cn(
            "rounded-[var(--radius-md)] border px-4 py-3 text-sm",
            oauthNotice.includes("failed")
              ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200",
          )}
        >
          {oauthNotice}
        </div>
      ) : null}
      {syncErrors.length > 0 ? (
        <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100">
          {syncErrors.map((msg, i) => (
            <p key={i}>{msg}</p>
          ))}
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300/90">
            Use Connect Google Calendar or Connect Outlook Calendar below and sign in again to
            restore access.
          </p>
        </div>
      ) : null}
    </>
  );

  return (
    <EventCalendar
      events={events}
      loading={loading}
      creating={creating}
      notices={notices}
      onCreateEvent={handleCreate}
      sync={{
        enabled: canSyncCalendar,
        googleConnected: hasGoogleConnected,
        outlookConnected: hasOutlookConnected,
        needsGoogleReconnect,
        needsOutlookReconnect,
        syncing,
        loadingConnections,
        startingOAuth,
        onConnectGoogle: () => void startCalendarOAuth("gmail"),
        onConnectOutlook: () => void startCalendarOAuth("outlook"),
        onSync: () => void Promise.all([fetchConnections(), syncExternalCalendar()]),
      }}
    />
  );
}
