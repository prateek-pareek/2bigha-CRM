"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Mail,
} from "lucide-react";
import {
  extractEmailsFromWebsite,
  formatEmailSource,
  type WebsiteEmailExtractorResult,
} from "@/lib/crm/email/website-email-extractor";

type HistoryItem = {
  at: string;
  url: string;
  count: number;
};

function copyText(text: string) {
  void navigator.clipboard.writeText(text);
}

export default function EmailExtractorPage() {
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [crawlContactPages, setCrawlContactPages] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WebsiteEmailExtractorResult | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = websiteUrl.trim();
    if (!url) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setCopiedEmail(null);
    setCopiedAll(false);

    try {
      const data = await extractEmailsFromWebsite(url, { crawlContactPages });
      setResult(data);
      setHistory((prev) =>
        [
          {
            at: new Date().toISOString(),
            url: data.url,
            count: data.emails.length,
          },
          ...prev,
        ].slice(0, 8),
      );
      if (data.emails.length === 0) {
        setError("Scan completed but no emails were found on this site.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Email extraction failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyEmail = (email: string) => {
    copyText(email);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  const handleCopyAll = () => {
    if (!result?.emails.length) return;
    copyText(result.emails.map((hit) => hit.email).join("\n"));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:py-10 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-emerald-500/10 text-emerald-600">
              <Globe size={22} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-main)]">
              Website email extractor
            </h1>
          </div>
          <p className="text-sm text-[var(--text-muted)] max-w-2xl leading-relaxed">
            Pull publicly visible email addresses from a company website. Scans the
            homepage and optional contact/about pages for mailto links, visible text,
            and structured data.
          </p>
        </div>
        <Link
          href="/crm/email-finder"
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-main)] hover:bg-[var(--background)] transition-colors"
        >
          <Mail size={14} />
          LinkedIn email finder
        </Link>
      </div>

      <form
        onSubmit={handleExtract}
        className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white p-6 shadow-sm space-y-4"
      >
        <label className="block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Website URL
          </span>
          <input
            type="text"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--text-main)] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            disabled={loading}
          />
        </label>

        <label className="flex items-center gap-3 text-sm text-[var(--text-main)]">
          <input
            type="checkbox"
            checked={crawlContactPages}
            onChange={(e) => setCrawlContactPages(e.target.checked)}
            disabled={loading}
            className="h-4 w-4 rounded border-[var(--border-color)] text-emerald-600 focus:ring-emerald-500"
          />
          Also scan contact, about, and team pages on the same domain
        </label>

        <button
          type="submit"
          disabled={loading || !websiteUrl.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Scanning website…
            </>
          ) : (
            <>
              <Globe size={16} />
              Extract emails
            </>
          )}
        </button>
      </form>

      {error && (
        <div className="flex gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <AlertCircle size={20} className="shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {result && (
        <div className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] px-6 py-4">
            <div>
              <p className="text-sm font-semibold text-[var(--text-main)]">
                {result.title || result.url}
              </p>
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline mt-1"
              >
                {result.url}
                <ExternalLink size={12} />
              </a>
            </div>
            {result.emails.length > 0 && (
              <button
                type="button"
                onClick={handleCopyAll}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-main)] hover:bg-[var(--background)]"
              >
                {copiedAll ? <Check size={14} /> : <Copy size={14} />}
                {copiedAll ? "Copied" : "Copy all"}
              </button>
            )}
          </div>

          {result.emails.length === 0 ? (
            <p className="px-6 py-8 text-sm text-[var(--text-muted)]">
              No emails found across {result.pagesScanned.length} page
              {result.pagesScanned.length === 1 ? "" : "s"}.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border-color)]">
              {result.emails.map((hit) => (
                <li
                  key={hit.email}
                  className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
                >
                  <div>
                    <p className="font-medium text-[var(--text-main)]">{hit.email}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {formatEmailSource(hit.source)} ·{" "}
                      <a
                        href={hit.pageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-700 hover:underline"
                      >
                        {new URL(hit.pageUrl).pathname || "/"}
                      </a>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyEmail(hit.email)}
                    className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-main)] hover:bg-[var(--background)]"
                  >
                    {copiedEmail === hit.email ? (
                      <Check size={14} />
                    ) : (
                      <Copy size={14} />
                    )}
                    {copiedEmail === hit.email ? "Copied" : "Copy"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {result.pagesScanned.length > 1 && (
            <div className="border-t border-[var(--border-color)] bg-[var(--background)] px-6 py-3 text-xs text-[var(--text-muted)]">
              Scanned {result.pagesScanned.length} pages
            </div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white p-6 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-4">
            Recent scans
          </h2>
          <ul className="space-y-2">
            {history.map((item) => (
              <li
                key={`${item.at}-${item.url}`}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="truncate text-[var(--text-main)]">{item.url}</span>
                <span className="shrink-0 text-[var(--text-muted)]">
                  {item.count} email{item.count === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
