/** Shared CRM snippet / email template categorization for composer filtering. */

export type CategoryAudience = "all" | "agency" | "freelancer";
export type CategoryMaterial = "all" | "cv" | "portfolio" | "case_study";

export function normalizeCategoryAudience(v: unknown): CategoryAudience {
  const s = String(v ?? "all").toLowerCase();
  if (s === "agency" || s === "freelancer") return s;
  return "all";
}

export function normalizeCategoryMaterial(v: unknown): CategoryMaterial {
  const s = String(v ?? "all").toLowerCase().replace(/-/g, "_");
  if (s === "cv" || s === "portfolio" || s === "case_study") return s;
  return "all";
}

/** Item passes when filters are "all" or match the item's non-"all" category. */
export function itemMatchesCategoryFilters(
  item: { categoryAudience?: unknown; categoryMaterial?: unknown },
  audienceFilter: CategoryAudience,
  materialFilter: CategoryMaterial,
): boolean {
  const a = normalizeCategoryAudience(item.categoryAudience);
  const m = normalizeCategoryMaterial(item.categoryMaterial);
  if (audienceFilter !== "all" && a !== "all" && a !== audienceFilter) {
    return false;
  }
  if (materialFilter !== "all" && m !== "all" && m !== materialFilter) {
    return false;
  }
  return true;
}

/** Short line for list rows (composer / settings). */
export function formatCategorySummary(
  audience?: unknown,
  material?: unknown,
): string {
  const a = normalizeCategoryAudience(audience);
  const m = normalizeCategoryMaterial(material);
  const parts: string[] = [];
  if (a !== "all") parts.push(a === "agency" ? "Agency" : "Freelancer");
  if (m !== "all") {
    if (m === "cv") parts.push("CV");
    else if (m === "portfolio") parts.push("Portfolio");
    else if (m === "case_study") parts.push("Case study");
  }
  if (parts.length === 0) return "General";
  return parts.join(" · ");
}
