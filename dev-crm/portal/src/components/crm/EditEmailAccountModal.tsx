"use client";

import { useState, useEffect } from 'react';
import { X, Mail, Loader2, CheckCircle2, ChevronDown, Server, RefreshCw } from 'lucide-react';
import { CRM_API_URL } from '@/lib/api/config';
import { Button } from "@/components/hrms/ui/button";
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CrmJiraPortal } from '@/components/crm/CrmJiraPortal';
import { crmModalChrome } from '@/lib/pm/jira-ui';
import {
  INBOX_OUTREACH_OPTIONS,
  type InboxAccountOutreachType,
} from '@/lib/crm/inbox-outreach';
import {
  INBOX_MAIL_PROVIDERS,
  presetServersForProvider,
} from '@/components/crm/inbox-mail-providers';

interface EmailAccount {
  _id: string;
  email: string;
  displayName?: string;
  provider: string;
  isDefault: boolean;
  authType?: 'password' | 'oauth';
  preferImapIdle?: boolean;
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  sendLimitOverride?: {
    enabled?: boolean;
    maxEmailsPerHour?: number | null;
    maxEmailsPerDay?: number | null;
  };
  accountLabel?: string;
  outreachType?: InboxAccountOutreachType;
}

interface EditEmailAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  account: EmailAccount | null;
  isAdmin?: boolean;
  onSyncNow?: (accountId: string) => void | Promise<void>;
}

const fieldClass =
  'mt-1.5 block w-full rounded-[3px] border border-border bg-surface-dim/30 text-sm font-semibold h-10 px-4';
const labelClass =
  'text-[10px] font-black text-text-muted  px-0.5';

export default function EditEmailAccountModal({
  isOpen,
  onClose,
  onSuccess,
  account,
  isAdmin,
  onSyncNow,
}: EditEmailAccountModalProps) {
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [provider, setProvider] = useState('hostinger');
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState(993);
  const [imapSecure, setImapSecure] = useState(true);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [preferImapIdle, setPreferImapIdle] = useState(true);
  const [sendLimitOverrideEnabled, setSendLimitOverrideEnabled] = useState(false);
  const [sendLimitOverrideMaxEmailsPerHour, setSendLimitOverrideMaxEmailsPerHour] = useState(40);
  const [sendLimitOverrideMaxEmailsPerDay, setSendLimitOverrideMaxEmailsPerDay] = useState(200);
  const [accountLabel, setAccountLabel] = useState('');
  const [outreachType, setOutreachType] = useState<'' | InboxAccountOutreachType>('');
  const [submitting, setSubmitting] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [serversOpen, setServersOpen] = useState(true);

  const isPasswordAuth = account?.authType !== 'oauth';

  useEffect(() => {
    if (account) {
      setDisplayName(account.displayName || account.email);
      setProvider(account.provider || 'other');
      setImapHost(account.imapHost || '');
      setImapPort(Number(account.imapPort) || 993);
      setImapSecure(account.imapSecure !== false);
      setSmtpHost(account.smtpHost || '');
      setSmtpPort(Number(account.smtpPort) || 587);
      setSmtpSecure(account.smtpSecure === true || account.smtpPort === 465);
      setIsDefault(account.isDefault);
      setPreferImapIdle(account.preferImapIdle !== false);
      setSendLimitOverrideEnabled(account.sendLimitOverride?.enabled === true);
      setSendLimitOverrideMaxEmailsPerHour(
        Number(account.sendLimitOverride?.maxEmailsPerHour || 40),
      );
      setSendLimitOverrideMaxEmailsPerDay(
        Number(account.sendLimitOverride?.maxEmailsPerDay || 200),
      );
      setAccountLabel(account.accountLabel || '');
      setOutreachType(account.outreachType || '');
      setPassword('');
      setAdvancedOpen(
        account.sendLimitOverride?.enabled === true ||
          account.preferImapIdle === false,
      );
      setServersOpen(isPasswordAuth);
    }
  }, [account, isPasswordAuth]);

  const applyProviderPreset = (providerId: string) => {
    if (providerId === 'other') return;
    const preset = presetServersForProvider(providerId);
    if (!preset) return;
    setImapHost(preset.imapHost);
    setImapPort(preset.imapPort);
    setImapSecure(true);
    setSmtpHost(preset.smtpHost);
    setSmtpPort(preset.smtpPort);
    setSmtpSecure(preset.smtpSecure);
  };

  const buildPayload = (): Record<string, unknown> => {
    const body: Record<string, unknown> = {
      displayName: displayName || account?.email,
      accountLabel,
      outreachType: outreachType || null,
      isDefault,
      sendLimitOverrideEnabled,
      preferImapIdle,
      sendLimitOverrideMaxEmailsPerHour: Math.max(
        1,
        Math.floor(Number(sendLimitOverrideMaxEmailsPerHour || 1)),
      ),
      sendLimitOverrideMaxEmailsPerDay: Math.max(
        Math.max(1, Math.floor(Number(sendLimitOverrideMaxEmailsPerHour || 1))),
        Math.floor(Number(sendLimitOverrideMaxEmailsPerDay || 1)),
      ),
    };
    if (password) body.password = password;
    if (isPasswordAuth) {
      body.provider = provider;
      body.imapHost = imapHost.trim();
      body.imapPort = imapPort;
      body.imapSecure = imapSecure;
      body.smtpHost = smtpHost.trim();
      body.smtpPort = smtpPort;
      body.smtpSecure = smtpSecure;
    }
    return body;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;
    if (isPasswordAuth && (!imapHost.trim() || !smtpHost.trim())) {
      toast.error('IMAP and SMTP host are required');
      return;
    }

    setSubmitting(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/inbox-accounts/${account._id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(buildPayload()),
      });
      if (res.ok) {
        toast.success('Mailbox updated');
        onSuccess();
        onClose();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.message || 'Failed to update account');
      }
    } catch {
      toast.error('Failed to update account');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTestSmtp = async () => {
    if (!account) return;
    setTestingSmtp(true);
    const token = localStorage.getItem('token');
    try {
      if (password.trim()) {
        const saveRes = await fetch(`${CRM_API_URL}/crm/inbox-accounts/${account._id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ password }),
        });
        if (!saveRes.ok) {
          const err = await saveRes.json().catch(() => ({}));
          toast.error(err?.message || 'Could not save password before SMTP test');
          return;
        }
      }
      const res = await fetch(
        `${CRM_API_URL}/crm/inbox-accounts/${account._id}/test-smtp`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        toast.success(data.message || 'SMTP login successful');
        if (data.smtpPort) {
          setSmtpPort(data.smtpPort);
          setSmtpSecure(data.smtpSecure === true);
        }
        onSuccess();
      } else {
        toast.error(data?.message || 'SMTP test failed');
      }
    } catch {
      toast.error('SMTP test failed');
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleSyncNow = async () => {
    if (!account) return;
    if (onSyncNow) {
      setSyncing(true);
      try {
        await onSyncNow(account._id);
      } finally {
        setSyncing(false);
      }
      return;
    }
    setSyncing(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/inbox-accounts/${account._id}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ all: true, limit: 500 }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`Synced ${data?.total ?? 0} messages`);
        onSuccess();
      } else {
        const msg = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
        toast.error(typeof msg === 'string' ? msg : 'Sync failed');
      }
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  if (!isOpen) return null;

  const providerHint = INBOX_MAIL_PROVIDERS.find((p) => p.id === provider)?.hint;

  const modal = (
    <div
      className={cn(crmModalChrome.overlay, "z-[1000] flex items-end justify-center p-0 sm:items-center sm:p-4")}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-email-account-title"
    >
      <div className={crmModalChrome.backdrop} onClick={onClose} aria-hidden />
      <div
        className={cn(
          crmModalChrome.centerShell,
          "crm-jira-modal max-h-[min(92dvh,800px)] sm:max-w-xl",
          "rounded-t-[3px] sm:rounded-[3px]",
        )}
      >
        <div className={crmModalChrome.centerHeader}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] border border-[#dfe1e6] bg-[#deebff] text-[#0c66e4]">
              <Mail size={18} strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h2 id="edit-email-account-title" className={cn(crmModalChrome.centerTitle, "truncate")}>
                Edit mailbox
              </h2>
              <p className={cn(crmModalChrome.centerLead, "truncate")} title={account?.email}>
                {account?.email}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className={crmModalChrome.closeBtn} aria-label="Close">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 custom-scrollbar">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div className="flex justify-between items-center">
                  <label className={labelClass}>Display name</label>
                  {account?.authType === 'oauth' && (
                    <button
                      type="button"
                      onClick={async () => {
                        const token = localStorage.getItem('token');
                        try {
                          const res = await fetch(`${CRM_API_URL}/crm/inbox-accounts/${account._id}/sync-profile`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` },
                          });
                          if (res.ok) {
                            const data = await res.json();
                            toast.success(`Display name updated to: ${data.displayName}`);
                            setDisplayName(data.displayName || '');
                            onSuccess();
                          } else {
                            const err = await res.json();
                            toast.error(err.message || 'Failed to sync profile name');
                          }
                        } catch {
                          toast.error('Failed to sync profile name');
                        }
                      }}
                      className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1 uppercase tracking-wider transition-all"
                    >
                      <RefreshCw size={10} />
                      Sync from Profile
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="John Doe"
                  className={fieldClass}
                />
              </div>

              <div>
                <label className={labelClass}>Mailbox type</label>
                <select
                  value={outreachType}
                  onChange={(e) =>
                    setOutreachType(e.target.value as '' | InboxAccountOutreachType)
                  }
                  className={fieldClass}
                >
                  {INBOX_OUTREACH_OPTIONS.map((opt) => (
                    <option key={opt.value || 'unset'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>Internal label</label>
                <input
                  type="text"
                  value={accountLabel}
                  onChange={(e) => setAccountLabel(e.target.value)}
                  placeholder="e.g. India team"
                  disabled={!isAdmin}
                  className={cn(fieldClass, 'disabled:opacity-60')}
                />
              </div>
            </div>

            {isPasswordAuth ? (
              <>
                <div className="rounded-[3px] border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setServersOpen((o) => !o)}
                    className="flex w-full items-center justify-between gap-2 bg-surface-dim/20 px-4 py-3 text-left hover:bg-surface-dim/40 transition-colors"
                  >
                    <span className="flex items-center gap-2 text-xs font-semibold text-text-muted">
                      <Server size={14} />
                      Mail server (IMAP &amp; SMTP)
                    </span>
                    <ChevronDown
                      size={16}
                      className={cn(
                        'shrink-0 text-text-muted transition-transform',
                        serversOpen && 'rotate-180',
                      )}
                    />
                  </button>
                  {serversOpen && (
                    <div className="space-y-3 border-t border-border px-4 py-3">
                      <div>
                        <label className={labelClass}>Provider</label>
                        <select
                          value={provider}
                          onChange={(e) => {
                            const next = e.target.value;
                            setProvider(next);
                            applyProviderPreset(next);
                          }}
                          className={fieldClass}
                        >
                          {INBOX_MAIL_PROVIDERS.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        {providerHint ? (
                          <p className="mt-1 text-[11px] text-text-muted">{providerHint}</p>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2 sm:col-span-1">
                          <label className={labelClass}>IMAP host</label>
                          <input
                            type="text"
                            value={imapHost}
                            onChange={(e) => setImapHost(e.target.value)}
                            placeholder="imap.hostinger.com"
                            className={fieldClass}
                            required
                          />
                        </div>
                        <div>
                          <label className={labelClass}>IMAP port</label>
                          <input
                            type="number"
                            min={1}
                            value={imapPort}
                            onChange={(e) => setImapPort(Number(e.target.value) || 993)}
                            className={fieldClass}
                          />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <label className={labelClass}>SMTP host</label>
                          <input
                            type="text"
                            value={smtpHost}
                            onChange={(e) => setSmtpHost(e.target.value)}
                            placeholder="smtp.hostinger.com"
                            className={fieldClass}
                            required
                          />
                        </div>
                        <div>
                          <label className={labelClass}>SMTP port</label>
                          <input
                            type="number"
                            min={1}
                            value={smtpPort}
                            onChange={(e) => {
                              const p = Number(e.target.value) || 587;
                              setSmtpPort(p);
                              if (p === 465) setSmtpSecure(true);
                            }}
                            className={fieldClass}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                          <input
                            type="checkbox"
                            checked={imapSecure}
                            onChange={(e) => setImapSecure(e.target.checked)}
                            className="h-4 w-4 rounded border-border"
                          />
                          IMAP SSL/TLS
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                          <input
                            type="checkbox"
                            checked={smtpSecure}
                            onChange={(e) => setSmtpSecure(e.target.checked)}
                            className="h-4 w-4 rounded border-border"
                          />
                          SMTP SSL (port 465)
                        </label>
                      </div>

                      <div>
                        <label className={labelClass}>Mailbox password</label>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Leave blank to keep current"
                          className={fieldClass}
                          autoComplete="new-password"
                        />
                        <p className="mt-1 text-[11px] text-text-muted leading-snug">
                          Match hPanel: IMAP imap.hostinger.com:993 · SMTP smtp.hostinger.com:465 with SMTP SSL on. Full email + mailbox password. If send fails, try port 587 and turn SMTP SSL off.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2 h-9 text-xs font-semibold"
                          disabled={testingSmtp || submitting}
                          onClick={() => void handleTestSmtp()}
                        >
                          {testingSmtp ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : null}
                          Test outgoing (SMTP)
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-text-muted leading-relaxed rounded-[3px] border border-border bg-surface-dim/30 px-3 py-2.5">
                Google or Microsoft sign-in. To change servers or password, remove this account and connect again with manual setup.
              </p>
            )}

            <label className="flex items-center gap-2.5 cursor-pointer py-0.5">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <span className="text-sm font-semibold text-text-main">Default send account</span>
            </label>

            <div className="rounded-[3px] border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setAdvancedOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-2 bg-surface-dim/20 px-4 py-3 text-left hover:bg-surface-dim/40 transition-colors"
              >
                <span className="text-xs font-semibold text-text-muted">
                  Sync & send limits
                </span>
                <ChevronDown
                  size={16}
                  className={cn(
                    'shrink-0 text-text-muted transition-transform',
                    advancedOpen && 'rotate-180',
                  )}
                />
              </button>
              {advancedOpen && (
                <div className="space-y-3 border-t border-border px-4 py-3">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferImapIdle}
                      onChange={(e) => setPreferImapIdle(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-border shrink-0"
                    />
                    <span className="text-sm font-medium text-text-main leading-snug">
                      Prefer IMAP IDLE (realtime). Falls back to polling if unavailable.
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendLimitOverrideEnabled}
                      onChange={(e) => setSendLimitOverrideEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-border"
                    />
                    <span className="text-sm font-semibold text-text-main">
                      Custom send limits
                    </span>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Per hour</label>
                      <input
                        type="number"
                        min={1}
                        value={sendLimitOverrideMaxEmailsPerHour}
                        onChange={(e) =>
                          setSendLimitOverrideMaxEmailsPerHour(Number(e.target.value || 1))
                        }
                        disabled={!sendLimitOverrideEnabled}
                        className={cn(fieldClass, 'disabled:opacity-50')}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Per day</label>
                      <input
                        type="number"
                        min={1}
                        value={sendLimitOverrideMaxEmailsPerDay}
                        onChange={(e) =>
                          setSendLimitOverrideMaxEmailsPerDay(Number(e.target.value || 1))
                        }
                        disabled={!sendLimitOverrideEnabled}
                        className={cn(fieldClass, 'disabled:opacity-50')}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 flex flex-wrap gap-2 border-t border-border bg-card px-5 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-10 rounded-[3px] text-sm font-bold px-4"
            >
              Cancel
            </Button>
            {isPasswordAuth && (
              <Button
                type="button"
                variant="outline"
                disabled={syncing || submitting}
                onClick={() => void handleSyncNow()}
                className="h-10 rounded-[3px] gap-2 text-sm font-bold px-4"
              >
                {syncing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
                Sync mail
              </Button>
            )}
            <Button
              type="submit"
              variant="primary"
              disabled={submitting}
              className="flex-1 min-w-[120px] h-10 rounded-[3px] gap-2 text-sm font-bold"
            >
              {submitting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <CheckCircle2 size={16} />
              )}
              Save
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  return <CrmJiraPortal>{modal}</CrmJiraPortal>;
}
