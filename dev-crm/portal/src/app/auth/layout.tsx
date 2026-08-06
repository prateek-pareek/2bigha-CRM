"use client";

import { useEffect } from "react";
import { setBrowserTabIcon } from "@/lib/browser-tab-brand";
import { ThemeModeToggle } from "@/components/ThemeModeToggle";
import { crmSuiteShellClassName } from "@/lib/crm/shell";
import "@tabler/icons-webfont/dist/tabler-icons.min.css";
import "@/app/crm/crm-hubspot.css";

/** CRM-standalone auth shell — no PM/Jira CSS dependency. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setBrowserTabIcon("crm");
    document.title = "Mathionix CRM";
  }, []);

  return (
    <div
      data-crm-app
      data-crm-theme="crms"
      className={`${crmSuiteShellClassName} relative min-h-screen bg-[var(--background)] text-[var(--text-main)]`}
    >
      <div className="pointer-events-none fixed right-4 top-4 z-[100] md:right-6 md:top-6">
        <div className="pointer-events-auto rounded-[5px] border border-[var(--border-color)] bg-white p-0.5 shadow-sm">
          <ThemeModeToggle />
        </div>
      </div>
      {children}
    </div>
  );
}
