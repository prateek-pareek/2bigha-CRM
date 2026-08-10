export type SocialAudience = "freelancer" | "agency" | "both";

export const SOCIAL_AUDIENCE_OPTIONS: {
  value: SocialAudience;
  label: string;
  shortLabel: string;
  hint: string;
}[] = [
  {
    value: "both",
    label: "Both audiences",
    shortLabel: "Both",
    hint: "Visible on freelancer and agency marketing sites",
  },
  {
    value: "freelancer",
    label: "Freelancer audience",
    shortLabel: "Freelancer",
    hint: "For mathionix.com and freelancer-focused visitors",
  },
  {
    value: "agency",
    label: "Agency audience",
    shortLabel: "Agency",
    hint: "For mathionix.tech and agency / IT consulting visitors",
  },
];

export function normalizeSocialAudience(raw?: string | null): SocialAudience {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "freelancer" || s === "agency" || s === "both") return s;
  return "both";
}

export function audienceLabel(raw?: string | null): string {
  const hit = SOCIAL_AUDIENCE_OPTIONS.find(
    (o) => o.value === normalizeSocialAudience(raw),
  );
  return hit?.shortLabel ?? "Both";
}

export function audienceBadgeClass(raw?: string | null): string {
  const a = normalizeSocialAudience(raw);
  if (a === "freelancer") return "bg-violet-50 text-violet-800 border-violet-200";
  if (a === "agency") return "bg-sky-50 text-sky-800 border-sky-200";
  return "bg-neutral-100 text-neutral-700 border-neutral-200";
}
