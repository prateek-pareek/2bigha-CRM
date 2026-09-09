"use client";

import Link from "next/link";
import { Bell, ChevronLeft } from "lucide-react";
import CrmRemindersAndPrefs from "@/components/crm/notifications/CrmRemindersAndPrefs";

export default function NotificationSettingsPage() {
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
            Choose which events alert you in-app and by email. Managers and team leads
            can review team follow-ups below.{" "}
            <Link href="/crm/notifications" className="text-[var(--hs-link)] hover:underline">
              Open notification inbox
            </Link>
          </p>
        </div>
      </div>
      <CrmRemindersAndPrefs />
    </div>
  );
}
