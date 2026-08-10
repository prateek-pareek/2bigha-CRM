"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import clsx from "clsx";
import {
  Bell,
  CheckCheck,
  Loader2,
  Mail,
  MailOpen,
  Megaphone,
  Info,
  CheckCircle,
  Trash2,
  Inbox,
  Handshake,
  MousePointerClick,
} from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import {
  type AppNotification,
  isCrmNotification,
  isHrmsNotification,
  isPmNotification,
  notificationTypeLabel,
  navigateToNotification,
} from "@/lib/notifications/notification-utils";

type ProductContext = "crm" | "hrms" | "pm";
type FilterKey = "all" | "unread" | "product";

function getTypeIcon(notification: AppNotification) {
  const type = String(notification.type || "").toLowerCase();
  if (type.includes("email_opened") || type.includes("email_open")) {
    return <MailOpen className="h-4 w-4 text-emerald-600" />;
  }
  if (type.includes("email_clicked") || type.includes("link_clicked")) {
    return <MousePointerClick className="h-4 w-4 text-sky-600" />;
  }
  if (type.includes("email") || type.includes("inbox")) {
    return <Mail className="h-4 w-4 text-[var(--hs-link)]" />;
  }
  if (type === "announcement") {
    return <Megaphone className="h-4 w-4 text-[var(--hs-link)]" />;
  }
  if (type === "leave") {
    return <CheckCircle className="h-4 w-4 text-emerald-600" />;
  }
  if (type.startsWith("crm_")) {
    return <Handshake className="h-4 w-4 text-violet-600" />;
  }
  if (type === "reminder") {
    return <Inbox className="h-4 w-4 text-amber-600" />;
  }
  return <Info className="h-4 w-4 text-[var(--text-muted)]" />;
}

type NotificationsInboxProps = {
  product: ProductContext;
  limit?: number;
  compact?: boolean;
  onNavigate?: () => void;
  viewAllHref?: string;
  serverUnreadCount?: number;
};

export default function NotificationsInbox({
  product,
  limit = 100,
  compact = false,
  onNavigate,
  viewAllHref,
  serverUnreadCount,
}: NotificationsInboxProps) {
  const router = useRouter();
  // CRM page: default to CRM-only so admins are not staring at a mixed HRMS+email dump.
  const [filter, setFilter] = useState<FilterKey>(
    compact ? "all" : product === "crm" ? "product" : "all",
  );
  const {
    notifications,
    loading,
    markAsRead,
    markAllAsRead,
    clearAll,
    unreadCount,
  } = useNotifications({ limit: compact ? 20 : limit });

  const filtered = useMemo(() => {
    let list = [...notifications];
    if (filter === "unread") {
      list = list.filter((n) => !n.isRead);
    } else if (filter === "product") {
      list = list.filter((n) => {
        if (product === "crm") return isCrmNotification(n);
        if (product === "pm") return isPmNotification(n);
        return isHrmsNotification(n);
      });
    }
    return list;
  }, [filter, notifications, product]);

  const productUnread = useMemo(
    () =>
      notifications.filter((n) => {
        if (n.isRead) return false;
        if (product === "crm") return isCrmNotification(n);
        if (product === "pm") return isPmNotification(n);
        return isHrmsNotification(n);
      }).length,
    [notifications, product],
  );

  const handleClick = async (notification: AppNotification) => {
    if (!notification.isRead) {
      await markAsRead(notification._id);
    }
    onNavigate?.();
    navigateToNotification(router, notification, product);
  };

  const filterOptions: Array<{ key: FilterKey; label: string; count?: number }> = [
    { key: "all", label: "All" },
    { key: "unread", label: "Unread", count: serverUnreadCount ?? unreadCount },
    {
      key: "product",
      label: product === "crm" ? "CRM" : product === "pm" ? "Projects" : "HRMS",
      count: productUnread,
    },
  ];

  if (compact) {
    return (
      <div className="w-80 max-h-[400px] overflow-hidden bg-[var(--card-bg)] rounded-2xl shadow-2xl border border-[var(--border-color)] flex flex-col">
        <CompactHeader unreadCount={serverUnreadCount ?? unreadCount} />
        <NotificationRows
          loading={loading}
          items={filtered.slice(0, 20)}
          onItemClick={(n) => void handleClick(n)}
          compact
        />
        {viewAllHref ? (
          <Link
            href={viewAllHref}
            onClick={onNavigate}
            className="block border-t border-[var(--border-color)] px-4 py-2.5 text-center text-xs font-semibold text-[var(--hs-link)] hover:bg-[var(--surface-dim)]"
          >
            View all notifications
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        subtitle={
          product === "crm"
            ? "Inbox replies, email opens, tasks, and CRM alerts in one place."
            : "Leave updates, announcements, policies, and HR alerts."
        }
        unreadCount={serverUnreadCount ?? unreadCount}
        onMarkAllRead={(serverUnreadCount ?? unreadCount) > 0 ? () => void markAllAsRead() : undefined}
        onClearAll={notifications.length > 0 ? () => void clearAll() : undefined}
      />

      <div className="rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] shadow-[0_1px_2px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[var(--surface-dim)] bg-[var(--surface-dim)]">
          {filterOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setFilter(opt.key)}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                filter === opt.key
                  ? "bg-[#fff3ef] text-[#b94b36]"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-dim)]",
              )}
            >
              {opt.label}
              {opt.count != null && opt.count > 0 ? (
                <span className="rounded-full bg-[var(--hs-link)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {opt.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <NotificationRows
          loading={loading}
          items={filtered}
          onItemClick={(n) => void handleClick(n)}
        />
      </div>
    </div>
  );
}

function CompactHeader({ unreadCount }: { unreadCount: number }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-color)]">
      <span className="text-xs font-bold text-[var(--text-main)] uppercase tracking-widest">
        Notifications
      </span>
      <span className="text-xs text-[var(--text-muted)]">{unreadCount} unread</span>
    </div>
  );
}

function PageHeader({
  subtitle,
  unreadCount,
  onMarkAllRead,
  onClearAll,
}: {
  subtitle?: string;
  unreadCount: number;
  onMarkAllRead?: () => void;
  onClearAll?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--surface-dim)] text-[var(--text-main)]">
          <Bell className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-[22px] sm:text-[24px] font-semibold tracking-tight text-[var(--text-main)]">
            Notifications
          </h1>
          {subtitle ? (
            <p className="text-sm text-[var(--text-muted)] mt-1 max-w-xl">{subtitle}</p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {unreadCount > 0 ? (
          <span className="text-xs font-medium text-[var(--text-muted)]">{unreadCount} unread</span>
        ) : (
          <span className="text-xs font-medium text-emerald-700">All caught up</span>
        )}
        {onMarkAllRead ? (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[var(--border-color)] text-xs font-semibold hover:bg-[var(--surface-dim)]"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </button>
        ) : null}
        {onClearAll ? (
          <button
            type="button"
            onClick={onClearAll}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[var(--border-color)] text-xs font-semibold text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear all
          </button>
        ) : null}
      </div>
    </div>
  );
}

function NotificationRows({
  loading,
  items,
  onItemClick,
  compact,
}: {
  loading: boolean;
  items: AppNotification[];
  onItemClick: (n: AppNotification) => void;
  compact?: boolean;
}) {
  if (loading) {
    return (
      <div className={clsx("flex items-center justify-center", compact ? "h-40" : "h-56")}>
        <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={clsx("text-center text-[var(--text-muted)]", compact ? "py-8 px-4" : "py-16 px-6")}>
          <Bell className="h-8 w-8 mx-auto opacity-40 mb-3" />
          <p className="text-sm font-medium">No notifications</p>
          <p className="text-xs mt-1 opacity-80">You&apos;re all caught up for this filter.</p>
      </div>
    );
  }

  return (
    <ul className={clsx("divide-y divide-[var(--surface-dim)]", compact ? "overflow-y-auto max-h-[320px]" : "")}>
      {items.map((n) => (
        <li key={n._id}>
          <button
            type="button"
            onClick={() => onItemClick(n)}
            className={clsx(
              "w-full text-left transition-colors",
              compact ? "p-3 hover:bg-[var(--surface-dim)]" : "px-4 py-4 hover:bg-[var(--background)]",
              n.isRead ? "opacity-70" : "bg-[var(--surface-dim)]",
            )}
          >
            <div className="flex gap-3">
              <div className="mt-0.5 shrink-0">{getTypeIcon(n)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[var(--text-main)] leading-snug">{n.title}</h3>
                    {!n.isRead ? (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--hs-link)]" />
                    ) : null}
                  </div>
                  <p className="text-sm text-[var(--text-muted)] mt-0.5 line-clamp-2">{n.message}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                    <span className="font-medium uppercase tracking-wide">
                      {notificationTypeLabel(n.type)}
                    </span>
                    {n.createdAt ? (
                      <>
                        <span aria-hidden>·</span>
                        <time dateTime={n.createdAt}>
                          {format(new Date(n.createdAt), "MMM d, yyyy · h:mm a")}
                        </time>
                      </>
                    ) : null}
                  </div>
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
