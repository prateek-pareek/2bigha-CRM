"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Copy,
  Loader2,
  Mail,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  CAMPAIGN_STATUS_LABEL,
  deleteEmailCampaign,
  duplicateEmailCampaign,
  fetchEmailCampaigns,
  sendEmailCampaignNow,
  type EmailCampaign,
  type EmailCampaignStatus,
} from "@/lib/crm/email-campaigns";
import { cn } from "@/lib/utils";
import {
  CrmPageHeader,
  CrmButton,
  CrmCountBadge,
  CrmListToolbar,
  CrmTableShell,
  CrmTable,
} from "@/components/crm/ui";
import { CRM_LIST_PAGE, CRM_TOOLBAR_SELECT } from "@/lib/crm/ui";

function statusClass(status: EmailCampaignStatus) {
  switch (status) {
    case "completed":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "sending":
      return "bg-blue-50 text-blue-800 border-blue-200";
    case "scheduled":
      return "bg-violet-50 text-violet-800 border-violet-200";
    case "failed":
      return "bg-rose-50 text-rose-800 border-rose-200";
    case "cancelled":
      return "bg-slate-100 text-slate-600 border-[var(--border-color)]";
    default:
      return "bg-amber-50 text-amber-900 border-amber-200";
  }
}

export default function EmailCampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchEmailCampaigns({
        status: statusFilter,
        search: search.trim() || undefined,
      });
      setCampaigns(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load campaigns");
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const t = setTimeout(() => void load(), search ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const handleSend = async (id: string) => {
    setBusyId(id);
    try {
      await sendEmailCampaignNow(id);
      toast.success("Campaign sent");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleDuplicate = async (id: string) => {
    setBusyId(id);
    try {
      const copy = await duplicateEmailCampaign(id);
      toast.success("Campaign duplicated");
      router.push(`/crm/campaigns/${copy.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Duplicate failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this campaign?")) return;
    setBusyId(id);
    try {
      await deleteEmailCampaign(id);
      toast.success("Campaign deleted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={CRM_LIST_PAGE}>
      <CrmPageHeader
        bordered={false}
        title="Email campaigns"
        badge={<CrmCountBadge>{campaigns.length}</CrmCountBadge>}
        description="Plan, schedule, and send bulk outreach to leads and contacts with deliverability controls and per-recipient merge fields."
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Email campaigns" },
        ]}
        actions={
          <CrmButton
            variant="primary"
            onClick={() => router.push("/crm/campaigns/new")}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            New campaign
          </CrmButton>
        }
      />

      <CrmListToolbar
        searchProps={{
          placeholder: "Search campaigns…",
          value: search,
          onChange: (e) => setSearch(e.target.value),
        }}
        leftExtra={
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={CRM_TOOLBAR_SELECT}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            {Object.entries(CAMPAIGN_STATUS_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        }
      />

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--card-bg)] p-12 text-center shadow-[var(--crm-shadow-card)]">
          <Mail className="mx-auto h-10 w-10 text-[var(--text-muted)]" />
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            No campaigns yet. Create one to send coordinated outreach.
          </p>
          <CrmButton
            variant="secondary"
            className="mt-4"
            onClick={() => router.push("/crm/campaigns/new")}
          >
            Create your first campaign
          </CrmButton>
        </div>
      ) : (
        <CrmTableShell>
          <CrmTable>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Status</th>
                <th>Recipients</th>
                <th>Results</th>
                <th>Updated</th>
                <th className="crm-table-actions text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link
                      href={`/crm/campaigns/${c.id}`}
                      className="crm-list-name hover:underline"
                    >
                      {c.name}
                    </Link>
                    <p className="crm-list-sub mt-0.5 truncate max-w-[280px]">
                      {c.subject || "—"}
                    </p>
                  </td>
                  <td>
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold",
                        statusClass(c.status),
                      )}
                    >
                      {CAMPAIGN_STATUS_LABEL[c.status]}
                    </span>
                  </td>
                  <td className="tabular-nums">{c.totalRecipients}</td>
                  <td>
                    <span className="text-emerald-700 font-medium">
                      {c.sentCount} sent
                    </span>
                    {c.failedCount > 0 ? (
                      <span className="text-rose-700 font-medium">
                        {" "}
                        · {c.failedCount} failed
                      </span>
                    ) : null}
                  </td>
                  <td>
                    {c.scheduledAt && c.status === "scheduled" ? (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(c.scheduledAt).toLocaleString()}
                      </span>
                    ) : c.updatedAt ? (
                      new Date(c.updatedAt).toLocaleDateString()
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      {["draft", "scheduled", "failed"].includes(c.status) ? (
                        <CrmButton
                          variant="icon"
                          disabled={busyId === c.id}
                          onClick={() => void handleSend(c.id)}
                          title="Send now"
                          className="text-[var(--primary)]"
                          leftIcon={<Send className="h-4 w-4" />}
                        />
                      ) : null}
                      <CrmButton
                        variant="icon"
                        disabled={busyId === c.id}
                        onClick={() => void handleDuplicate(c.id)}
                        title="Duplicate"
                        leftIcon={<Copy className="h-4 w-4" />}
                      />
                      {c.status !== "sending" ? (
                        <CrmButton
                          variant="icon"
                          disabled={busyId === c.id}
                          onClick={() => void handleDelete(c.id)}
                          title="Delete"
                          className="text-rose-600 hover:bg-rose-50"
                          leftIcon={<Trash2 className="h-4 w-4" />}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </CrmTable>
        </CrmTableShell>
      )}
    </div>
  );
}
