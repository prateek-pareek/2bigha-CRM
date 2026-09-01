"use client";

import { useState } from "react";
import { Cloud, ChevronDown, ChevronUp, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { CrmButton } from "@/components/crm/ui";
import { TwoBighaSyncStatusBadge } from "@/components/crm/platform/TwoBighaSyncStatusBadge";
import {
  fetchTwoBighaClientProfile,
  resyncTwoBighaClient,
  type TwoBighaClientFetchResult,
  type TwoBighaSyncStatus,
} from "@/lib/crm/twobigha-client-api";

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

  return (
    <div className="rounded-[var(--crm-radius-ui)] border border-border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold text-text-muted flex items-center gap-1.5">
            <Cloud size={14} className="text-primary" />
            2bigha Platform User
          </h3>
          <p className="text-[11px] text-text-muted mt-1 leading-relaxed">
            CRM client ↔ 2bigha platform user. Required for lead sync and PM subscriptions.
          </p>
        </div>
        <TwoBighaSyncStatusBadge status={client.twobighaSyncStatus} error={client.twobighaSyncError} />
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between gap-2">
          <span className="text-text-muted">Platform user ID</span>
          <span className="font-mono font-semibold text-text-main truncate max-w-[180px]" title={client.twobighaUserId}>
            {client.twobighaUserId || "—"}
          </span>
        </div>
        {client.twobighaSyncedAt ? (
          <div className="flex justify-between gap-2">
            <span className="text-text-muted">Last sync</span>
            <span className="text-text-main">{new Date(client.twobighaSyncedAt).toLocaleString()}</span>
          </div>
        ) : null}
        {client.twobighaSyncError ? (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2.5 py-2">
            {client.twobighaSyncError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {(canSync || !client.twobighaUserId) && (
          <CrmButton
            type="button"
            variant="secondary"
            disabled={syncing}
            onClick={() => void handleSync()}
            className="h-8 text-xs gap-1.5"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {client.twobighaUserId ? "Retry sync" : "Sync to 2bigha"}
          </CrmButton>
        )}
        {client.twobighaUserId ? (
          <CrmButton
            type="button"
            variant="ghost"
            onClick={() => void loadProfile()}
            className="h-8 text-xs gap-1.5"
          >
            {profileLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : profileOpen ? (
              <ChevronUp size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
            {profileOpen ? "Hide profile" : "View live profile"}
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
                    <dd className="font-medium text-text-main truncate">{value}</dd>
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
