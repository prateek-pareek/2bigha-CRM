"use client";

import { usePathname } from "next/navigation";
import NotificationsInbox from "@/components/notifications/NotificationsInbox";
import { productFromPathname } from "@/lib/notifications/notification-utils";

export default function NotificationList({ onClose, serverUnreadCount }: { onClose?: () => void; serverUnreadCount?: number }) {
  const pathname = usePathname();
  const detected = productFromPathname(pathname);
  const product =
    detected === "auto" ? ("crm" as const) : detected;
  const viewAllHref =
    product === "crm"
      ? "/crm/notifications"
      : product === "pm"
        ? "/pm/notifications"
        : "/hrms/notifications";

  return (
    <NotificationsInbox
      product={product}
      compact
      onNavigate={onClose}
      viewAllHref={viewAllHref}
      serverUnreadCount={serverUnreadCount}
    />
  );
}
