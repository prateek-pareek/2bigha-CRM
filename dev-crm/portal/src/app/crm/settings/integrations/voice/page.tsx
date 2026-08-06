"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  Phone,
  Key,
  CheckCircle2,
  ExternalLink,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { CrmButton } from "@/components/crm/ui";
import { cn } from "@/lib/utils";

type VoiceProviderId = "twilio" | "readymode" | "elevenlabs";

type VoiceConfig = {
  activeProvider: VoiceProviderId;
  providers: {
    twilio: {
      enabled?: boolean;
      accountSid?: string;
      authToken?: string;
      fromNumber?: string;
      agentPhone?: string;
    };
    readymode: {
      enabled?: boolean;
      apiKey?: string;
      apiUrl?: string;
      campaignId?: string;
      authHeaderName?: string;
    };
    elevenlabs: {
      enabled?: boolean;
      apiKey?: string;
      agentId?: string;
      agentPhoneNumberId?: string;
    };
  };
};

const PROVIDERS: {
  id: VoiceProviderId;
  name: string;
  blurb: string;
  docs?: string;
}[] = [
  {
    id: "twilio",
    name: "Twilio",
    blurb: "Human click-to-call: rings your phone, then bridges to the lead.",
    docs: "https://www.twilio.com/docs/voice",
  },
  {
    id: "readymode",
    name: "Readymode",
    blurb: "Outbound dialer / engagement platform for sales teams.",
    docs: "https://readymode.com",
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    blurb: "AI voice agent outbound calls (via ElevenLabs + Twilio number).",
    docs: "https://elevenlabs.io/docs/api-reference/twilio/outbound-call",
  },
];

const INP =
  "w-full h-10 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white px-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--primary)]/40 focus:ring-2 focus:ring-[var(--primary)]/10";
const LBL = "block text-xs font-semibold text-[var(--text-muted)] mb-1.5";

const emptyConfig = (): VoiceConfig => ({
  activeProvider: "twilio",
  providers: {
    twilio: { enabled: false, accountSid: "", authToken: "", fromNumber: "", agentPhone: "" },
    readymode: {
      enabled: false,
      apiKey: "",
      apiUrl: "",
      campaignId: "",
      authHeaderName: "Authorization",
    },
    elevenlabs: { enabled: false, apiKey: "", agentId: "", agentPhoneNumberId: "" },
  },
});

export default function VoiceCallingIntegrationPage() {
  const [config, setConfig] = useState<VoiceConfig>(emptyConfig());
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<VoiceProviderId>("twilio");

  const fetchConfig = async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/integrations/voice`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setIsActive(!!data.isActive);
      if (data.config) {
        setConfig({
          ...emptyConfig(),
          ...data.config,
          providers: {
            twilio: { ...emptyConfig().providers.twilio, ...data.config.providers?.twilio },
            readymode: {
              ...emptyConfig().providers.readymode,
              ...data.config.providers?.readymode,
            },
            elevenlabs: {
              ...emptyConfig().providers.elevenlabs,
              ...data.config.providers?.elevenlabs,
            },
          },
        });
        setTab(data.config.activeProvider || "twilio");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchConfig();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/integrations/voice`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive, config }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Save failed");
      }
      toast.success("Voice calling settings saved");
      await fetchConfig();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-8 text-sm text-[var(--text-muted)]">
        Loading voice settings…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex items-start gap-3">
        <Link
          href="/crm/settings/integrations"
          className="mt-0.5 rounded-full p-2 text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)]"
        >
          <ChevronLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-main)]">Voice calling</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Call leads from CRM. Pick Twilio,{" "}
            <a
              href="https://readymode.com"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-[var(--primary)] hover:underline"
            >
              Readymode
            </a>
            , or ElevenLabs as the active provider.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        <div className="rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-[var(--primary)]" />
              <div>
                <p className="text-sm font-semibold text-[var(--text-main)]">Active provider</p>
                <p className="text-xs text-[var(--text-muted)]">
                  Lead Call uses this provider by default
                </p>
              </div>
            </div>
            <label className="inline-flex items-center gap-2 rounded-lg bg-[var(--surface-dim)] px-3 py-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-[var(--border-color)]"
              />
              Enabled
            </label>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setTab(p.id);
                  setConfig((c) => ({ ...c, activeProvider: p.id }));
                }}
                className={cn(
                  "rounded-[var(--crm-radius-ui)] border p-3 text-left transition",
                  config.activeProvider === p.id
                    ? "border-[var(--primary)] bg-[var(--primary-light)] ring-1 ring-[var(--primary)]/20"
                    : "border-[var(--border-color)] hover:bg-[var(--surface-dim)]",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[var(--text-main)]">{p.name}</span>
                  {config.activeProvider === p.id && (
                    <CheckCircle2 size={14} className="text-[var(--primary)]" />
                  )}
                </div>
                <p className="mt-1 text-[11px] leading-snug text-[var(--text-muted)]">{p.blurb}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white p-5 shadow-sm space-y-4">
          <div className="flex gap-2 border-b border-[var(--border-color)] pb-3">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setTab(p.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold",
                  tab === p.id
                    ? "bg-[var(--primary-light)] text-[var(--primary)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-dim)]",
                )}
              >
                {p.name}
              </button>
            ))}
          </div>

          {tab === "twilio" && (
            <div className="space-y-4">
              <label className="inline-flex items-center gap-2 text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={!!config.providers.twilio.enabled}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      providers: {
                        ...c.providers,
                        twilio: { ...c.providers.twilio, enabled: e.target.checked },
                      },
                    }))
                  }
                />
                Enable Twilio
              </label>
              <div>
                <label className={LBL}>Account SID</label>
                <input
                  className={INP}
                  value={config.providers.twilio.accountSid || ""}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      providers: {
                        ...c.providers,
                        twilio: { ...c.providers.twilio, accountSid: e.target.value },
                      },
                    }))
                  }
                  placeholder="ACxxxxxxxx"
                />
              </div>
              <div>
                <label className={LBL}>Auth Token</label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    type="password"
                    className={cn(INP, "pl-9")}
                    value={config.providers.twilio.authToken || ""}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        providers: {
                          ...c.providers,
                          twilio: { ...c.providers.twilio, authToken: e.target.value },
                        },
                      }))
                    }
                    placeholder="••••••••"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={LBL}>From number (E.164)</label>
                  <input
                    className={INP}
                    value={config.providers.twilio.fromNumber || ""}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        providers: {
                          ...c.providers,
                          twilio: { ...c.providers.twilio, fromNumber: e.target.value },
                        },
                      }))
                    }
                    placeholder="+14155552671"
                  />
                </div>
                <div>
                  <label className={LBL}>Your phone (click-to-call)</label>
                  <input
                    className={INP}
                    value={config.providers.twilio.agentPhone || ""}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        providers: {
                          ...c.providers,
                          twilio: { ...c.providers.twilio, agentPhone: e.target.value },
                        },
                      }))
                    }
                    placeholder="+9198…"
                  />
                </div>
              </div>
              <p className="flex gap-2 text-xs text-[var(--text-muted)]">
                <Info size={14} className="mt-0.5 shrink-0" />
                With agent phone set, Twilio rings you first, then connects to the lead.
              </p>
            </div>
          )}

          {tab === "readymode" && (
            <div className="space-y-4">
              <label className="inline-flex items-center gap-2 text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={!!config.providers.readymode.enabled}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      providers: {
                        ...c.providers,
                        readymode: { ...c.providers.readymode, enabled: e.target.checked },
                      },
                    }))
                  }
                />
                Enable Readymode
              </label>
              <div>
                <label className={LBL}>API URL (click-to-call endpoint)</label>
                <input
                  className={INP}
                  value={config.providers.readymode.apiUrl || ""}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      providers: {
                        ...c.providers,
                        readymode: { ...c.providers.readymode, apiUrl: e.target.value },
                      },
                    }))
                  }
                  placeholder="https://…"
                />
              </div>
              <div>
                <label className={LBL}>API key / token</label>
                <input
                  type="password"
                  className={INP}
                  value={config.providers.readymode.apiKey || ""}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      providers: {
                        ...c.providers,
                        readymode: { ...c.providers.readymode, apiKey: e.target.value },
                      },
                    }))
                  }
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={LBL}>Campaign ID (optional)</label>
                  <input
                    className={INP}
                    value={config.providers.readymode.campaignId || ""}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        providers: {
                          ...c.providers,
                          readymode: { ...c.providers.readymode, campaignId: e.target.value },
                        },
                      }))
                    }
                  />
                </div>
                <div>
                  <label className={LBL}>Auth header name</label>
                  <input
                    className={INP}
                    value={config.providers.readymode.authHeaderName || "Authorization"}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        providers: {
                          ...c.providers,
                          readymode: {
                            ...c.providers.readymode,
                            authHeaderName: e.target.value,
                          },
                        },
                      }))
                    }
                  />
                </div>
              </div>
              <a
                href="https://readymode.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)] hover:underline"
              >
                Readymode docs <ExternalLink size={12} />
              </a>
            </div>
          )}

          {tab === "elevenlabs" && (
            <div className="space-y-4">
              <label className="inline-flex items-center gap-2 text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={!!config.providers.elevenlabs.enabled}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      providers: {
                        ...c.providers,
                        elevenlabs: { ...c.providers.elevenlabs, enabled: e.target.checked },
                      },
                    }))
                  }
                />
                Enable ElevenLabs AI agent
              </label>
              <div>
                <label className={LBL}>API key</label>
                <input
                  type="password"
                  className={INP}
                  value={config.providers.elevenlabs.apiKey || ""}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      providers: {
                        ...c.providers,
                        elevenlabs: { ...c.providers.elevenlabs, apiKey: e.target.value },
                      },
                    }))
                  }
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={LBL}>Agent ID</label>
                  <input
                    className={INP}
                    value={config.providers.elevenlabs.agentId || ""}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        providers: {
                          ...c.providers,
                          elevenlabs: { ...c.providers.elevenlabs, agentId: e.target.value },
                        },
                      }))
                    }
                  />
                </div>
                <div>
                  <label className={LBL}>Agent phone number ID</label>
                  <input
                    className={INP}
                    value={config.providers.elevenlabs.agentPhoneNumberId || ""}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        providers: {
                          ...c.providers,
                          elevenlabs: {
                            ...c.providers.elevenlabs,
                            agentPhoneNumberId: e.target.value,
                          },
                        },
                      }))
                    }
                  />
                </div>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Uses ElevenLabs{" "}
                <code className="rounded bg-[var(--surface-dim)] px-1">
                  /v1/convai/twilio/outbound-call
                </code>
                . Link a Twilio number in the ElevenLabs phone numbers dashboard first.
              </p>
            </div>
          )}
        </div>

        <CrmButton type="submit" disabled={saving} className="h-11 px-6">
          {saving ? "Saving…" : "Save configuration"}
        </CrmButton>
      </form>
    </div>
  );
}
