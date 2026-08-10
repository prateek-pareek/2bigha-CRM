"use client";

import { useState } from "react";
import { Globe, Loader2 } from "lucide-react";
import { extractEmailsFromWebsite } from "@/lib/crm/email/website-email-extractor";

type Props = {
  websiteUrl: string;
  existingEmail?: string;
  disabled?: boolean;
  onEmailFound?: (email: string) => void | Promise<void>;
  className?: string;
};

function preferContactEmail(emails: string[]): string {
  const ranked = emails.map((email) => {
    const local = email.split("@")[0]?.toLowerCase() ?? "";
    const score =
      local === "contact"
        ? 100
        : local === "info"
          ? 90
          : local === "hello"
            ? 80
            : local === "sales"
              ? 70
              : local === "support"
                ? 60
                : local.startsWith("contact")
                  ? 50
                  : 0;
    return { email, score };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked[0]?.email ?? emails[0];
}

export default function EmailExtractorFromWebsite({
  websiteUrl,
  existingEmail,
  disabled,
  onEmailFound,
  className = "",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [choices, setChoices] = useState<string[] | null>(null);

  const hasEmail = Boolean(String(existingEmail || "").trim());
  const website = String(websiteUrl || "").trim();

  if (!website || hasEmail) return null;

  const saveEmail = async (email: string) => {
    if (onEmailFound && !confirm(`Save ${email} on this record?`)) return;
    await onEmailFound?.(email);
    setChoices(null);
  };

  const handleExtract = async () => {
    setLoading(true);
    setChoices(null);
    try {
      const result = await extractEmailsFromWebsite(website, {
        crawlContactPages: true,
      });
      const emails = result.emails.map((hit) => hit.email);
      if (emails.length === 0) {
        alert("No emails found on this website.");
        return;
      }
      if (emails.length === 1) {
        await saveEmail(emails[0]);
        return;
      }
      setChoices(emails);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Website email extraction failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => void handleExtract()}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-600/30 bg-emerald-600/5 text-emerald-700 text-xs font-semibold hover:bg-emerald-600/10 disabled:opacity-50"
        title="Extract emails from website"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
        Extract emails
      </button>
      {choices && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void saveEmail(preferContactEmail(choices))}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
          >
            Use {preferContactEmail(choices)}
          </button>
          {choices
            .filter((email) => email !== preferContactEmail(choices))
            .map((email) => (
              <button
                key={email}
                type="button"
                onClick={() => void saveEmail(email)}
                className="inline-flex items-center rounded-lg border border-emerald-600/30 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-600/5"
              >
                {email}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
