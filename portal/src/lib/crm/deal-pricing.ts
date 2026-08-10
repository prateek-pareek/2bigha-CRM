/** Deal pricing helpers (keep in sync with api-hrms deal-pricing.util). */

export type DealPricingType = "fixed" | "monthly";

export function normalizeDealPricingType(
  value?: string | null,
): DealPricingType {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  return v === "monthly" || v === "retainer" || v === "recurring"
    ? "monthly"
    : "fixed";
}

export function dealContractMonths(deal: {
  pricingType?: string | null;
  contractMonths?: number | null;
}): number {
  if (normalizeDealPricingType(deal.pricingType) !== "monthly") return 1;
  const m = Number(deal.contractMonths);
  if (!Number.isFinite(m) || m <= 0) return 12;
  return Math.min(60, Math.max(1, Math.round(m)));
}

export function dealContractValue(deal: {
  dealValue?: number | null;
  pricingType?: string | null;
  contractMonths?: number | null;
}): number {
  const amount = Number(deal.dealValue) || 0;
  return amount * dealContractMonths(deal);
}

export function formatDealAmountLabel(pricingType?: string | null): string {
  return normalizeDealPricingType(pricingType) === "monthly"
    ? "Monthly amount"
    : "Amount";
}

export function formatDealPricingBadge(pricingType?: string | null): string {
  return normalizeDealPricingType(pricingType) === "monthly"
    ? "Monthly"
    : "Fixed price";
}
