"use client";

import { useState, useEffect } from "react";
import { FileText, Search, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from '@/lib/crm/config';
import ActivityTimeline from "@/components/crm/inbox/ActivityTimeline";
import { useAuthStore } from "@/store/pm/auth-store";
import { isAdmin } from '@/lib/suite/auth';
import ActivityLogger from "@/components/crm/inbox/ActivityLogger";
import CRMFilterBar from "@/components/crm/segments/CRMFilterBar";
import { applyFilters, FilterCriteria, FilterProperty } from "@/lib/crm/filter-config";
import { cn } from "@/lib/utils";
import { CRM_LIST_PAGE, CRM_PANEL } from "@/lib/crm/ui";
import { CrmPageHeader, CrmCountBadge } from "@/components/crm/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Note {
  _id: string;
  type: string;
  content: string;
  title?: string;
  createdAt: string;
  author?: { name: string };
}

export default function NotesPage() {
  const { user } = useAuthStore();
  const allowActivityDelete = isAdmin(user as any);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [filters, setFilters] = useState<FilterCriteria[]>([]);
  const [filterProperties, setFilterProperties] = useState<FilterProperty[]>([]);
  const [search, setSearch] = useState("");

  const fetchNotes = async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/activities?type=Note`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const notesArray = Array.isArray(data) ? data : data.data || [];
      setNotes(notesArray);
    } catch (err) {
      console.error("Failed to fetch notes", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, []);

  const handleSaveActivity = async (payload: any) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${CRM_API_URL}/crm/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      toast.error("Could not save note");
      throw new Error("Save failed");
    }
    toast.success("Note added");
    fetchNotes();
  };

  const handleUpdateNote = async (payload: any) => {
    if (!editingNote) return;
    const id = editingNote._id;
    const token = localStorage.getItem("token");
    const res = await fetch(`${CRM_API_URL}/crm/activities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: payload.title, content: payload.content }),
    });
    if (!res.ok) {
      toast.error("Could not update note");
      throw new Error("Update failed");
    }
    toast.success("Note updated");
    setEditingNote(null);
    fetchNotes();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Archive this note and remove from history?")) return;
    const token = localStorage.getItem("token");
    const res = await fetch(`${CRM_API_URL}/crm/activities/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 403) {
      toast.error("Only administrators can delete activities");
      return;
    }
    if (!res.ok) {
      toast.error("Could not delete this activity");
      return;
    }
    setNotes((prev) => prev.filter((n) => n._id !== id));
    toast.success("Note removed");
  };

  const baseFilteredNotes = applyFilters(notes, filters, filterProperties);
  const filteredNotes = !search.trim()
    ? baseFilteredNotes
    : baseFilteredNotes.filter((n) => {
        const q = search.toLowerCase();
        return (
          (n.title || "").toLowerCase().includes(q) || (n.content || "").toLowerCase().includes(q)
        );
      });

  const totalNotes = notes.length;
  const shownCount = filteredNotes.length;

  return (
    <div className={cn(CRM_LIST_PAGE, "overflow-auto")}>
      <CrmPageHeader
        bordered={false}
        title="Notes"
        badge={<CrmCountBadge>{shownCount}</CrmCountBadge>}
        description="A shared timeline of team notes. Use filters to narrow by property, or search title and body text."
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Notes" },
        ]}
        icon={<StickyNote className="h-4 w-4" />}
        actions={
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-2 font-medium">
              Archive · {totalNotes}
            </span>
            <span className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-2 font-medium">
              {search.trim() || filters.length > 0 ? "Filtered" : "Showing"} · {shownCount}
            </span>
          </div>
        }
      />

      <section className={cn(CRM_PANEL, "mb-4 shrink-0 overflow-hidden")}>
        <div className="border-b border-[var(--border-color)] bg-[var(--background)] px-5 py-3.5">
          <h2 className="text-sm font-semibold text-[var(--text-main)]">Create a note</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Titles help scanning; the body holds detail. Notes appear in this list and on linked
            records.
          </p>
        </div>
        <ActivityLogger
          onSave={handleSaveActivity}
          relatedType="General"
          fixedType="Note"
          className="rounded-none border-0 shadow-none animate-none"
        />
      </section>

      <section className="mb-4 flex min-h-0 flex-1 flex-col space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-main)]">Timeline</h2>
            <p className="text-xs text-[var(--text-muted)]">Grouped by day, newest first within each day.</p>
          </div>
        </div>

        <div
          className={cn(
            CRM_PANEL,
            "flex flex-col gap-4 p-4 md:flex-row md:items-center md:gap-5",
          )}
        >
          <div className="relative w-full md:max-w-xs shrink-0">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
              size={16}
              aria-hidden
            />
            <input
              type="search"
              placeholder="Search title or content…"
              className={cn(
                "w-full h-10 pl-9 pr-3 rounded-md border border-[var(--border-color)] bg-white text-sm text-[var(--text-main)]",
                "placeholder:text-[var(--text-muted)]/80 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/40",
              )}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search notes"
            />
          </div>
          <div className="hidden md:block w-px h-8 bg-[var(--border-color)] shrink-0" aria-hidden />
          <div className="flex-1 w-full min-w-0">
            <CRMFilterBar
              module="activities"
              filters={filters}
              onChange={setFilters}
              onClear={() => setFilters([])}
              onPropertiesReady={setFilterProperties}
            />
          </div>
        </div>

        <ActivityTimeline
          activities={filteredNotes}
          loading={loading}
          onDelete={handleDelete}
          onEdit={(n) => setEditingNote(n as Note)}
          allowDelete={allowActivityDelete}
          emptyTitle="No notes to show"
          emptyDescription={
            search.trim() || filters.length > 0
              ? "Try clearing search or filters, or add a new note above."
              : "Create your first note above to build this timeline."
          }
          emptyIcon={<FileText className="h-8 w-8 text-[var(--primary)]" strokeWidth={1.5} />}
        />
      </section>

      <Dialog open={!!editingNote} onOpenChange={(open) => !open && setEditingNote(null)}>
        <DialogContent className="max-w-2xl rounded-md border-[var(--border-color)] bg-white p-0 gap-0 overflow-hidden sm:rounded-md">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-[var(--border-color)] bg-[var(--background)] text-left space-y-1">
            <DialogTitle className="text-base font-semibold text-[var(--text-main)]">Edit note</DialogTitle>
            <DialogDescription className="text-xs text-[var(--text-muted)]">
              Update the title or body. Other fields on the activity stay unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="p-0">
            {editingNote ? (
              <ActivityLogger
                key={editingNote._id}
                onSave={handleUpdateNote}
                relatedType="General"
                fixedType="Note"
                initialData={editingNote}
                submitLabel="Save changes"
                className="rounded-none border-0 shadow-none animate-none"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
