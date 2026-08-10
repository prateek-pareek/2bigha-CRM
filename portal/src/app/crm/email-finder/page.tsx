"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  Settings2,
  ShieldCheck,
  UserSearch,
} from "lucide-react";
import {
  fetchEmailIntelligenceStatus,
  findEmailFromLinkedIn,
  verifyEmailAddress,
  primaryEmailFromFinderResult,
  formatVerificationLabel,
  type EmailIntelligenceStatus,
  type EmailVerificationResult,
} from "@/lib/crm/email-intelligence";

type FinderResult = {
  linkedinUrl: string;
  email: string | null;
  provider: string;
  raw: unknown;
};

type HistoryItem =
  | { kind: "find"; at: string; linkedinUrl: string; email: string | null; provider: string }
  | { kind: "verify"; at: string; email: string; provider: string; label: string; deliverable: boolean };

function copyText(text: string) {
  void navigator.clipboard.writeText(text);
}

export default function EmailFinderPage() {
  const [status, setStatus] = useState<EmailIntelligenceStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [finderLoading, setFinderLoading] = useState(false);
  const [finderError, setFinderError] = useState<string | null>(null);
  const [finderResult, setFinderResult] = useState<FinderResult | null>(null);
  const [copiedFinder, setCopiedFinder] = useState(false);

  const [verifyEmail, setVerifyEmail] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<EmailVerificationResult | null>(null);
  const [copiedVerify, setCopiedVerify] = useState(false);

  const [history, setHistory] = useState<HistoryItem[]>([]);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const s = await fetchEmailIntelligenceStatus();
      setStatus(s);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const finderAvailable = status?.capabilities.linkedinFinder.available ?? false;
  const verifierAvailable = status?.capabilities.emailVerifier.available ?? false;
  const anyAvailable = finderAvailable || verifierAvailable;

  const handleFind = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = linkedinUrl.trim();
    if (!url) return;

    setFinderLoading(true);
    setFinderError(null);
    setFinderResult(null);
    setCopiedFinder(false);

    try {
      const response = (await findEmailFromLinkedIn(url)) as {
        provider?: string;
        data?: unknown;
      };
      const email = primaryEmailFromFinderResult(response);
      const provider = String(response?.provider ?? "unknown");
      const next: FinderResult = {
        linkedinUrl: url,
        email,
        provider,
        raw: response?.data ?? response,
      };
      setFinderResult(next);
      setHistory((prev) =>
        [
          {
            kind: "find" as const,
            at: new Date().toISOString(),
            linkedinUrl: url,
            email,
            provider,
          },
          ...prev,
        ].slice(0, 8),
      );
      if (!email) {
        setFinderError("Lookup completed but no email was returned.");
      }
    } catch (err) {
      setFinderError(err instanceof Error ? err.message : "Email finder failed");
    } finally {
      setFinderLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = verifyEmail.trim();
    if (!email) return;

    setVerifyLoading(true);
    setVerifyError(null);
    setVerifyResult(null);
    setCopiedVerify(false);

    try {
      const result = await verifyEmailAddress(email);
      setVerifyResult(result);
      setHistory((prev) =>
        [
          {
            kind: "verify" as const,
            at: new Date().toISOString(),
            email: result.email,
            provider: result.provider,
            label: formatVerificationLabel(result),
            deliverable: result.deliverable,
          },
          ...prev,
        ].slice(0, 8),
      );
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleCopyFinder = () => {
    if (!finderResult?.email) return;
    copyText(finderResult.email);
    setCopiedFinder(true);
    setTimeout(() => setCopiedFinder(false), 2000);
  };

  const handleCopyVerify = () => {
    if (!verifyResult?.email) return;
    copyText(verifyResult.email);
    setCopiedVerify(true);
    setTimeout(() => setCopiedVerify(false), 2000);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:py-10 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-sky-500/10 text-sky-600">
              <UserSearch size={22} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-main)]">
              Email finder
            </h1>
          </div>
          <p className="text-sm text-[var(--text-muted)] max-w-2xl leading-relaxed">
            Find work emails from LinkedIn profile URLs and verify deliverability. Providers
            failover automatically by priority when one is out of credits.
          </p>
        </div>
        <Link
          href="/crm/settings/integrations/email-intelligence"
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-main)] hover:bg-[var(--background)] transition-colors"
        >
          <Settings2 size={14} />
          Provider settings
        </Link>
      </div>

      {!statusLoading && !anyAvailable && (
        <div className="flex gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <AlertCircle size={20} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">No email providers configured yet</p>
            <p className="mt-1 text-amber-800/90">
              Enable at least one provider (e.g. Prospeo or Tomba) under{" "}
              <Link
                href="/crm/settings/integrations/email-intelligence"
                className="font-semibold underline"
              >
                Email intelligence settings
              </Link>{" "}
              before using the finder here.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LinkedIn finder */}
        <section className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="border-b border-[var(--surface-dim)] bg-[var(--surface-dim)] px-6 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-main)] flex items-center gap-2">
              <Mail size={16} className="text-sky-600" />
              Find from LinkedIn
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Paste a LinkedIn profile URL — uses your enabled finder providers in order.
            </p>
          </div>

          <form onSubmit={(e) => void handleFind(e)} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">
                LinkedIn profile URL
              </label>
              <input
                type="url"
                required
                disabled={!finderAvailable || finderLoading}
                placeholder="https://www.linkedin.com/in/jane-doe/"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-color)] bg-white px-4 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/20 disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={!finderAvailable || finderLoading || !linkedinUrl.trim()}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--hs-link)] py-3 text-xs font-semibold text-white hover:bg-[#e8674a] disabled:opacity-50 transition-colors"
            >
              {finderLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Finding email…
                </>
              ) : (
                <>
                  <UserSearch size={16} />
                  Find email
                </>
              )}
            </button>

            {!finderAvailable && !statusLoading && (
              <p className="text-xs text-[var(--text-muted)]">
                Enable a LinkedIn finder provider in settings to use this tool.
              </p>
            )}

            {finderError && (
              <p className="text-sm font-medium text-rose-600">{finderError}</p>
            )}

            {finderResult?.email && (
              <div className="rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                  Result via {finderResult.provider}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`mailto:${finderResult.email}`}
                    className="text-lg font-bold text-emerald-900 break-all hover:underline"
                  >
                    {finderResult.email}
                  </a>
                  <button
                    type="button"
                    onClick={handleCopyFinder}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    {copiedFinder ? <Check size={14} /> : <Copy size={14} />}
                    {copiedFinder ? "Copied" : "Copy"}
                  </button>
                </div>
                <a
                  href={finderResult.linkedinUrl.startsWith("http") ? finderResult.linkedinUrl : `https://${finderResult.linkedinUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                >
                  View LinkedIn profile <ExternalLink size={12} />
                </a>
              </div>
            )}
          </form>
        </section>

        {/* Email verifier */}
        <section className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="border-b border-[var(--surface-dim)] bg-[var(--surface-dim)] px-6 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-main)] flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-600" />
              Verify email
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Check if an address is deliverable before you add it to a lead or contact.
            </p>
          </div>

          <form onSubmit={(e) => void handleVerify(e)} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">
                Email address
              </label>
              <input
                type="email"
                required
                disabled={!verifierAvailable || verifyLoading}
                placeholder="person@company.com"
                value={verifyEmail}
                onChange={(e) => setVerifyEmail(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-color)] bg-white px-4 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/20 disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={!verifierAvailable || verifyLoading || !verifyEmail.trim()}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {verifyLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Verifying…
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  Verify email
                </>
              )}
            </button>

            {!verifierAvailable && !statusLoading && (
              <p className="text-xs text-[var(--text-muted)]">
                Enable an email verifier provider in settings to use this tool.
              </p>
            )}

            {verifyError && (
              <p className="text-sm font-medium text-rose-600">{verifyError}</p>
            )}

            {verifyResult && (
              <div
                className={`rounded-[var(--radius-md)] border p-4 space-y-2 ${
                  verifyResult.deliverable
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-amber-200 bg-amber-50"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Via {verifyResult.provider}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-bold text-[var(--text-main)] break-all">
                    {verifyResult.email}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyVerify}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-white px-3 py-1.5 text-xs font-semibold hover:bg-[var(--background)]"
                  >
                    {copiedVerify ? <Check size={14} /> : <Copy size={14} />}
                    {copiedVerify ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="text-sm font-medium text-[var(--text-main)]">
                  {formatVerificationLabel(verifyResult)}
                </p>
                <p
                  className={`text-sm font-semibold ${
                    verifyResult.deliverable ? "text-emerald-700" : "text-amber-800"
                  }`}
                >
                  {verifyResult.deliverable
                    ? "Likely deliverable"
                    : "May not be deliverable — review before sending"}
                </p>
              </div>
            )}
          </form>
        </section>
      </div>

      {history.length > 0 && (
        <section className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-4">
            Recent lookups (this session)
          </h2>
          <ul className="divide-y divide-[var(--surface-dim)]">
            {history.map((item, i) => (
              <li key={`${item.at}-${i}`} className="py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  {item.kind === "find" ? (
                    <>
                      <span className="font-semibold text-[var(--text-main)]">
                        {item.email ?? "No email found"}
                      </span>
                      <span className="text-[var(--text-muted)] ml-2 truncate">
                        {item.linkedinUrl}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-[var(--text-main)]">{item.email}</span>
                      <span className="text-[var(--text-muted)] ml-2">{item.label}</span>
                    </>
                  )}
                </div>
                <span className="text-xs text-[var(--text-muted)] shrink-0">
                  {item.provider} · {new Date(item.at).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-[var(--text-muted)] text-center">
        To save an email on a record, open a{" "}
        <Link href="/crm/leads" className="font-semibold text-[var(--hs-link)] hover:underline">
          lead
        </Link>{" "}
        or{" "}
        <Link href="/crm/contacts" className="font-semibold text-[var(--hs-link)] hover:underline">
          contact
        </Link>{" "}
        with a LinkedIn URL and no email — or paste the result manually when editing.
      </p>
    </div>
  );
}
