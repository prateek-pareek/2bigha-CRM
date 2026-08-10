"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronLeft, ChevronDown, Check, Link2, Loader2, Trash2, FileText, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from '@/lib/crm/config';
import { PM_API_URL } from '@/lib/api/config';

type WikiLinkRow = {
  type: "space" | "page";
  spaceId: string;
  pageId?: string;
  title: string;
  urlPath: string;
};

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") : "";
}

function flattenWikiPages(nodes: unknown[]): Array<{ _id: string; title: string }> {
  const out: Array<{ _id: string; title: string }> = [];
  const visit = (list: unknown[]) => {
    for (const n of list || []) {
      if (!n || typeof n !== "object") continue;
      const o = n as { _id?: string; title?: string; children?: unknown[] };
      out.push({ _id: String(o._id || ""), title: o.title || "Untitled page" });
      if (Array.isArray(o.children) && o.children.length) visit(o.children as unknown[]);
    }
  };
  visit(nodes || []);
  return out;
}

function SimpleSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((p) => !p)}
        className={`flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 text-sm transition-all ${
          disabled
            ? "cursor-not-allowed border-[var(--surface-dim)] bg-[var(--background)] text-[#b0c4d8]"
            : open
              ? "border-[var(--hs-link)] bg-[#fff8f6] ring-1 ring-[var(--hs-link)]/20"
              : "border-[var(--border-color)] bg-white text-[var(--text-main)] hover:border-[var(--hs-link)]/60 hover:bg-[#fff8f6]"
        }`}
      >
        <span className={selected ? "text-[var(--text-main)]" : "text-[#b0c4d8]"}>
          {selected?.label ?? placeholder ?? "Select…"}
        </span>
        <ChevronDown
          size={13}
          className={`shrink-0 transition-transform ${open && !disabled ? "rotate-180 text-[var(--hs-link)]" : "text-[#b0c4d8]"}`}
        />
      </button>
      {open && !disabled && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-[var(--border-color)] bg-white shadow-[0_4px_16px_rgba(0,0,0,0.10)]">
          {options.length === 0 ? (
            <p className="px-3 py-3 text-xs text-[var(--primary-muted)]">No options</p>
          ) : (
            options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`flex w-full items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-[#fff3ef] hover:text-[#b94b36] ${
                  o.value === value ? "bg-[#fff3ef] font-medium text-[#b94b36]" : "text-[var(--text-main)]"
                }`}
              >
                <span className="truncate">{o.label}</span>
                {o.value === value && <Check size={12} className="shrink-0 text-[var(--hs-link)]" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function CrmWikiSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [wikiLinks, setWikiLinks] = useState<WikiLinkRow[]>([]);
  const [wikiSpaces, setWikiSpaces] = useState<{ _id: string; name: string }[]>([]);
  const [loadingSpaces, setLoadingSpaces] = useState(true);
  const [attachType, setAttachType] = useState<"space" | "page">("space");
  const [selectedWikiSpaceId, setSelectedWikiSpaceId] = useState("");
  const [selectedWikiPageId, setSelectedWikiPageId] = useState("");
  const [wikiPagesTree, setWikiPagesTree] = useState<unknown[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);

  const flatWikiPages = useMemo(() => flattenWikiPages(wikiPagesTree), [wikiPagesTree]);

  const loadCrmLinks = useCallback(async () => {
    const res = await fetch(`${CRM_API_URL}/crm/settings/wiki-links`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error("Failed to load CRM wiki links");
    const data = await res.json();
    const raw = data?.wikiLinks;
    setWikiLinks(Array.isArray(raw) ? raw : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await loadCrmLinks();
      } catch {
        if (!cancelled) toast.error("Could not load wiki links");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadCrmLinks]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingSpaces(true);
      try {
        const res = await fetch(`${PM_API_URL}/wiki/spaces`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) throw new Error("wiki spaces");
        const data = await res.json();
        if (!cancelled) setWikiSpaces(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) {
          setWikiSpaces([]);
          toast.error("Could not load wiki spaces. Check PM wiki access.");
        }
      } finally {
        if (!cancelled) setLoadingSpaces(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedWikiSpaceId) {
      setWikiPagesTree([]);
      setSelectedWikiPageId("");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingPages(true);
      try {
        const res = await fetch(
          `${PM_API_URL}/wiki/pages?spaceId=${encodeURIComponent(selectedWikiSpaceId)}&tree=true`,
          { headers: { Authorization: `Bearer ${getToken()}` } },
        );
        if (!res.ok) throw new Error("pages");
        const data = await res.json();
        if (!cancelled) {
          setWikiPagesTree(Array.isArray(data) ? data : []);
          setSelectedWikiPageId("");
        }
      } catch {
        if (!cancelled) {
          setWikiPagesTree([]);
          toast.error("Could not load pages for this space");
        }
      } finally {
        if (!cancelled) setLoadingPages(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedWikiSpaceId]);

  const persistLinks = async (next: WikiLinkRow[]) => {
    setSaving(true);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/settings/wiki-links`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ wikiLinks: next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || "Save failed");
      }
      const data = await res.json();
      const raw = data?.wikiLinks;
      setWikiLinks(Array.isArray(raw) ? raw : next);
      toast.success("Wiki links saved");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const handleAttach = () => {
    const selectedSpace = wikiSpaces.find((s) => s._id === selectedWikiSpaceId);
    if (!selectedSpace) { toast.error("Select a wiki space"); return; }
    const next = [...wikiLinks];
    if (attachType === "space") {
      if (next.some((l) => l.type === "space" && l.spaceId === selectedWikiSpaceId)) {
        toast.info("Space already attached"); return;
      }
      next.push({ type: "space", spaceId: selectedWikiSpaceId, title: selectedSpace.name, urlPath: `/pm/wiki/${selectedWikiSpaceId}` });
    } else {
      const selectedPage = flatWikiPages.find((p) => p._id === selectedWikiPageId);
      if (!selectedPage) { toast.error("Select a wiki page"); return; }
      if (next.some((l) => l.type === "page" && l.pageId === selectedWikiPageId)) {
        toast.info("Page already attached"); return;
      }
      next.push({ type: "page", spaceId: selectedWikiSpaceId, pageId: selectedWikiPageId, title: selectedPage.title, urlPath: `/pm/wiki/${selectedWikiSpaceId}/${selectedWikiPageId}` });
    }
    void persistLinks(next);
  };

  const handleRemove = (index: number) => {
    void persistLinks(wikiLinks.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-5 pb-8">
      <div className="overflow-hidden rounded-md border border-[var(--border-color)] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)]">

        {/* Page header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--surface-dim)] bg-[var(--surface-dim)] px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/crm/settings"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border-color)] bg-white text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-dim)]"
            >
              <ChevronLeft size={16} />
            </Link>
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--hs-link)]/10">
              <BookOpen className="h-4 w-4 text-[var(--hs-link)]" />
            </div>
            <div>
              <h1 className="text-[16px] font-semibold text-[var(--text-main)]">Wiki</h1>
              <p className="text-xs text-[var(--primary-muted)]">
                Attach spaces or pages from{" "}
                <Link href="/pm/wiki" className="font-semibold text-[var(--hs-link)] hover:underline">
                  PM → Wiki
                </Link>{" "}
                — managed content appears as CRM shortcuts
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2.5 py-16 text-sm text-[var(--primary-muted)]">
              <Loader2 size={16} className="animate-spin text-[var(--hs-link)]" />
              Loading wiki links…
            </div>
          ) : (
            <>
              {/* Add attachment panel */}
              <div className="overflow-hidden rounded-md border border-[var(--border-color)] bg-white">
                <div className="flex items-center gap-2 border-b border-[var(--surface-dim)] bg-[var(--surface-dim)] px-5 py-3">
                  <div className="h-1.5 w-1.5 rounded-full bg-[var(--hs-link)]" />
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">Add Attachment</p>
                </div>

                <div className="p-5 space-y-4">
                  {/* Type toggle */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">Attach type</p>
                    <div className="flex gap-2">
                      {(["space", "page"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setAttachType(t)}
                          className={`flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-xs font-semibold capitalize transition-all ${
                            attachType === t
                              ? "border-[var(--hs-link)] bg-[#fff8f6] text-[var(--hs-link)] ring-1 ring-[var(--hs-link)]/20"
                              : "border-[var(--border-color)] bg-white text-[var(--text-muted)] hover:border-[var(--hs-link)]/50 hover:bg-[#fff8f6] hover:text-[var(--hs-link)]"
                          }`}
                        >
                          {t === "space" ? <FolderOpen size={13} /> : <FileText size={13} />}
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Selects row */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">Wiki space</p>
                      <SimpleSelect
                        value={selectedWikiSpaceId}
                        onChange={(v) => { setSelectedWikiSpaceId(v); setSelectedWikiPageId(""); }}
                        disabled={loadingSpaces}
                        placeholder={loadingSpaces ? "Loading spaces…" : "Select space"}
                        options={wikiSpaces.map((s) => ({ value: s._id, label: s.name }))}
                      />
                    </div>

                    {attachType === "page" ? (
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">Page</p>
                        <SimpleSelect
                          value={selectedWikiPageId}
                          onChange={setSelectedWikiPageId}
                          disabled={!selectedWikiSpaceId || loadingPages}
                          placeholder={loadingPages ? "Loading pages…" : "Select page"}
                          options={flatWikiPages.map((p) => ({ value: p._id, label: p.title }))}
                        />
                      </div>
                    ) : (
                      <div />
                    )}

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={handleAttach}
                        disabled={saving || !selectedWikiSpaceId || (attachType === "page" && !selectedWikiPageId)}
                        className="flex h-9 items-center gap-2 rounded-md bg-[var(--hs-link)] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#e8674a] disabled:opacity-50"
                      >
                        {saving ? <Loader2 size={13} className="animate-spin" /> : null}
                        Attach
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Attached links list */}
              <div className="overflow-hidden rounded-md border border-[var(--border-color)] bg-white">
                <div className="flex items-center gap-2 border-b border-[var(--surface-dim)] bg-[var(--surface-dim)] px-5 py-3">
                  <div className="h-1.5 w-1.5 rounded-full bg-[var(--hs-link)]" />
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">Attached Documentation</p>
                  {wikiLinks.length > 0 && (
                    <span className="ml-auto rounded-md bg-[var(--surface-dim)] px-2 py-0.5 text-xs font-semibold text-[var(--text-muted)]">
                      {wikiLinks.length}
                    </span>
                  )}
                </div>

                {wikiLinks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-12">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--background)]">
                      <BookOpen size={18} className="text-[var(--primary-muted)]" />
                    </div>
                    <p className="text-sm text-[var(--primary-muted)]">No wiki links yet. Attach a space or page above.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--surface-dim)]">
                    {wikiLinks.map((l, index) => (
                      <div
                        key={`${l.type}-${l.spaceId}-${l.pageId ?? index}`}
                        className="flex items-center justify-between gap-3 px-5 py-3"
                      >
                        <a
                          href={l.urlPath}
                          className="group flex min-w-0 items-center gap-2.5 hover:underline"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--background)] text-[var(--primary-muted)] group-hover:bg-[#fff3ef] group-hover:text-[var(--hs-link)] transition-colors">
                            {l.type === "space" ? <FolderOpen size={13} /> : <FileText size={13} />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold text-[var(--text-main)]">{l.title}</span>
                              <span className="shrink-0 rounded-md border border-[var(--surface-dim)] bg-[var(--background)] px-1.5 py-0.5 text-xs font-semibold uppercase text-[var(--text-muted)]">
                                {l.type}
                              </span>
                            </div>
                            <p className="flex items-center gap-1 text-xs text-[var(--primary-muted)]">
                              <Link2 size={10} className="shrink-0" />
                              <span className="truncate">{l.urlPath}</span>
                            </p>
                          </div>
                        </a>
                        <button
                          type="button"
                          onClick={() => handleRemove(index)}
                          disabled={saving}
                          className="shrink-0 rounded-md p-1.5 text-[var(--primary-muted)] transition-colors hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40"
                          title="Remove"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
