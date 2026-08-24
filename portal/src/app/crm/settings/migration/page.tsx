"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  Loader2,
  Upload,
  AlertCircle,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { CRM_API_URL } from "@/lib/crm/config";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Platform = {
  id: string;
  label: string;
  description: string;
  recommendedOrder: string;
  entities: string[];
};

type TargetField = { key: string; label: string };

type JobStatus = {
  jobId: string;
  platform: string;
  entityType: string;
  status: string;
  total: number;
  processed: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  mergedCount: number;
  createdCount: number;
  progress: number;
  error?: string;
  errorSamples?: string[];
  revertible?: boolean;
  revertedAt?: string | null;
  revertRestoredCount?: number;
  revertDeletedCount?: number;
  sourceFileName?: string;
  createdAt?: string | null;
  duplicateStrategy?: string;
};

const ENTITY_LABELS: Record<string, string> = {
  organizations: "Companies / Organizations",
  contacts: "Contacts",
  leads: "Leads",
  notes: "Notes",
  calls: "Calls",
  meetings: "Meetings",
  emails: "Emails",
  tasks: "Tasks",
  activities: "Activities (mixed)",
  associations: "Relationships / Associations",
};

const STRATEGIES = [
  {
    value: "merge",
    label: "Merge (safe)",
    tip: "Fill empty fields only — recommended",
  },
  {
    value: "skip",
    label: "Skip",
    tip: "Leave existing records alone",
  },
  {
    value: "create",
    label: "Always create",
    tip: "Ignore duplicates — may create extras",
  },
  {
    value: "replace",
    label: "Replace",
    tip: "Overwrite matched fields — revertible",
  },
];

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}` };
}

export default function CrmMigrationSettingsPage() {
  const { hasAccess, isLoaded } = usePermissions();
  const canWrite =
    hasAccess("leads:write") ||
    hasAccess("contacts:write") ||
    hasAccess("organizations:write");

  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [platform, setPlatform] = useState("custom");
  const [entityType, setEntityType] = useState("organizations");
  const [strategy, setStrategy] = useState("merge");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [targetFields, setTargetFields] = useState<TargetField[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [recentJobs, setRecentJobs] = useState<JobStatus[]>([]);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [apiExampleJobId, setApiExampleJobId] = useState<string | null>(null);

  const selectedPlatform = useMemo(
    () => platforms.find((p) => p.id === platform),
    [platforms, platform],
  );

  const refreshJobs = useCallback(async () => {
    try {
      const res = await fetch(`${CRM_API_URL}/crm/migration/jobs?limit=20`, {
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setRecentJobs(data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!isLoaded || !canWrite) return;
    void fetch(`${CRM_API_URL}/crm/migration/platforms`, {
      headers: authHeaders(),
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setPlatforms(data);
      })
      .catch(() => undefined);
    void refreshJobs();
  }, [isLoaded, canWrite, refreshJobs]);

  useEffect(() => {
    if (!job?.jobId) return;
    if (
      job.status === "completed" ||
      job.status === "failed" ||
      job.status === "reverted" ||
      job.status === "cancelled"
    ) {
      void refreshJobs();
      return;
    }
    const t = setInterval(() => {
      void fetch(`${CRM_API_URL}/crm/migration/jobs/${job.jobId}`, {
        headers: authHeaders(),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) setJob(data);
        });
    }, 1500);
    return () => clearInterval(t);
  }, [job?.jobId, job?.status, refreshJobs]);

  const runPreview = useCallback(async () => {
    if (!file) {
      toast.error("Choose a CSV or Excel file first");
      return;
    }
    setPreviewing(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("platform", platform);
    fd.append("entityType", entityType);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/migration/preview`, {
        method: "POST",
        headers: authHeaders(),
        body: fd,
      });
      if (!res.ok) {
        toast.error("Preview failed");
        return;
      }
      const data = await res.json();
      setHeaders(data.headers || []);
      setMapping(data.suggestedMapping || {});
      setTargetFields(data.targetFields || []);
      toast.success(
        `Detected ${data.rowCount ?? 0} rows — mapping suggested for ${selectedPlatform?.label || platform}`,
      );
    } catch {
      toast.error("Preview failed");
    } finally {
      setPreviewing(false);
    }
  }, [file, platform, entityType, selectedPlatform?.label]);

  const startImport = useCallback(async () => {
    if (!file) {
      toast.error("Choose a file first");
      return;
    }
    if (strategy === "replace") {
      const ok = window.confirm(
        "Replace will overwrite matched record fields. Every write is snapshotted so you can Revert this job afterward. Continue?",
      );
      if (!ok) return;
    }
    setStarting(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("platform", platform);
    fd.append("entityType", entityType);
    fd.append("duplicateStrategy", strategy);
    fd.append("mapping", JSON.stringify(mapping));
    try {
      const res = await fetch(`${CRM_API_URL}/crm/migration/jobs/file`, {
        method: "POST",
        headers: authHeaders(),
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.message || "Import failed to start");
        return;
      }
      const data = await res.json();
      setJob(data);
      toast.success("Migration started — you can revert this job if needed");
      void refreshJobs();
    } catch {
      toast.error("Import failed to start");
    } finally {
      setStarting(false);
    }
  }, [file, platform, entityType, strategy, mapping, refreshJobs]);

  const createStreamJob = useCallback(async () => {
    try {
      const res = await fetch(`${CRM_API_URL}/crm/migration/jobs`, {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform,
          entityType,
          duplicateStrategy: strategy,
          mapping,
        }),
      });
      if (!res.ok) {
        toast.error("Could not create stream job");
        return;
      }
      const data = await res.json();
      setApiExampleJobId(data.jobId);
      setJob(data);
      toast.success("Stream job created — push JSON batches via API");
      void refreshJobs();
    } catch {
      toast.error("Could not create stream job");
    }
  }, [platform, entityType, strategy, mapping, refreshJobs]);

  const revertJob = useCallback(
    async (jobId: string) => {
      const ok = window.confirm(
        "Revert this migration?\n\n• Records created by this job will be deleted\n• Records updated by this job will be restored to their prior values\n\nThis cannot be undone.",
      );
      if (!ok) return;
      setRevertingId(jobId);
      try {
        const res = await fetch(
          `${CRM_API_URL}/crm/migration/jobs/${jobId}/revert`,
          {
            method: "POST",
            headers: authHeaders(),
          },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err?.message || "Revert failed");
          return;
        }
        const data = await res.json();
        toast.success(
          `Reverted — restored ${data.restored ?? 0}, deleted ${data.deleted ?? 0}`,
        );
        if (job?.jobId === jobId) {
          const refreshed = await fetch(
            `${CRM_API_URL}/crm/migration/jobs/${jobId}`,
            { headers: authHeaders() },
          );
          if (refreshed.ok) setJob(await refreshed.json());
        }
        void refreshJobs();
      } catch {
        toast.error("Revert failed");
      } finally {
        setRevertingId(null);
      }
    },
    [job?.jobId, refreshJobs],
  );

  if (!isLoaded) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!canWrite) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <p className="text-slate-600">
          You need write access to leads, contacts, or organizations to
          run migrations.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6 md:p-8">
      <div className="flex items-start gap-3">
        <Link
          href="/crm/settings"
          className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Database className="h-6 w-6 text-slate-700" />
            Data migration
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Bring companies, contacts, leads, notes, calls, meetings, and
            relationship edges from HubSpot, Salesforce, Zoho, Pipedrive, or any
            custom CRM — preserving source IDs and links as they were. Every
            write is snapshotted so a bad import can be reverted.
          </p>
        </div>
      </div>

      <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div>
          <p className="font-medium">Safe by default — and revertible</p>
          <p className="mt-0.5 text-xs text-amber-900/80">
            Prefer <strong>Merge</strong> or <strong>Skip</strong>. Migrations
            never wipe your CRM wholesale. If a job still goes wrong, use{" "}
            <strong>Revert</strong> to restore overwritten records and remove
            ones that job created.
          </p>
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">1. Source platform</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {platforms.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlatform(p.id)}
              className={cn(
                "rounded-md border px-3 py-3 text-left transition-colors",
                platform === p.id
                  ? "border-slate-900 bg-slate-50"
                  : "border-slate-200 hover:border-slate-300",
              )}
            >
              <div className="text-sm font-medium text-slate-900">{p.label}</div>
              <div className="mt-1 text-xs text-slate-500">{p.description}</div>
            </button>
          ))}
        </div>
        {selectedPlatform && (
          <p className="mt-3 text-xs text-slate-500">
            Recommended order: {selectedPlatform.recommendedOrder}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">2. Entity + file</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-600">
            Entity type
            <select
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                setHeaders([]);
                setMapping({});
                setTargetFields([]);
              }}
            >
              {(selectedPlatform?.entities || Object.keys(ENTITY_LABELS)).map(
                (e) => (
                  <option key={e} value={e}>
                    {ENTITY_LABELS[e] || e}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Duplicate strategy
            <select
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
            >
              {STRATEGIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label} — {s.tip}
                </option>
              ))}
            </select>
          </label>
        </div>
        {strategy === "replace" && (
          <p className="mt-2 text-xs text-amber-700">
            Replace overwrites matched fields. Snapshots are kept so you can
            still revert the whole job.
          </p>
        )}
        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center hover:bg-slate-100">
          <Upload className="h-6 w-6 text-slate-500" />
          <span className="mt-2 text-sm text-slate-700">
            {file ? file.name : "Upload CSV / Excel export"}
          </span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setHeaders([]);
              setMapping({});
            }}
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!file || previewing}
            onClick={() => void runPreview()}
          >
            {previewing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Preview & auto-map
          </Button>
          <Button
            type="button"
            disabled={!file || starting}
            onClick={() => void startImport()}
          >
            {starting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Start migration
          </Button>
        </div>
      </section>

      {headers.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            3. Field mapping
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Map source columns to 2Bigha fields. Source IDs keep company ↔
            contact ↔ note links intact.
          </p>
          <div className="mt-4 space-y-2">
            {(targetFields.length
              ? targetFields
              : Object.keys(mapping).map((k) => ({ key: k, label: k }))
            ).map((f) => (
              <div
                key={f.key}
                className="grid grid-cols-[1fr_1fr] items-center gap-3"
              >
                <div className="text-sm text-slate-700">{f.label}</div>
                <select
                  className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  value={mapping[f.key] || ""}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [f.key]: e.target.value }))
                  }
                >
                  <option value="">— skip —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>
      )}

      {job && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            {job.status === "completed" || job.status === "reverted" ? (
              <CheckCircle2
                className={cn(
                  "h-4 w-4",
                  job.status === "reverted"
                    ? "text-slate-500"
                    : "text-emerald-600",
                )}
              />
            ) : job.status === "failed" ? (
              <AlertCircle className="h-4 w-4 text-red-600" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-slate-600" />
            )}
            Job {job.jobId.slice(-8)} — {job.status}
          </h2>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-slate-900 transition-all"
              style={{ width: `${job.progress || 0}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-600">
            {job.processed}/{job.total} processed · {job.createdCount} created ·{" "}
            {job.mergedCount} merged · {job.skippedCount} skipped ·{" "}
            {job.failedCount} failed
          </p>
          {job.status === "reverted" && (
            <p className="mt-2 text-xs text-slate-600">
              Reverted — restored {job.revertRestoredCount ?? 0}, deleted{" "}
              {job.revertDeletedCount ?? 0}
            </p>
          )}
          {job.error && (
            <p className="mt-2 text-xs text-red-600">{job.error}</p>
          )}
          {!!job.errorSamples?.length && (
            <ul className="mt-2 max-h-32 space-y-1 overflow-auto text-xs text-slate-500">
              {job.errorSamples.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {job.revertible && (
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              disabled={revertingId === job.jobId}
              onClick={() => void revertJob(job.jobId)}
            >
              {revertingId === job.jobId ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" />
              )}
              Revert this job
            </Button>
          )}
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">
            Recent migration jobs
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void refreshJobs()}
          >
            Refresh
          </Button>
        </div>
        {recentJobs.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">No jobs yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {recentJobs.map((j) => (
              <li
                key={j.jobId}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-slate-900">
                    {ENTITY_LABELS[j.entityType] || j.entityType}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {j.platform} · {j.status}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {j.sourceFileName || j.jobId.slice(-8)}
                    {j.createdAt
                      ? ` · ${new Date(j.createdAt).toLocaleString()}`
                      : ""}
                    {` · ${j.createdCount ?? 0} created / ${j.mergedCount ?? 0} merged`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setJob(j)}
                  >
                    View
                  </Button>
                  {j.revertible ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={revertingId === j.jobId}
                      onClick={() => void revertJob(j.jobId)}
                    >
                      {revertingId === j.jobId ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                      )}
                      Revert
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-slate-50 p-5">
        <h2 className="text-sm font-semibold text-slate-900">
          Crore-scale / custom CRM API
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          Import order: companies → contacts → leads → notes/calls →
          associations. Every source field is kept under{" "}
          <code className="rounded bg-slate-200 px-1">_sourcePayload</code>.
          Use an associations file (fromType/fromId/toType/toId) to recreate
          relationships exactly as in your custom CRM. Stream jobs are also
          revertible via{" "}
          <code className="rounded bg-slate-200 px-1">
            POST /crm/migration/jobs/:id/revert
          </code>
          .
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          onClick={() => void createStreamJob()}
        >
          Create stream job
        </Button>
        {apiExampleJobId && (
          <pre className="mt-3 overflow-auto rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
{`POST /crm/migration/jobs/${apiExampleJobId}/batches
Authorization: Bearer <token>
Content-Type: application/json

{
  "rows": [
    { "name": "Acme", "externalId": "src_1", "website": "acme.com" }
  ]
}

# When finished:
POST /crm/migration/jobs/${apiExampleJobId}/complete

# If something went wrong:
POST /crm/migration/jobs/${apiExampleJobId}/revert`}
          </pre>
        )}
      </section>
    </div>
  );
}
