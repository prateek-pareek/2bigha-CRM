"use client";

import { useState } from "react";
import { Clock3 } from "lucide-react";
import { HS_PANEL } from "./panel-styles";
import { cn } from "@/lib/utils";
import type { PortalUpdateItem } from "./types";

export function PortalUpdatesSection({ updates }: { updates?: PortalUpdateItem[] }) {
  const [activeTab, setActiveTab] = useState<"daily" | "weekly" | "general">("daily");
  const rows = Array.isArray(updates) ? updates : [];
  
  const filteredRows = rows.filter(u => u.cadence === activeTab || (activeTab === "general" && !['daily', 'weekly'].includes(u.cadence)));

  return (
    <section id="portal-updates" className={cn(HS_PANEL, "scroll-mt-28 p-5 md:p-6 md:scroll-mt-24")}>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--surface-dim)] pb-3">
        <h2 className="text-[16px] font-semibold tracking-tight text-[var(--text-main)]">Progress updates</h2>
      </div>
      
      <div className="flex items-center gap-4 mt-3 border-b border-[var(--surface-dim)]">
        {(["daily", "weekly", "general"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "pb-2 text-sm font-semibold tracking-wide capitalize transition-colors",
              activeTab === tab ? "text-[var(--hs-link)] border-b-2 border-[var(--hs-link)]" : "text-[var(--primary-muted)] hover:text-[var(--text-muted)]"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {filteredRows.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--text-muted)]">No {activeTab} updates shared yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {filteredRows.map((u) => (
            <article key={u._id} className="rounded-md border border-[var(--surface-dim)] bg-[#fafbfc] p-4 transition-colors hover:bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--text-main)]">{u.title || "Update"}</h3>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-muted)]">{u.body}</p>
              <div className="mt-3 flex items-center gap-2 text-xs text-[var(--primary-muted)]">
                <Clock3 size={12} />
                <span>
                  {u.createdAt ? new Date(u.createdAt).toLocaleString() : "—"} · {u.createdByName || "Project team"}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
