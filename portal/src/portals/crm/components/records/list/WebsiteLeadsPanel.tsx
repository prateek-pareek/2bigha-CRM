"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Loader2, Mail, RefreshCw, Trash2, X } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import crmApi from "@/lib/crm/api";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Pagination from "@/components/suite/shell/Pagination";
import { audienceLabel } from "@/lib/social/publishing/audience";
import {
  CrmButton,
  CrmTableShell,
  CrmTable,
  CrmListPersonCell,
  CrmListStatusBadge,
  CrmSoftBadge,
  CrmListMutedText,
} from "@/components/crm/ui";

type WebsiteLeadRow = {
  _id: string;
  firstName: string;
  lastName?: string;
  email: string;
  phone?: string;
  company?: string;
  subject?: string;
  message: string;
  audience?: string;
  status: string;
  formType?: string;
  pageUrl?: string;
  convertedLeadId?: string;
  createdAt?: string;
};

/**
 * Website form-submission inbox, shown as the "Website Leads" tab on the Leads
 * page. This is a distinct data model (raw submissions, not full CRM leads) —
 * same panel used to back the standalone /crm/website-leads route.
 */
export default function WebsiteLeadsPanel() {
  const router = useRouter();
  const { hasAccess, isLoaded, isAdmin } = usePermissions();
  const canRead = isAdmin || hasAccess("leads:read");
  const canWrite = isAdmin || hasAccess("leads:write");

  const [items, setItems] = useState<WebsiteLeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [statusFilter, setStatusFilter] = useState("__all__");
  const [audienceFilter, setAudienceFilter] = useState("__all__");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<WebsiteLeadRow | null>(null);
  const [converting, setConverting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WebsiteLeadRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    try {
      const { data } = await crmApi.get<{
        items: WebsiteLeadRow[];
        total: number;
      }>("/crm/website-leads", {
        params: {
          page,
          pageSize,
          status: statusFilter !== "__all__" ? statusFilter : undefined,
          audience: audienceFilter !== "__all__" ? audienceFilter : undefined,
          search: debouncedSearch || undefined,
        },
      });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch {
      toast.error("Could not load website leads.");
    } finally {
      setLoading(false);
    }
  }, [canRead, page, pageSize, statusFilter, audienceFilter, debouncedSearch]);

  useEffect(() => {
    if (isLoaded) void load();
  }, [isLoaded, load]);

  const deleteLead = async (row: WebsiteLeadRow) => {
    if (!canWrite) return;
    setDeleting(true);
    try {
      await crmApi.delete(`/crm/website-leads/${row._id}`);
      toast.success("Website lead deleted.");
      if (selected?._id === row._id) setSelected(null);
      setDeleteTarget(null);
      void load();
    } catch {
      toast.error("Could not delete this lead.");
    } finally {
      setDeleting(false);
    }
  };

  const convertToLead = async (row: WebsiteLeadRow) => {
    if (!canWrite) return;
    setConverting(true);
    try {
      const { data } = await crmApi.post<{
        crmLeadId: string;
        alreadyConverted?: boolean;
      }>(`/crm/website-leads/${row._id}/convert-to-lead`);
      toast.success(
        data.alreadyConverted
          ? "Already linked to a CRM lead."
          : "Converted to CRM lead.",
      );
      if (data.crmLeadId) {
        window.open(`/crm/leads/${data.crmLeadId}`, "_blank");
      }
      void load();
      if (selected?._id === row._id) {
        setSelected({ ...row, status: "converted", convertedLeadId: data.crmLeadId });
      }
    } catch {
      toast.error("Convert failed.");
    } finally {
      setConverting(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        You do not have permission to view website leads.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="mb-3 flex flex-wrap items-center gap-2 shrink-0">
        <Input
          placeholder="Search name, email, message…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs h-9"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="converted">Converted</SelectItem>
            <SelectItem value="spam">Spam</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={audienceFilter}
          onValueChange={(v) => {
            setAudienceFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Audience" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All audiences</SelectItem>
            <SelectItem value="agency">Agency</SelectItem>
            <SelectItem value="freelancer">Freelancer</SelectItem>
          </SelectContent>
        </Select>
        <CrmButton
          variant="secondary"
          onClick={() => void load()}
          leftIcon={<RefreshCw className="h-4 w-4" />}
        >
          Refresh
        </CrmButton>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden gap-0">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <CrmTableShell>
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-center text-muted-foreground py-16">No submissions yet.</p>
            ) : (
              <CrmTable>
                <thead>
                  <tr>
                    <th className="sticky top-0 z-10">Contact</th>
                    <th className="sticky top-0 z-10">Message</th>
                    <th className="sticky top-0 z-10">Audience</th>
                    <th className="sticky top-0 z-10">Status</th>
                    <th className="sticky top-0 z-10">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => {
                    const fullName =
                      [row.firstName, row.lastName].filter(Boolean).join(" ") || "—";
                    const initials =
                      `${row.firstName?.[0] || ""}${row.lastName?.[0] || ""}`.trim() ||
                      fullName[0] ||
                      "?";
                    return (
                      <tr
                        key={row._id}
                        className={`group cursor-pointer transition-colors ${
                          selected?._id === row._id ? "crm-table-row-selected" : ""
                        }`}
                        onClick={() => setSelected(row)}
                      >
                        <td>
                          <CrmListPersonCell
                            name={fullName}
                            initials={initials}
                            subtitle={
                              <>
                                {row.email}
                                {row.company ? ` · ${row.company}` : ""}
                              </>
                            }
                          />
                        </td>
                        <td className="max-w-md">
                          {row.subject ? (
                            <div className="mb-0.5 text-sm font-medium text-[#1f2020]">{row.subject}</div>
                          ) : null}
                          <CrmListMutedText className="line-clamp-2">{row.message}</CrmListMutedText>
                        </td>
                        <td>
                          <CrmSoftBadge
                            label={audienceLabel(row.audience)}
                            tone={
                              String(row.audience || "").toLowerCase().includes("vip")
                                ? "warning"
                                : "success"
                            }
                          />
                        </td>
                        <td>
                          <CrmListStatusBadge label={row.status || "—"} />
                        </td>
                        <td>
                          <CrmListMutedText>
                            {row.createdAt
                              ? format(new Date(row.createdAt), "MMM d, yyyy HH:mm")
                              : "—"}
                          </CrmListMutedText>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </CrmTable>
            )}
          </CrmTableShell>
          {total > pageSize ? (
            <div className="p-4 border-t border-[var(--border-color)] shrink-0">
              <Pagination
                total={total}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
              />
            </div>
          ) : null}
        </div>

        {selected ? (
          <aside className="w-full max-w-md border-l border-[var(--border-color)] bg-white p-5 overflow-auto shrink-0">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-bold text-lg">
                {[selected.firstName, selected.lastName].filter(Boolean).join(" ")}
              </h2>
              <CrmButton
                type="button"
                variant="icon"
                className="h-8 w-8"
                onClick={() => setSelected(null)}
                aria-label="Close lead details"
              >
                <X className="h-4 w-4" />
              </CrmButton>
            </div>
            <p className="text-sm text-[var(--text-muted)] flex items-center gap-1 mt-1">
              <Mail className="h-3.5 w-3.5" />
              {selected.email}
            </p>
            {selected.phone ? (
              <p className="text-sm text-[var(--text-muted)] mt-1">{selected.phone}</p>
            ) : null}
            {selected.pageUrl ? (
              <a
                href={selected.pageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--primary)] mt-2 inline-block"
              >
                Source page
              </a>
            ) : null}
            <div className="mt-4 p-3 rounded-lg bg-[var(--surface-dim)] text-sm whitespace-pre-wrap">
              {selected.message}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {canWrite && selected.status !== "converted" ? (
                <CrmButton
                  disabled={converting}
                  loading={converting}
                  onClick={() => void convertToLead(selected)}
                >
                  Convert to CRM lead
                </CrmButton>
              ) : null}
              {selected.convertedLeadId ? (
                <CrmButton
                  variant="secondary"
                  onClick={() => router.push(`/crm/leads/${selected.convertedLeadId}`)}
                >
                  Open CRM lead
                </CrmButton>
              ) : null}
              {canWrite ? (
                <CrmButton
                  variant="secondary"
                  className="text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                  onClick={() => setDeleteTarget(selected)}
                  leftIcon={<Trash2 className="h-4 w-4" />}
                >
                  Delete
                </CrmButton>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete website lead?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the contact form submission
              {deleteTarget
                ? ` from ${[deleteTarget.firstName, deleteTarget.lastName].filter(Boolean).join(" ")} (${deleteTarget.email})`
                : ""}
              . The CRM lead created from conversion is not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting || !deleteTarget}
              className="bg-rose-600 hover:bg-rose-700"
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) void deleteLead(deleteTarget);
              }}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
