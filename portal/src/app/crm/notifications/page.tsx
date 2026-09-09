"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell, Settings2 } from "lucide-react";
import NotificationsInbox from "@/components/notifications/NotificationsInbox";
import CrmRemindersAndPrefs from "@/components/crm/notifications/CrmRemindersAndPrefs";

const TABS = [
  { id: "inbox", label: "Inbox" },
  { id: "reminders", label: "Reminders" },
  { id: "preferences", label: "Preferences" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function CrmNotificationsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = useMemo<TabId>(() => {
    const raw = String(searchParams.get("tab") || "inbox").toLowerCase();
    if (raw === "reminders" || raw === "preferences") return raw;
    return "inbox";
  }, [searchParams]);

  const setTab = (next: TabId) => {
    const qs = new URLSearchParams(searchParams.toString());
    if (next === "inbox") qs.delete("tab");
    else qs.set("tab", next);
    const suffix = qs.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <div className="flex items-start gap-3">
        <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--surface-dim)] text-[var(--text-main)]">
          <Bell className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-semibold tracking-tight text-[var(--text-main)]">
            Notifications & reminders
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Follow-ups, callbacks, tasks, and custom reminders — plus how they are delivered.
          </p>
        </div>
        <Link
          href="/crm/settings/notifications"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border-color)] px-2.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-dim)]"
        >
          <Settings2 size={13} />
          Settings
        </Link>
      </div>

      <div className="flex gap-1 rounded-lg border border-[var(--border-color)] bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? "flex-1 rounded-md bg-[var(--surface-dim)] px-3 py-1.5 text-sm font-semibold text-[var(--text-main)]"
                : "flex-1 rounded-md px-3 py-1.5 text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--surface-dim)]/60"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "inbox" ? (
        <NotificationsInbox product="crm" hidePageHeader />
      ) : tab === "reminders" ? (
        <CrmRemindersAndPrefs mode="reminders" />
      ) : (
        <CrmRemindersAndPrefs showHeading mode="prefs" />
      )}
    </div>
  );
}
