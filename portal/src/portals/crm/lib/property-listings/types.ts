export type PropertyListingType =
  | "Apartment"
  | "Villa"
  | "Independent House"
  | "Plot"
  | "Commercial"
  | "Office"
  | "Warehouse"
  | "Other";

export type PropertyListingStatus =
  | "Available"
  | "Under Offer"
  | "Sold"
  | "Rented"
  | "Off Market";

export type PropertyListingFor = "Sale" | "Rent";

export interface PropertyListingRecord {
  _id: string;
  title: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  price: number;
  currency?: string;
  propertyType: PropertyListingType;
  listedFor: PropertyListingFor;
  bedrooms?: number;
  bathrooms?: number;
  areaSqft?: number;
  status: PropertyListingStatus;
  description?: string;
  images: string[];
  amenities: string[];
  listedDate?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  createdAt: string;
  updatedAt: string;
}

export const PROPERTY_TYPES: PropertyListingType[] = [
  "Apartment",
  "Villa",
  "Independent House",
  "Plot",
  "Commercial",
  "Office",
  "Warehouse",
  "Other",
];

export const PROPERTY_STATUSES: PropertyListingStatus[] = [
  "Available",
  "Under Offer",
  "Sold",
  "Rented",
  "Off Market",
];

export function statusTone(status: string): string {
  const s = status.toLowerCase();
  if (s === "available") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "under offer") return "bg-amber-50 text-amber-700 border-amber-200";
  if (s === "sold" || s === "rented") return "bg-sky-50 text-sky-700 border-sky-200";
  if (s === "off market") return "bg-slate-50 text-slate-600 border-slate-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

export function formatPrice(price: number, currency = "INR"): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${currency} ${price.toLocaleString()}`;
  }
}

export function formatAddress(p: Pick<PropertyListingRecord, "address" | "city" | "state">): string {
  return [p.address, p.city, p.state].filter(Boolean).join(", ") || "—";
}
