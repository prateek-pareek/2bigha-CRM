import { useEffect, useRef } from "react";

type RealtimeDetail = {
  event?: string;
  payload?: {
    type?: string;
    entityId?: string;
    module?: string;
    metadata?: { entityId?: string; module?: string };
  };
};

const DEFAULT_POLL_MS = 12_000;

/** Refetch email tracking on CRM opens/clicks and via short polling while the page is visible. */
export function useCrmEmailTrackingRealtimeRefresh(
  onRefresh: () => void,
  entityId?: string | null,
  options?: { enabled?: boolean; pollMs?: number },
) {
  const onRefreshRef = useRef(onRefresh);
  const enabled = options?.enabled !== false;
  const pollMs = options?.pollMs ?? DEFAULT_POLL_MS;

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return;

    const maybeRefresh = (payload?: RealtimeDetail["payload"]) => {
      const metaEntityId =
        payload?.entityId || payload?.metadata?.entityId || undefined;
      if (
        entityId &&
        metaEntityId &&
        String(metaEntityId) !== String(entityId)
      ) {
        return;
      }
      onRefreshRef.current();
    };

    const listener = (event: Event) => {
      const detail = (event as CustomEvent<RealtimeDetail>).detail;
      const kind = detail?.event;
      const payload = detail?.payload;
      const eventType = payload?.type;
      const isEngagementEvent =
        kind === "crm:inbox:refresh" ||
        kind === "notification" ||
        eventType === "CRM_EMAIL_OPENED" ||
        eventType === "CRM_EMAIL_CLICKED";
      if (!isEngagementEvent) return;
      maybeRefresh(payload);
    };

    window.addEventListener("crm:realtime-event", listener as EventListener);

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (pollTimer) return;
      pollTimer = setInterval(() => {
        if (document.visibilityState !== "visible") return;
        onRefreshRef.current();
      }, pollMs);
    };
    const stopPolling = () => {
      if (!pollTimer) return;
      clearInterval(pollTimer);
      pollTimer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        onRefreshRef.current();
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (document.visibilityState === "visible") {
      startPolling();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("crm:realtime-event", listener as EventListener);
      document.removeEventListener("visibilitychange", onVisibility);
      stopPolling();
    };
  }, [enabled, entityId, pollMs]);
}
