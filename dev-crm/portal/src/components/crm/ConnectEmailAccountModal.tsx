"use client";

import { useState, useEffect, useMemo } from "react";
import { X, Mail, Loader2, CheckCircle2, Server } from "lucide-react";
import { CRM_API_URL } from "@/lib/api/config";
import { Button } from "@/components/hrms/ui/button";
import { toast } from "sonner";
import { EMAIL_PROVIDER_PRESETS } from "@/components/crm/email-provider-presets";
import {
  INBOX_OUTREACH_OPTIONS,
  type InboxAccountOutreachType,
} from "@/lib/crm/inbox-outreach";

import { crmModalChrome } from '@/lib/pm/jira-ui';

interface ConnectEmailAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after connect; optional new account id for initial IMAP sync. */
  onSuccess: (newAccountId?: string) => void;
}

type ProviderRow = { id: string; name: string; hint: string };

const PROVIDERS: ProviderRow[] = [
  { id: "gmail", name: "Gmail", hint: "Sign in with Google, or use an app password for manual setup." },
  {
    id: "outlook",
    name: "Microsoft 365 / Outlook (work or school)",
    hint: "Same IMAP/SMTP worldwide (including India): outlook.office365.com / smtp.office365.com. Microsoft sign-in uses your Entra app below; or use manual setup with your password.",
  },
  {
    id: "outlook_personal",
    name: "Outlook.com / Hotmail / Live (personal)",
    hint: "Consumer mail: imap-mail.outlook.com:993, smtp-mail.outlook.com:587 (STARTTLS). Use your Microsoft password or an app password if enabled.",
  },
  { id: "yahoo", name: "Yahoo Mail", hint: "Use an app password from Yahoo Account Security." },
  { id: "zoho", name: "Zoho Mail", hint: "Global accounts (zoho.com). EU hosting: choose Zoho Mail (EU)." },
  { id: "zoho_eu", name: "Zoho Mail (EU)", hint: "For mail hosted on zoho.eu (EU data center)." },
  {
    id: "zoho_in",
    name: "Zoho Mail (India)",
    hint: "India data center: IMAP imap.zoho.in:993, SMTP smtp.zoho.in:465 (SSL). Use your full Zoho mail address and password.",
  },
  {
    id: "godaddy",
    name: "GoDaddy Email",
    hint: "Classic GoDaddy Workspace / secureserver.net. Microsoft 365 via GoDaddy → use Outlook instead.",
  },
  {
    id: "hostinger",
    name: "Hostinger Email",
    hint: "IMAP imap.hostinger.com:993 · SMTP smtp.hostinger.com:465 (SSL). Use full email + mailbox password from hPanel → Emails.",
  },
  { id: "ionos", name: "IONOS / 1&1 Mail", hint: "IONOS hosted email." },
  { id: "other", name: "Custom (other provider)", hint: "Enter your own IMAP and SMTP hostnames and ports." },
];

export default function ConnectEmailAccountModal({ isOpen, onClose, onSuccess }: ConnectEmailAccountModalProps) {
  const [provider, setProvider] = useState("gmail");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState(993);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [outreachType, setOutreachType] = useState<'' | InboxAccountOutreachType>('');
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "microsoft" | null>(null);
  const [fetchedPresets, setFetchedPresets] = useState<Record<string, { imap: { host: string; port: number }; smtp: { host: string; port: number } }> | null>(null);

  const isOther = provider === "other";
  const isGmail = provider === "gmail";
  /** OAuth “Continue with Microsoft” only for M365 / work outlook preset */
  const isOutlook = provider === "outlook" || provider === "outlook_personal";

  const mergedPresets = useMemo(() => {
    return { ...EMAIL_PROVIDER_PRESETS, ...(fetchedPresets || {}) };
  }, [fetchedPresets]);

  useEffect(() => {
    if (!isOpen) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    fetch(`${CRM_API_URL}/crm/inbox-accounts/providers`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data === "object") setFetchedPresets(data as typeof fetchedPresets);
      })
      .catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (provider === "other") {
      setImapHost("");
      setImapPort(993);
      setSmtpHost("");
      setSmtpPort(587);
      return;
    }
    const cfg = mergedPresets[provider];
    if (!cfg?.imap?.host || !cfg?.smtp?.host) return;
    setImapHost(cfg.imap.host);
    setImapPort(cfg.imap.port);
    setSmtpHost(cfg.smtp.host);
    setSmtpPort(cfg.smtp.port);
  }, [provider, mergedPresets]);

  // Custom provider convenience: when one side is entered and the other is blank,
  // suggest the matching host so incoming + outgoing are configured together.
  useEffect(() => {
    if (!isOther) return;
    const im = imapHost.trim();
    const sm = smtpHost.trim();
    if (!sm && /^imap\./i.test(im)) {
      setSmtpHost(im.replace(/^imap\./i, "smtp."));
      return;
    }
    if (!im && /^smtp\./i.test(sm)) {
      setImapHost(sm.replace(/^smtp\./i, "imap."));
    }
  }, [isOther, imapHost, smtpHost]);

  const startOAuth = async (kind: "google" | "microsoft") => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("Please sign in again");
      return;
    }
    setOauthLoading(kind);
    try {
      const path = kind === "google" ? "oauth/google/authorize" : "oauth/microsoft/authorize";
      const res = await fetch(`${CRM_API_URL}/crm/inbox-accounts/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || `Could not start ${kind === "google" ? "Google" : "Microsoft"} sign-in`);
        setOauthLoading(null);
        return;
      }
      if (data?.url) {
        window.location.href = data.url as string;
        return;
      }
      toast.error("Invalid response from server");
    } catch {
      toast.error("Could not start sign-in");
    } finally {
      setOauthLoading(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Email and password are required");
      return;
    }
    if (isOther && (!imapHost?.trim() || !smtpHost?.trim())) {
      toast.error("IMAP and SMTP hosts are required for a custom provider");
      return;
    }

    setSubmitting(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/inbox-accounts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email,
          provider,
          displayName: displayName || email,
          password,
          // Persist both incoming (IMAP) and outgoing (SMTP) server settings.
          // For known providers these are auto-filled from presets; for custom they come from form inputs.
          ...(imapHost?.trim() ? { imapHost: imapHost.trim() } : {}),
          ...(imapPort ? { imapPort } : {}),
          ...(smtpHost?.trim() ? { smtpHost: smtpHost.trim() } : {}),
          ...(smtpPort ? { smtpPort } : {}),
          ...(outreachType ? { outreachType } : {}),
        }),
      });
      if (res.ok) {
        const created = await res.json().catch(() => null);
        const newId =
          created && typeof created === 'object' && created._id
            ? String(created._id)
            : undefined;
        toast.success("Email account connected successfully");
        onSuccess(newId);
        onClose();
        setEmail("");
        setPassword("");
        setDisplayName("");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.message || "Failed to connect account");
      }
    } catch {
      toast.error("Failed to connect account");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const currentHint = PROVIDERS.find((p) => p.id === provider)?.hint;

  return (
    <div className={`${crmModalChrome.overlay} z-[1000] flex items-center justify-center p-4`}>
      <div className={crmModalChrome.backdrop} onClick={onClose} />
      <div className={`${crmModalChrome.centerShell} max-w-lg max-h-[90vh] crm-jira-modal flex flex-col overflow-y-auto`}>
        <div className={crmModalChrome.centerHeader}>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] border border-[#dfe1e6] bg-[#deebff] text-[#0c66e4]">
              <Mail size={18} strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h2 className={crmModalChrome.centerTitle}>Connect email account</h2>
              <p className={crmModalChrome.centerLead}>Choose a provider — servers fill in automatically</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className={crmModalChrome.closeBtn} aria-label="Close">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={`${crmModalChrome.centerBody} space-y-6`}>
          <div>
            <label className="text-xs font-black text-text-muted px-1">Email provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="mt-2 block w-full rounded-[3px] border border-border bg-surface-dim/30 text-sm font-bold h-12 px-5 focus:ring-4 focus:ring-primary/5 outline-none"
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {currentHint ? <p className="mt-1.5 text-xs text-text-muted font-medium leading-relaxed">{currentHint}</p> : null}
          </div>

          {!isOther && imapHost && smtpHost ? (
            <div className="rounded-[3px] border border-border bg-surface-dim/30 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-black text-text-muted">
                <Server className="h-3.5 w-3.5" />
                Mail servers (auto-filled)
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-xs font-bold text-text-muted uppercase mb-1">IMAP</p>
                  <p className="font-mono font-semibold text-text-main break-all">{imapHost}</p>
                  <p className="text-text-muted mt-0.5">Port {imapPort} (SSL)</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-text-muted uppercase mb-1">SMTP</p>
                  <p className="font-mono font-semibold text-text-main break-all">{smtpHost}</p>
                  <p className="text-text-muted mt-0.5">
                    Port {smtpPort} {smtpPort === 465 ? "(SSL)" : "(STARTTLS)"}
                  </p>
                </div>
              </div>
              <p className="text-xs text-text-muted leading-snug">
                Need different hosts? Choose <span className="font-semibold text-text-main">Custom (other provider)</span> and enter them manually.
              </p>
            </div>
          ) : null}

          {(isGmail || isOutlook) && (
            <div className="space-y-3">
              <Button
                type="button"
                variant="primary"
                className="w-full py-6 rounded-[3px] gap-2 justify-center text-sm font-bold"
                disabled={!!oauthLoading}
                onClick={() => startOAuth(isGmail ? "google" : "microsoft")}
              >
                {oauthLoading === (isGmail ? "google" : "microsoft") ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <>
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
                      {isGmail ? (
                        <path
                          fill="currentColor"
                          d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"
                        />
                      ) : (
                        <path fill="currentColor" d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z" />
                      )}
                    </svg>
                    {isGmail ? "Continue with Google" : "Continue with Microsoft"}
                  </>
                )}
              </Button>
              <p className="text-center text-xs text-text-muted font-medium">
                Opens a secure sign-in page. Approve access once — no app password needed.
              </p>
              {isOutlook && (
                <p className="text-xs text-text-muted font-medium leading-relaxed rounded-[3px] border border-border bg-surface-dim/30 px-3 py-2.5">
                  If Google works but personal Outlook does not, the app registration in Azure is usually limited to work or school accounts only. In Azure Portal: App registrations → your app → Authentication → Supported account types, choose an option that includes personal Microsoft accounts (e.g. multitenant + personal), save, then try Connect again. Work mailboxes on Microsoft 365 use the same button once the app allows your tenant.
                </p>
              )}
              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs font-semibold text-text-muted">
                  <span className="bg-card px-3">Or manual setup</span>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-black text-text-muted px-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-2 block w-full rounded-[3px] border border-border bg-surface-dim/30 text-sm font-bold h-12 px-5"
                required
              />
            </div>
            <div>
              <label className="text-xs font-black text-text-muted px-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="App password or mail password"
                className="mt-2 block w-full rounded-[3px] border border-border bg-surface-dim/30 text-sm font-bold h-12 px-5"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-black text-text-muted px-1">Display name (optional)</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="John Doe"
              className="mt-2 block w-full rounded-[3px] border border-border bg-surface-dim/30 text-sm font-bold h-12 px-5"
            />
          </div>

          <div>
            <label className="text-xs font-black text-text-muted px-1">
              Outreach purpose (optional)
            </label>
            <select
              value={outreachType}
              onChange={(e) =>
                setOutreachType(e.target.value as '' | InboxAccountOutreachType)
              }
              className="mt-2 block w-full rounded-[3px] border border-border bg-surface-dim/30 text-sm font-bold h-12 px-5"
            >
              {INBOX_OUTREACH_OPTIONS.map((opt) => (
                <option key={opt.value || 'unset'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {isOther && (
            <div className="space-y-4 p-4 rounded-[3px] bg-surface-dim/30 border border-border">
              <h4 className="text-xs font-black text-text-muted uppercase">Custom IMAP / SMTP</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-text-muted uppercase px-1">IMAP host</label>
                  <input
                    type="text"
                    value={imapHost}
                    onChange={(e) => setImapHost(e.target.value)}
                    placeholder="imap.example.com"
                    className="mt-1 block w-full rounded-[3px] border border-border bg-card text-xs h-10 px-3"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-text-muted uppercase px-1">IMAP port</label>
                  <input
                    type="number"
                    value={imapPort}
                    onChange={(e) => setImapPort(parseInt(e.target.value, 10) || 993)}
                    className="mt-1 block w-full rounded-[3px] border border-border bg-card text-xs h-10 px-3"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-text-muted uppercase px-1">SMTP host</label>
                  <input
                    type="text"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    placeholder="smtp.example.com"
                    className="mt-1 block w-full rounded-[3px] border border-border bg-card text-xs h-10 px-3"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-text-muted uppercase px-1">SMTP port</label>
                  <input
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(parseInt(e.target.value, 10) || 587)}
                    className="mt-1 block w-full rounded-[3px] border border-border bg-card text-xs h-10 px-3"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-4 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 py-6 rounded-[3px]">
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting || !!oauthLoading} className="flex-[1.5] py-6 rounded-[3px] gap-2">
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
              Connect account
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
