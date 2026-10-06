"use client";

import { useState, useEffect } from "react";
import {
  Cloud,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  Building2,
  TreePine,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { CrmButton } from "@/components/crm/ui";
import { TwoBighaSyncStatusBadge } from "@/components/crm/platform/TwoBighaSyncStatusBadge";
import {
  fetchTwoBighaClientProfile,
  fetchTwoBighaClientMetaData,
  fetchTwoBighaClientProperties,
  resyncTwoBighaClient,
  type TwoBighaClientFetchResult,
  type TwoBighaSyncStatus,
  type ClientMetaDataResponse,
  type LeadPropertyCounts,
} from "@/portals/crm/lib/twobigha-client-api";

type ClientSyncFields = {
  _id?: string;
  twobighaUserId?: string;
  twobighaSyncStatus?: TwoBighaSyncStatus;
  twobighaSyncError?: string;
  twobighaSyncedAt?: string;
};

export default function TwoBighaClientPlatformPanel({
  clientId,
  client,
  onUpdated,
}: {
  clientId: string;
  client: ClientSyncFields;
  onUpdated?: () => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState<TwoBighaClientFetchResult | null>(null);
  const [meta, setMeta] = useState<ClientMetaDataResponse | null>(null);
  const [propCounts, setPropCounts] = useState<LeadPropertyCounts | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);

  useEffect(() => {
    if (client.twobighaUserId) {
      setMetaLoading(true);
      Promise.all([
        fetchTwoBighaClientMetaData(clientId).catch(() => null),
        fetchTwoBighaClientProperties(clientId, { limit: 1 }).catch(() => null),
      ])
        .then(([metaData, propData]) => {
          if (metaData) setMeta(metaData);
          if (propData?.counts) setPropCounts(propData.counts);
        })
        .finally(() => setMetaLoading(false));
    }
  }, [clientId, client.twobighaUserId]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await resyncTwoBighaClient(clientId);
      if (result.twobighaSyncStatus === "synced" || result.twobighaSyncStatus === "mock") {
        toast.success(
          result.twobighaSyncStatus === "mock"
            ? "Mock sync recorded (2bigha credentials not configured)"
            : `Synced to 2bigha · User ID ${result.twobighaUserId}`,
        );
      } else {
        toast.error(result.twobighaSyncError || "2bigha sync failed");
      }
      setProfile(null);
      onUpdated?.();
    } catch {
      toast.error("Failed to sync client to 2bigha");
    } finally {
      setSyncing(false);
    }
  };

  const loadProfile = async () => {
    if (profile && profileOpen) {
      setProfileOpen(false);
      return;
    }
    setProfileOpen(true);
    if (profile?.status === "fetched" || profile?.status === "mock") return;

    setProfileLoading(true);
    try {
      const data = await fetchTwoBighaClientProfile(clientId);
      setProfile(data);
      if (data.status === "failed") {
        toast.error(data.error || "Could not load 2bigha profile");
      }
    } catch {
      toast.error("Failed to load 2bigha platform profile");
    } finally {
      setProfileLoading(false);
    }
  };

  const user = profile?.user;
  const canSync = client.twobighaSyncStatus !== "synced" && client.twobighaSyncStatus !== "mock";

  const totalProps = propCounts?.all ?? meta?.property?.total ?? 0;
  const approvedProps = propCounts?.approved ?? meta?.property?.approved ?? 0;
  const pendingProps = propCounts?.pending ?? meta?.property?.pending ?? 0;
  const rejectedProps = propCounts?.rejected ?? meta?.property?.rejected ?? 0;

  return (
    <div className="rounded-[var(--crm-radius-ui)] border border-border bg-card p-4 shadow-xs space-y-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold text-text-muted flex items-center gap-1.5">
            <Cloud size={14} className="text-primary" />
            2bigha Platform Client
          </h3>
          <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">
            Live 2bigha profile, property counts & active plan snapshot.
          </p>
        </div>
        <TwoBighaSyncStatusBadge status={client.twobighaSyncStatus} error={client.twobighaSyncError} />
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between gap-2">
          <span className="text-text-muted">Platform User ID</span>
          <span className="font-mono font-semibold text-text truncate max-w-[180px]" title={client.twobighaUserId}>
            {client.twobighaUserId || "—"}
          </span>
        </div>
        {client.twobighaSyncedAt ? (
          <div className="flex justify-between gap-2">
            <span className="text-text-muted">Last sync</span>
            <span className="text-text">{new Date(client.twobighaSyncedAt).toLocaleString()}</span>
          </div>
        ) : null}
        {client.twobighaSyncError ? (
          <p className="text-[11px] text-amber-700 bg-amber-50 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 rounded-md px-2.5 py-1.5">
            {client.twobighaSyncError}
          </p>
        ) : null}
      </div>

      {/* 2Bigha Meta Counts Summary */}
      <div className="pt-2 border-t border-border space-y-2.5">
        {/* Active Subscription Badge */}
        {meta?.subscription ? (
          <div className="flex items-center justify-between p-2 rounded-md bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-xs">
            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-bold">
              <ShieldCheck size={13} />
              <span>{meta.subscription.planName || "Active Plan"}</span>
            </div>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 capitalize font-medium">
              {meta.subscription.status || "ACTIVE"}
            </span>
          </div>
        ) : null}

        {/* Quick property/farm counters */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded-md bg-muted/40 border border-border">
            <div className="flex items-center justify-between text-[11px] text-text-muted mb-1">
              <div className="flex items-center gap-1">
                <Building2 size={11} className="text-primary" />
                <span className="font-bold">Properties</span>
              </div>
              <span className="font-mono font-bold text-text">{totalProps}</span>
            </div>
            <div className="flex items-center justify-between font-mono text-[10px] pt-1 border-t border-border/50">
              <span className="text-emerald-600 font-medium">✓ {approvedProps}</span>
              <span className="text-amber-600 font-medium">⌛ {pendingProps}</span>
              {rejectedProps > 0 && <span className="text-rose-600 font-medium">✗ {rejectedProps}</span>}
            </div>
          </div>

          <div className="p-2 rounded-md bg-muted/40 border border-border">
            <div className="flex items-center justify-between text-[11px] text-text-muted mb-1">
              <div className="flex items-center gap-1">
                <TreePine size={11} className="text-emerald-600" />
                <span className="font-bold">Farmhouses</span>
              </div>
              <span className="font-mono font-bold text-text">{meta?.farm?.total ?? 0}</span>
            </div>
            <div className="flex items-center justify-between font-mono text-[10px] pt-1 border-t border-border/50">
              <span className="text-emerald-600 font-medium">✓ {meta?.farm?.approved ?? 0}</span>
              <span className="text-amber-600 font-medium">⌛ {meta?.farm?.pending ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {(canSync || !client.twobighaUserId) && (
          <CrmButton
            type="button"
            variant="secondary"
            disabled={syncing}
            onClick={() => void handleSync()}
            className="!h-7 text-xs gap-1.5"
          >
            {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {client.twobighaUserId ? "Retry sync" : "Sync to 2bigha"}
          </CrmButton>
        )}
        {client.twobighaUserId ? (
          <CrmButton
            type="button"
            variant="ghost"
            onClick={() => void loadProfile()}
            className="!h-7 text-xs gap-1.5"
          >
            {profileLoading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : profileOpen ? (
              <ChevronUp size={13} />
            ) : (
              <ChevronDown size={13} />
            )}
            {profileOpen ? "Hide live profile" : "View live profile"}
          </CrmButton>
        ) : null}
      </div>

      {profileOpen && client.twobighaUserId ? (
        <div className="border-t border-border pt-3 animate-in fade-in duration-200">
          {profileLoading ? (
            <div className="flex items-center gap-2 text-xs text-text-muted py-2">
              <Loader2 size={14} className="animate-spin" /> Loading from 2bigha…
            </div>
          ) : user ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              {[
                ["Email", user.email],
                ["Name", [user.firstName, user.lastName].filter(Boolean).join(" ") || "—"],
                ["Role", user.role],
                ["Active", user.isActive ? "Yes" : "No"],
                ["Phone", user.profile?.phone],
                ["City", user.profile?.city],
                ["State", user.profile?.state],
                ["Experience", user.profile?.experience != null ? String(user.profile.experience) : undefined],
                ["Rating", user.profile?.rating != null ? String(user.profile.rating) : undefined],
              ]
                .filter(([, v]) => v != null && v !== "")
                .map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-text-muted">{label}</dt>
                    <dd className="font-medium text-text truncate">{value}</dd>
                  </div>
                ))}
            </dl>
          ) : (
            <p className="text-xs text-text-muted">
              {profile?.error || "No profile data returned from 2bigha."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
