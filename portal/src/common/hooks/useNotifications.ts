"use client";

import { useCallback, useEffect, useState } from "react";
import api from '@/lib/suite/api';
import type { AppNotification } from "@/lib/notifications/notification-utils";

type UseNotificationsOptions = {
  limit?: number;
  enabled?: boolean;
};

export function useNotifications({
  limit = 20,
  enabled = true,
}: UseNotificationsOptions = {}) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!enabled) return;
    try {
      const { data } = await api.get("/notifications/me", {
        params: { limit },
      });
      setNotifications(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      setLoading(false);
    }
  }, [enabled, limit]);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    void fetchNotifications();
  }, [enabled, fetchNotifications]);

  // WebSocket delivery is the fast path. Poll as a lightweight fallback so a brief socket
  // disconnect never requires the user to open Inbox or refresh the page to see new mail.
  useEffect(() => {
    if (!enabled) return;
    const interval = window.setInterval(() => {
      void fetchNotifications();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [enabled, fetchNotifications]);

  useEffect(() => {
    if (!enabled) return;
    const onRealtimeEvent = (event: Event) => {
      const custom = event as CustomEvent<{
        event?: string;
        payload?: { type?: string };
      }>;
      if (
        custom.detail?.event === "notification" ||
        custom.detail?.event === "crm:inbox:refresh" ||
        custom.detail?.payload?.type === "CRM_EMAIL_OPENED" ||
        custom.detail?.payload?.type === "CRM_EMAIL_CLICKED"
      ) {
        void fetchNotifications();
      }
    };
    window.addEventListener("crm:realtime-event", onRealtimeEvent as EventListener);
    return () =>
      window.removeEventListener("crm:realtime-event", onRealtimeEvent as EventListener);
  }, [enabled, fetchNotifications]);

  useEffect(() => {
    if (!enabled) return;
    const onRefresh = () => {
      void fetchNotifications();
    };
    window.addEventListener("notifications:refresh", onRefresh);
    return () => window.removeEventListener("notifications:refresh", onRefresh);
  }, [enabled, fetchNotifications]);

  const markAsRead = useCallback(async (id: string) => {
    await api.patch(`/notifications/${id}/read`);
    setNotifications((prev) =>
      prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)),
    );
    window.dispatchEvent(new CustomEvent("notifications:refresh"));
  }, []);

  const markAllAsRead = useCallback(async () => {
    await api.patch("/notifications/me/read-all");
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    window.dispatchEvent(new CustomEvent("notifications:refresh"));
  }, []);

  const clearAll = useCallback(async () => {
    await api.delete("/notifications/me");
    setNotifications([]);
    window.dispatchEvent(new CustomEvent("notifications:refresh"));
  }, []);

  return {
    notifications,
    loading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    clearAll,
    unreadCount: notifications.filter((n) => !n.isRead).length,
  };
}
