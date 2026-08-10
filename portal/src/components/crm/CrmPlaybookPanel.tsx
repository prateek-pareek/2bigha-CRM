"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  ChevronRight,
  ListChecks,
  Phone,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/api/config";
import { usePermissions } from "@/hooks/usePermissions";
import CrmPlaybookPreviewSheet from "@/components/crm/CrmPlaybookPreviewSheet";
import type { PlaybookPreviewPayload } from "@/components/crm/CrmPlaybookPreviewSheet";
import CrmPlaybookRunnerDialog from "@/components/crm/CrmPlaybookRunnerDialog";
import {
  playbookGuidancePreview,
  playbookHasRenderableBody,
} from "@/lib/crm/playbook-ui";
import type { PlaybookRunnerQuestionForm } from "@/lib/crm/playbook-types";
import { cn } from "@/lib/utils";

export type CrmPlaybookRelatedType =
  | "Lead"
  | "Deal"
  | "Contact"
  | "Organization"
  | "Client";

interface PlaybookItem {
  _id: string;
  name: string;
  description?: string;
  content?: string;
  status?: string;
  sections?: PlaybookPreviewPayload["sections"];
  runnerQuestions?: PlaybookRunnerQuestionForm[];
}

export default function CrmPlaybookPanel({
  relatedTo,
  relatedType,
  onApplied,
}: {
  relatedTo: string | undefined;
  relatedType: CrmPlaybookRelatedType;
  onApplied?: () => void;
}) {
  const router = useRouter();
  const { hasAccess } = usePermissions();
  const [list, setList] = useState<PlaybookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [active, setActive] = useState<{
    playbook: PlaybookPreviewPayload;
    id: string;
    runnerQuestions: PlaybookRunnerQuestionForm[];
  } | null>(null);
  const [runnerOpen, setRunnerOpen] = useState(false);
  const [runnerPlaybook, setRunnerPlaybook] = useState<PlaybookItem | null>(
    null,
  );

  useEffect(() => {
    if (!relatedTo) return;
    const token = localStorage.getItem("token");
    setLoading(true);
    const q = new URLSearchParams();
    q.set("appliesTo", relatedType);
    fetch(`${CRM_API_URL}/crm/playbooks?${q.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401) {
          router.push("/auth/login?error=unauthorized");
          return null;
        }
        return res.ok ? res.json() : [];
      })
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [relatedTo, relatedType, router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => {
      if (p.name.toLowerCase().includes(q)) return true;
      if ((p.description || "").toLowerCase().includes(q)) return true;
      if ((p.content || "").toLowerCase().includes(q)) return true;
      return false;
    });
  }, [list, search]);

  const canRun = hasAccess("activities:write");

  const openSheet = (p: PlaybookItem) => {
    setActive({
      id: p._id,
      playbook: {
        name: p.name,
        description: p.description,
        appliesTo: relatedType,
        content: p.content,
        status: p.status,
        sections: p.sections,
      },
      runnerQuestions: p.runnerQuestions || [],
    });
    setSheetOpen(true);
  };

  const openRunner = (p: PlaybookItem) => {
    if (p.status === "draft") {
      toast.message("Publish this playbook in Settings before running it live.");
      return;
    }
    setRunnerPlaybook(p);
    setRunnerOpen(true);
  };

  const apply = async (id: string) => {
    setApplyingId(id);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/playbooks/${id}/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ relatedTo, relatedType }),
      });
      if (res.status === 401) {
        router.push("/auth/login?error=unauthorized");
        return;
      }
      if (res.ok) {
        toast.success("Playbook logged to timeline");
        setSheetOpen(false);
        setActive(null);
        onApplied?.();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || "Could not apply playbook");
      }
    } finally {
      setApplyingId(null);
    }
  };

  if (!relatedTo) return null;

  if (loading) {
    return (
      <div className="rounded-md border border-[var(--border-color)] bg-white p-5 shadow-sm">
        <div className="mb-4 h-4 w-32 animate-pulse rounded-md bg-[var(--surface-dim)]" />
        <div className="mb-3 h-9 animate-pulse rounded-md bg-[var(--surface-dim)]" />
        <div className="h-16 animate-pulse rounded-md bg-[var(--surface-dim)]" />
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border border-[var(--border-color)] bg-white p-5 shadow-sm">
        <div className="mb-1 flex items-start justify-between gap-3">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            <ListChecks size={14} className="text-[var(--hs-link)]" aria-hidden />
            Playbooks
          </h3>
        </div>
        <p className="mb-4 text-xs font-medium leading-relaxed text-[var(--text-muted)]">
          Preview guidance, run live to capture answers mapped to CRM fields, or log
          the full playbook to the timeline.
        </p>

        {list.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--border-color)] bg-[var(--background)] px-4 py-6 text-center">
            <BookOpen className="mx-auto mb-2 h-8 w-8 text-[var(--primary-muted)] opacity-70" />
            <p className="text-sm font-semibold text-[var(--text-main)]">
              No playbooks for {relatedType}s
            </p>
            <p className="mb-3 mt-1 text-xs text-[var(--text-muted)]">
              Admins can publish playbooks that apply to this record type.
            </p>
            <Link
              href="/crm/playbooks"
              className="text-xs font-semibold text-[var(--hs-link)] hover:underline"
            >
              Browse all playbooks
            </Link>
          </div>
        ) : (
          <>
            <div className="relative mb-3">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--primary-muted)]"
                aria-hidden
              />
              <input
                type="search"
                placeholder="Search playbooks…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-[var(--border-color)] bg-white py-2 pl-8 pr-3 text-xs text-[var(--text-main)] placeholder:text-[var(--primary-muted)] outline-none transition-[border-color,box-shadow] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/35"
              />
            </div>

            <ul className="max-h-[min(420px,50vh)] space-y-2 overflow-y-auto pr-0.5">
              {filtered.length === 0 ? (
                <li className="py-6 text-center text-xs text-[var(--text-muted)]">
                  No matches—try another search.
                </li>
              ) : (
                filtered.map((p) => {
                  const preview = playbookGuidancePreview(p.content);
                  const nQ = (p.runnerQuestions || []).length;
                  return (
                    <li key={p._id}>
                      <div
                        className={cn(
                          "flex w-full flex-col gap-2 rounded-md border border-[var(--border-color)] bg-[var(--background)] px-3 py-2.5",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => openSheet(p)}
                          className="flex w-full items-center gap-3 text-left transition-colors hover:opacity-90"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border-color)] bg-white text-[var(--hs-link)]">
                            <BookOpen className="h-4 w-4" aria-hidden />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[var(--text-main)]">
                              {p.name}
                              {p.status === "draft" ? (
                                <span className="ml-1.5 text-xs font-bold uppercase text-[#7c5c0a]">
                                  Draft
                                </span>
                              ) : null}
                            </p>
                            <p className="line-clamp-2 text-xs font-medium leading-snug text-[var(--text-muted)]">
                              {preview || "Structured playbook"}
                              {nQ > 0
                                ? ` · ${nQ} live question${nQ === 1 ? "" : "s"}`
                                : ""}
                            </p>
                          </div>
                          <ChevronRight
                            className="h-4 w-4 shrink-0 text-[var(--primary-muted)]"
                            aria-hidden
                          />
                        </button>
                        {canRun && p.status !== "draft" ? (
                          <button
                            type="button"
                            onClick={() => openRunner(p)}
                            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--hs-link)]/40 bg-white py-1.5 text-xs font-semibold text-[var(--hs-link)] hover:bg-[#e0f4f7]"
                          >
                            <Phone className="h-3.5 w-3.5" aria-hidden />
                            Live run (popup)
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })
              )}
            </ul>

            {!canRun && list.length > 0 ? (
              <p className="mt-3 border-t border-[var(--border-color)] pt-3 text-xs leading-relaxed text-[var(--text-muted)]">
                Preview only. Running or logging requires{" "}
                <code className="rounded-md bg-[var(--surface-dim)] px-1 text-[9px] text-[var(--text-main)]">
                  activities:write
                </code>
                .
              </p>
            ) : null}
          </>
        )}
      </div>

      <CrmPlaybookPreviewSheet
        open={sheetOpen}
        onOpenChange={(o) => {
          setSheetOpen(o);
          if (!o) setActive(null);
        }}
        playbook={active?.playbook ?? null}
        applyFooter={
          active && canRun
            ? {
                onApply: () => void apply(active.id),
                applying: applyingId === active.id,
                disabled:
                  active.playbook.status === "draft" ||
                  !playbookHasRenderableBody(
                    active.playbook.content,
                    active.playbook.sections,
                  ),
              }
            : undefined
        }
      />

      {runnerPlaybook && relatedTo ? (
        <CrmPlaybookRunnerDialog
          open={runnerOpen}
          onOpenChange={(o) => {
            setRunnerOpen(o);
            if (!o) setRunnerPlaybook(null);
          }}
          playbookId={runnerPlaybook._id}
          playbookName={runnerPlaybook.name}
          relatedTo={relatedTo}
          relatedType={relatedType}
          questions={runnerPlaybook.runnerQuestions || []}
          onComplete={() => onApplied?.()}
        />
      ) : null}
    </>
  );
}
