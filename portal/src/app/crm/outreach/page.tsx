"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Check, Users, Contact, FileText, Plus, Workflow, Edit2, Trash2 } from "lucide-react";
import { CRM_API_URL } from '@/lib/crm/config';
import { mapPool } from "@/lib/crm/shared/mapPool";
import Pagination from "@/components/suite/shell/Pagination";
import SendEmailModal from "@/components/crm/email/composer/SendEmailModal";
import TemplateModal from "@/components/crm/automation/playbooks/TemplateModal";
import { BulkEmailToolbarButton } from "@/components/crm/email/composer/BulkEmailToolbarButton";
import { buildBulkEmailRecipients } from "@/lib/crm/bulk-email";
import {
  CrmPageHeader,
  CrmButton,
  CrmCountBadge,
  CrmHeaderTools,
  CrmListToolbar,
  CrmTable,
} from "@/components/crm/ui";
import { CRM_LIST_PAGE, CRM_TOOLBAR_SELECT } from "@/lib/crm/ui";

interface Entity {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  organization?: string;
  status?: string;
}

type LastActivityRange =
  | "all"
  | "today"
  | "last7"
  | "last30"
  | "last90"
  | "no-activity";

type EngagementFilter = "all" | "opened" | "replied" | "not-replied";

const CAMPAIGN_DRAFT_RECIPIENTS_KEY = "campaignDraftRecipients";

export default function OutreachPage() {
  const router = useRouter();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [entityTotal, setEntityTotal] = useState(0);
  const [activeTab, setActiveTab] = useState<"leads" | "contacts" | "templates">("leads");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState("all");
  const [organizationFilter, setOrganizationFilter] = useState("all");
  const [emailFilter, setEmailFilter] = useState<"all" | "with-email" | "without-email">("all");
  const [lastActivityFilter, setLastActivityFilter] = useState<LastActivityRange>("all");
  const [lastEmailActivityByEntity, setLastEmailActivityByEntity] = useState<Record<string, string | null>>({});
  const [engagementFilter, setEngagementFilter] = useState<EngagementFilter>("all");
  const [engagementByEntity, setEngagementByEntity] = useState<
    Record<string, { opened: boolean; replied: boolean }>
  >({});
  const [templates, setTemplates] = useState<any[]>([]);
  const [pipelineStatusOptions, setPipelineStatusOptions] = useState<string[]>([]);

  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    if (activeTab === "templates") return;
    setPage(1);
  }, [
    activeTab,
    statusFilter,
    organizationFilter,
    emailFilter,
    lastActivityFilter,
    engagementFilter,
  ]);

  const fetchTemplates = useCallback(async () => {
    const token = localStorage.getItem("token");
    setLoading(true);
    try {
      const tempRes = await fetch(`${CRM_API_URL}/email-templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (tempRes.ok) {
        const data = await tempRes.json();
        setTemplates(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to fetch templates:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEntityPage = useCallback(async () => {
    if (activeTab === "templates") return;
    const token = localStorage.getItem("token");
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (lastActivityFilter !== "all") {
        params.set("lastActivity", lastActivityFilter);
      }
      if (
        activeTab === "contacts" &&
        lastActivityFilter !== "all" &&
        lastActivityFilter !== "no-activity"
      ) {
        params.set("sortBy", "lastEmailActivityAt");
        params.set("sortOrder", "desc");
      }
      const path = activeTab === "leads" ? "leads" : "contacts";
      const res = await fetch(`${CRM_API_URL}/crm/${path}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setEntities([]);
        setEntityTotal(0);
        return;
      }
      const data = await res.json();
      if (data && Array.isArray(data.data) && typeof data.total === "number") {
        setEntities(data.data);
        setEntityTotal(data.total);
      } else if (Array.isArray(data)) {
        setEntities(data);
        setEntityTotal(data.length);
      } else {
        setEntities([]);
        setEntityTotal(0);
      }
    } catch (err) {
      console.error("Failed to fetch records:", err);
      setEntities([]);
      setEntityTotal(0);
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, pageSize, debouncedSearch, lastActivityFilter]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "templates") {
      void fetchTemplates();
      return;
    }
    void fetchEntityPage();
  }, [activeTab, fetchTemplates, fetchEntityPage]);

  useEffect(() => {
    if (activeTab === "templates") {
      setPipelineStatusOptions([]);
      return;
    }
    const token = localStorage.getItem("token");
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${CRM_API_URL}/crm/pipelines?type=leads`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (!cancelled) setPipelineStatusOptions([]);
          return;
        }
        const data = await res.json();
        const pipelines = Array.isArray(data) ? data : [];
        const stageNames = pipelines.flatMap((p: any) =>
          Array.isArray(p?.stages)
            ? p.stages
                .map((s: any) => String(s?.name || "").trim())
                .filter(Boolean)
            : [],
        );
        if (!cancelled) {
          setPipelineStatusOptions(
            Array.from(new Set(stageNames)).sort((a, b) => a.localeCompare(b)),
          );
        }
      } catch {
        if (!cancelled) setPipelineStatusOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "templates" || entities.length === 0) {
      setLastEmailActivityByEntity({});
      setEngagementByEntity({});
      return;
    }
    const token = localStorage.getItem("token");
    if (!token) return;

    let cancelled = false;
    void (async () => {
      try {
        const OUTREACH_ENRICH_CONCURRENCY = 8;
        const entries = await mapPool(entities, OUTREACH_ENRICH_CONCURRENCY, async (entity) => {
            try {
              const [res, activitiesRes] = await Promise.all([
                fetch(`${CRM_API_URL}/communications/emails/entity/${entity._id}`, {
                  headers: { Authorization: `Bearer ${token}` },
                }),
                fetch(
                  `${CRM_API_URL}/crm/activities?relatedTo=${encodeURIComponent(entity._id)}&type=Email&relatedType=${activeTab === "leads" ? "Lead" : "Contact"}`,
                  { headers: { Authorization: `Bearer ${token}` } },
                ),
              ]);
              if (!res.ok) return [entity._id, { latest: null, opened: false, replied: false }] as const;
              const emails = await res.json();
              const activities = activitiesRes.ok ? await activitiesRes.json() : [];
              if (!Array.isArray(emails) || emails.length === 0) {
                const hasReply = Array.isArray(activities)
                  ? activities.some((a: any) => String(a?.metadata?.direction || "").toLowerCase() === "inbound")
                  : false;
                return [entity._id, { latest: null, opened: false, replied: hasReply }] as const;
              }
              const latest = emails.reduce((latestIso: string | null, row: any) => {
                const candidate =
                  row?.updatedAt ||
                  row?.createdAt ||
                  row?.meta?.sentAt ||
                  row?.meta?.deliveredAt ||
                  null;
                if (!candidate) return latestIso;
                const candidateTime = new Date(candidate).getTime();
                if (Number.isNaN(candidateTime)) return latestIso;
                if (!latestIso) return new Date(candidate).toISOString();
                return candidateTime > new Date(latestIso).getTime()
                  ? new Date(candidate).toISOString()
                  : latestIso;
              }, null);
              const hasOpened = emails.some((row: any) => {
                const status = String(row?.status || "").toLowerCase();
                return status === "opened" || Number(row?.openCount || row?.meta?.openCount || 0) > 0;
              });
              const hasReply = Array.isArray(activities)
                ? activities.some((a: any) => String(a?.metadata?.direction || "").toLowerCase() === "inbound")
                : false;
              return [entity._id, { latest, opened: hasOpened, replied: hasReply }] as const;
            } catch {
              return [entity._id, { latest: null, opened: false, replied: false }] as const;
            }
        });
        if (cancelled) return;
        setLastEmailActivityByEntity(
          Object.fromEntries(entries.map(([id, v]) => [id, v.latest])),
        );
        setEngagementByEntity(
          Object.fromEntries(entries.map(([id, v]) => [id, { opened: v.opened, replied: v.replied }])),
        );
      } catch {
        if (!cancelled) {
          setLastEmailActivityByEntity({});
          setEngagementByEntity({});
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, entities]);

  const filteredTemplates = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.subject || t.title || "").toLowerCase().includes(search.toLowerCase()),
  );
  const paginatedTemplates = filteredTemplates.slice((page - 1) * pageSize, page * pageSize);

  const statusOptions = useMemo(() => {
    const unique = Array.from(
      new Set([
        ...pipelineStatusOptions,
        ...entities
          .map((entity) => String(entity.status || "Active").trim())
          .filter(Boolean),
      ]),
    ).sort((a, b) => a.localeCompare(b));
    return ["all", ...unique];
  }, [entities, pipelineStatusOptions]);

  useEffect(() => {
    if (statusFilter !== "all" && !statusOptions.includes(statusFilter)) {
      setStatusFilter("all");
    }
  }, [statusFilter, statusOptions]);

  const organizationOptions = useMemo(() => {
    const unique = Array.from(
      new Set(
        entities
          .map((entity) => String(entity.organization || "").trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
    return ["all", ...unique];
  }, [entities]);

  const filteredEntities = useMemo(() => {
    if (activeTab === "templates") return entities;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const daysAgo = (days: number) => now.getTime() - days * 24 * 60 * 60 * 1000;
    return entities.filter((entity) => {
      const normalizedStatus = String(entity.status || "Active").trim();
      const normalizedOrganization = String(entity.organization || "").trim();
      const hasEmail = String(entity.email || "").trim().length > 0;
      const lastActivityIso = lastEmailActivityByEntity[entity._id] || null;
      const lastActivityTs = lastActivityIso ? new Date(lastActivityIso).getTime() : NaN;
      const engagement = engagementByEntity[entity._id] || { opened: false, replied: false };

      if (statusFilter !== "all" && normalizedStatus !== statusFilter) return false;
      if (organizationFilter !== "all" && normalizedOrganization !== organizationFilter) return false;
      if (emailFilter === "with-email" && !hasEmail) return false;
      if (emailFilter === "without-email" && hasEmail) return false;
      if (lastActivityFilter === "no-activity") {
        if (lastActivityIso) return false;
      } else if (lastActivityFilter !== "all") {
        if (!lastActivityIso || Number.isNaN(lastActivityTs)) return false;
        if (lastActivityFilter === "today" && lastActivityTs < startOfToday) return false;
        if (lastActivityFilter === "last7" && lastActivityTs < daysAgo(7)) return false;
        if (lastActivityFilter === "last30" && lastActivityTs < daysAgo(30)) return false;
        if (lastActivityFilter === "last90" && lastActivityTs < daysAgo(90)) return false;
      }
      if (engagementFilter === "opened" && !engagement.opened) return false;
      if (engagementFilter === "replied" && !engagement.replied) return false;
      if (engagementFilter === "not-replied" && engagement.replied) return false;

      return true;
    });
  }, [activeTab, entities, statusFilter, organizationFilter, emailFilter, lastActivityFilter, lastEmailActivityByEntity, engagementFilter, engagementByEntity]);

  const displayRows = activeTab === "templates" ? paginatedTemplates : filteredEntities;

  const bulkRecipients = useMemo(
    () =>
      activeTab === "templates"
        ? []
        : buildBulkEmailRecipients(
            selectedIds,
            entities,
            activeTab === "contacts" ? "contacts" : "leads",
          ),
    [activeTab, selectedIds, entities],
  );
  const paginationTotal =
    activeTab === "templates" ? filteredTemplates.length : entityTotal;

  const toggleSelectAll = () => {
    const rowIds = displayRows.map((e: Entity | any) => e._id);
    if (selectedIds.size === rowIds.length && rowIds.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rowIds));
    }
  };

  const toggleSelect = (id: string) => {
    const newIds = new Set(selectedIds);
    if (newIds.has(id)) newIds.delete(id);
    else newIds.add(id);
    setSelectedIds(newIds);
  };

  const handleDeleteTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this template?")) return;
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/email-templates/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) void fetchTemplates();
    } catch (err) {
      console.error("Failed to delete template:", err);
    }
  };

  /** Lazy-load templates for the email composer when opening bulk send from leads/contacts. */
  useEffect(() => {
    if (!isEmailModalOpen || templates.length > 0 || activeTab === "templates") return;
    const token = localStorage.getItem("token");
    void (async () => {
      try {
        const r = await fetch(`${CRM_API_URL}/email-templates`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.ok) {
          const data = await r.json();
          setTemplates(Array.isArray(data) ? data : []);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [isEmailModalOpen, templates.length, activeTab]);

  return (
    <div className={CRM_LIST_PAGE}>
      <CrmPageHeader
        bordered={false}
        title="Communications Outreach"
        badge={
          activeTab !== "templates" ? (
            <CrmCountBadge>{paginationTotal}</CrmCountBadge>
          ) : (
            <CrmCountBadge>{filteredTemplates.length}</CrmCountBadge>
          )
        }
        description="Bulk email selected leads or contacts. Automated outreach via Workflows."
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Outreach" },
        ]}
        actions={
          <CrmHeaderTools
            leading={
              <>
                <CrmButton
                  variant="secondary"
                  onClick={() => router.push("/crm/campaigns")}
                  leftIcon={<Mail size={14} />}
                >
                  Email campaigns
                </CrmButton>
                {activeTab !== "templates" && selectedIds.size > 0 ? (
                  <CrmButton
                    variant="secondary"
                    onClick={() => {
                      const recipients = Array.from(selectedIds)
                        .map((id) => entities.find((e) => e._id === id))
                        .filter((e): e is Entity => Boolean(e))
                        .map((e) => ({
                          email: String(e.email || "").trim(),
                          name: `${e.firstName || ""} ${e.lastName || ""}`.trim() || undefined,
                          module: activeTab === "contacts" ? "contacts" : "leads",
                          entityId: e._id,
                        }))
                        .filter((r) => r.email.includes("@"));
                      sessionStorage.setItem(
                        CAMPAIGN_DRAFT_RECIPIENTS_KEY,
                        JSON.stringify(recipients),
                      );
                      router.push("/crm/campaigns/new");
                    }}
                    leftIcon={<Mail size={14} />}
                  >
                    Campaign ({selectedIds.size})
                  </CrmButton>
                ) : null}
                <CrmButton
                  variant="secondary"
                  onClick={() => router.push("/crm/settings/workflows")}
                  leftIcon={<Workflow size={14} />}
                >
                  Workflows
                </CrmButton>
                {activeTab === "templates" ? (
                  <CrmButton
                    variant="primary"
                    onClick={() => {
                      setEditingTemplate(null);
                      setIsTemplateModalOpen(true);
                    }}
                    leftIcon={<Plus size={14} />}
                  >
                    New Template
                  </CrmButton>
                ) : null}
              </>
            }
          />
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--card-bg)] shadow-[var(--crm-shadow-card)]">
        <div className="flex border-b border-[var(--border-color)]">
          <button
            onClick={() => {
              setActiveTab("leads");
              setPage(1);
            }}
            className={`flex-1 py-2.5 text-xs font-semibold tracking-wide uppercase transition-all ${
              activeTab === "leads"
                ? "bg-[var(--surface-dim)] text-[var(--primary)] border-b-2 border-[var(--primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-dim)]/50"
            }`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <Users size={13} /> Leads
            </div>
          </button>
          <button
            onClick={() => {
              setActiveTab("contacts");
              setPage(1);
            }}
            className={`flex-1 py-2.5 text-xs font-semibold tracking-wide uppercase transition-all ${
              activeTab === "contacts"
                ? "bg-[var(--surface-dim)] text-[var(--primary)] border-b-2 border-[var(--primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-dim)]/50"
            }`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <Contact size={13} /> Contacts
            </div>
          </button>
          <button
            onClick={() => {
              setActiveTab("templates");
              setPage(1);
            }}
            className={`flex-1 py-2.5 text-xs font-semibold tracking-wide uppercase transition-all ${
              activeTab === "templates"
                ? "bg-[var(--surface-dim)] text-[var(--primary)] border-b-2 border-[var(--primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-dim)]/50"
            }`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <FileText size={13} /> Templates
            </div>
          </button>
        </div>

        <div className="px-4 py-2.5 border-b border-[var(--border-color)] bg-[var(--surface-dim)]/30">
          <CrmListToolbar
            className="mb-0"
            searchProps={{
              placeholder: `Search ${activeTab}...`,
              value: search,
              onChange: (e) => setSearch(e.target.value),
            }}
            leftExtra={
              activeTab !== "templates" ? (
                <>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className={CRM_TOOLBAR_SELECT}
                  >
                    {statusOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt === "all" ? "All Statuses" : opt}
                      </option>
                    ))}
                  </select>
                  <select
                    value={organizationFilter}
                    onChange={(e) => setOrganizationFilter(e.target.value)}
                    className={CRM_TOOLBAR_SELECT}
                  >
                    {organizationOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt === "all" ? "All Organizations" : opt}
                      </option>
                    ))}
                  </select>
                  <select
                    value={emailFilter}
                    onChange={(e) =>
                      setEmailFilter(e.target.value as "all" | "with-email" | "without-email")
                    }
                    className={CRM_TOOLBAR_SELECT}
                  >
                    <option value="with-email">With Email ID</option>
                    <option value="all">With/Without Email ID</option>
                    <option value="without-email">Without Email ID</option>
                  </select>
                  <select
                    value={lastActivityFilter}
                    onChange={(e) => setLastActivityFilter(e.target.value as LastActivityRange)}
                    className={CRM_TOOLBAR_SELECT}
                  >
                    <option value="all">Last Email Activity: Any</option>
                    <option value="today">Last Email Activity: Today</option>
                    <option value="last7">Last Email Activity: Last 7 Days</option>
                    <option value="last30">Last Email Activity: Last 30 Days</option>
                    <option value="last90">Last Email Activity: Last 90 Days</option>
                    <option value="no-activity">Last Email Activity: No Activity</option>
                  </select>
                  <select
                    value={engagementFilter}
                    onChange={(e) => setEngagementFilter(e.target.value as EngagementFilter)}
                    className={CRM_TOOLBAR_SELECT}
                  >
                    <option value="all">Engagement: Any</option>
                    <option value="opened">Engagement: Opened</option>
                    <option value="replied">Engagement: Replied</option>
                    <option value="not-replied">Engagement: Not Replied</option>
                  </select>
                </>
              ) : null
            }
            right={
              selectedIds.size > 0 && activeTab !== "templates" ? (
                <div className="flex items-center gap-2 animate-in slide-in-from-right-4 duration-300">
                  <span className="text-xs font-semibold text-[var(--primary)]">
                    {selectedIds.size} selected
                  </span>
                  <BulkEmailToolbarButton
                    variant="labeled"
                    selectedCount={selectedIds.size}
                    recipientCount={bulkRecipients.length}
                    entityLabel={activeTab === "contacts" ? "contact" : "lead"}
                    onClick={() => setIsEmailModalOpen(true)}
                  />
                </div>
              ) : null
            }
          />
        </div>

        <div className="overflow-auto flex-1 custom-scrollbar">
          <CrmTable>
            <thead>
              <tr>
                <th className="crm-table-check">
                  <button
                    onClick={toggleSelectAll}
                    className={`w-4 h-4 rounded border-2 transition-all flex items-center justify-center ${
                      selectedIds.size === displayRows.length && displayRows.length > 0
                        ? "bg-[var(--primary)] border-[var(--primary)] text-white"
                        : "border-[var(--border-color)] bg-white"
                    }`}
                  >
                    {selectedIds.size === displayRows.length && displayRows.length > 0 && (
                      <Check size={10} strokeWidth={4} />
                    )}
                  </button>
                </th>
                <th>{activeTab === "templates" ? "Template Name" : "Name"}</th>
                <th>{activeTab === "templates" ? "Subject" : "Email"}</th>
                <th>{activeTab === "templates" ? "Type" : "Organization"}</th>
                <th>{activeTab === "templates" ? "Actions" : "Status"}</th>
                <th>{activeTab === "templates" ? "Updated" : "Last Email Activity"}</th>
                <th>{activeTab === "templates" ? "Created" : "Engagement"}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td>
                      <div className="w-4 h-4 bg-slate-100 rounded mx-auto" />
                    </td>
                    {[1, 2, 3, 4, 5, 6].map((j) => (
                      <td key={j}>
                        <div className="h-3 bg-slate-100 rounded w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : activeTab === "templates" ? (
                displayRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-[var(--text-muted)]">
                      No templates found
                    </td>
                  </tr>
                ) : (
                  (displayRows as any[]).map((temp: any) => (
                    <tr
                      key={temp._id}
                      className="group cursor-pointer"
                      onClick={() => {
                        setEditingTemplate(temp);
                        setIsTemplateModalOpen(true);
                      }}
                    >
                      <td className="px-4 py-3 w-10 text-center">
                        <div className="w-6 h-6 rounded-lg bg-[var(--primary-light)] flex items-center justify-center text-[var(--primary)] mx-auto">
                          <FileText size={12} />
                        </div>
                      </td>
                      <td>
                        <span className="text-xs font-semibold text-[var(--text-main)]">{temp.name}</span>
                      </td>
                      <td>
                        <span className="text-xs text-[var(--text-muted)] truncate max-w-xs block">
                          {temp.subject || temp.title || "—"}
                        </span>
                      </td>
                      <td>
                        <span className="text-xs text-[var(--text-muted)] capitalize">
                          {temp.type || "email"}
                          {temp.steps ? ` · ${temp.steps.length} steps` : ""}
                        </span>
                      </td>
                      <td className="crm-table-actions text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button className="p-1.5 hover:bg-[var(--primary-light)] text-[var(--primary)] rounded-lg transition-all">
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={(e) => handleDeleteTemplate(temp._id, e)}
                            className="p-1.5 hover:bg-rose-50 text-rose-500 rounded-lg transition-all"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                      <td>
                        <span className="text-xs text-[var(--text-muted)]">
                          {temp.updatedAt
                            ? new Date(temp.updatedAt).toLocaleString()
                            : temp.createdAt
                              ? new Date(temp.createdAt).toLocaleString()
                              : "—"}
                        </span>
                      </td>
                      <td>
                        <span className="text-xs text-[var(--text-muted)]">
                          {temp.createdAt ? new Date(temp.createdAt).toLocaleString() : "—"}
                        </span>
                      </td>
                    </tr>
                  ))
                )
              ) : displayRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-[var(--text-muted)]">
                    No results found
                  </td>
                </tr>
              ) : (
                (displayRows as Entity[]).map((entity) => (
                  <tr
                    key={entity._id}
                    className={`group cursor-pointer ${
                      selectedIds.has(entity._id) ? "bg-[var(--primary-light)]/40" : ""
                    }`}
                    onClick={() => toggleSelect(entity._id)}
                  >
                    <td className="px-4 py-3 text-center">
                      <div
                        className={`w-4 h-4 rounded border-2 transition-all flex items-center justify-center mx-auto ${
                          selectedIds.has(entity._id)
                            ? "bg-[var(--primary)] border-[var(--primary)] text-white"
                            : "border-[var(--border-color)] bg-white"
                        }`}
                      >
                        {selectedIds.has(entity._id) && <Check size={10} strokeWidth={4} />}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-[var(--surface-dim)] flex items-center justify-center text-[var(--text-muted)] font-bold text-xs uppercase shrink-0">
                          {entity.firstName?.[0] || "?"}
                          {entity.lastName?.[0] || ""}
                        </div>
                        <Link
                          href={`/crm/${activeTab}/${entity._id}`}
                          className="text-xs font-medium text-[var(--text-main)] hover:text-[var(--primary)] transition-colors truncate"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {entity.firstName || ""} {entity.lastName || ""}
                        </Link>
                      </div>
                    </td>
                    <td>
                      <span className="text-xs text-[var(--text-muted)]">{entity.email}</span>
                    </td>
                    <td>
                      <span className="text-xs text-[var(--text-muted)]">{entity.organization || "—"}</span>
                    </td>
                    <td>
                      <span className="px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide bg-[var(--surface-dim)] text-[var(--text-muted)] border border-[var(--border-color)]">
                        {entity.status || "Active"}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs text-[var(--text-muted)]">
                        {lastEmailActivityByEntity[entity._id]
                          ? new Date(lastEmailActivityByEntity[entity._id] as string).toLocaleString()
                          : "No activity"}
                      </span>
                    </td>
                    <td>
                      {(() => {
                        const e = engagementByEntity[entity._id] || { opened: false, replied: false };
                        const label = e.replied ? "Replied" : e.opened ? "Opened" : "Not replied";
                        return (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide bg-[var(--surface-dim)] text-[var(--text-muted)] border border-[var(--border-color)]">
                            {label}
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </CrmTable>
        </div>

        <Pagination total={paginationTotal} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </div>

      {isEmailModalOpen && selectedIds.size > 0 && bulkRecipients.length > 0 && (
        <SendEmailModal
          isOpen={isEmailModalOpen}
          onClose={() => {
            setIsEmailModalOpen(false);
            setSelectedIds(new Set());
          }}
          recipientEmail={bulkRecipients.map((r) => r.email).join(", ")}
          recipientName={`${selectedIds.size} selected ${activeTab}`}
          module={activeTab === "contacts" ? "contacts" : "leads"}
          entityId={Array.from(selectedIds)[0]}
          crmInboxMode
          bulkRecipients={bulkRecipients}
        />
      )}

      <TemplateModal
        isOpen={isTemplateModalOpen}
        onClose={() => {
          setIsTemplateModalOpen(false);
          setEditingTemplate(null);
        }}
        template={editingTemplate}
        onSuccess={() => void fetchTemplates()}
      />
    </div>
  );
}
