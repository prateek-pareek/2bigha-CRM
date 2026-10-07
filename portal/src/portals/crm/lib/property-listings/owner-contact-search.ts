import api from "@/lib/crm/api";

/**
 * "Search existing client / contact" for the listing wizard's Contact step.
 * Reuses the CRM's own list endpoints so RBAC + team scope stay server-side:
 * `/crm/clients` (clients:read) and `/crm/contacts` (contacts:read). A role
 * without one of those permissions just gets results from the other.
 */

export interface OwnerContactMatch {
  id: string;
  source: "client" | "contact";
  name: string;
  phone?: string;
  whatsappNumber?: string;
  email?: string;
}

const PER_SOURCE_LIMIT = 6;

function clean(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s || undefined;
}

function mapClient(c: any): OwnerContactMatch | null {
  const name = clean(c?.name);
  if (!c?._id || !name) return null;
  return {
    id: String(c._id),
    source: "client",
    name,
    phone: clean(c.phone),
    whatsappNumber: clean(c.whatsappNumber),
    email: clean(c.email),
  };
}

function mapContact(c: any): OwnerContactMatch | null {
  const name = clean([c?.firstName, c?.middleName, c?.lastName].filter(Boolean).join(" "));
  if (!c?._id || !name) return null;
  return {
    id: String(c._id),
    source: "contact",
    name,
    phone: clean(c.mobileNo) || clean(c.phone),
    email: clean(c.email),
  };
}

function rows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.data) ? payload.data : [];
}

export async function searchOwnerContacts(term: string): Promise<OwnerContactMatch[]> {
  const search = term.trim();
  if (search.length < 2) return [];
  const params = { search, page: 1, pageSize: PER_SOURCE_LIMIT };

  const [clients, contacts] = await Promise.allSettled([
    api.get("/crm/clients", { params }),
    api.get("/crm/contacts", { params }),
  ]);

  const matches: OwnerContactMatch[] = [];
  if (clients.status === "fulfilled") {
    for (const c of rows(clients.value.data).slice(0, PER_SOURCE_LIMIT)) {
      const m = mapClient(c);
      if (m) matches.push(m);
    }
  }
  if (contacts.status === "fulfilled") {
    for (const c of rows(contacts.value.data).slice(0, PER_SOURCE_LIMIT)) {
      const m = mapContact(c);
      if (m) matches.push(m);
    }
  }

  // Same person often exists as both a client and a contact — keep the first (client) row.
  const seen = new Set<string>();
  return matches.filter((m) => {
    const key = (m.phone || "").replace(/\D/g, "").slice(-10) || `${m.name.toLowerCase()}|${m.email || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
