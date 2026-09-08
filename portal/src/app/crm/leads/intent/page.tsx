"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Phone,
  Building2,
  PhoneCall,
  Search,
  X,
  Sparkles,
  UserCheck,
  Home,
  TrendingUp,
  Clock,
  AlertCircle,
  BarChart3,
  Users,
  RefreshCw,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  ShieldCheck,
  CreditCard,
  Building,
  CheckCircle2,
} from "lucide-react";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import { CrmPageHeader, CrmButton } from "@/components/crm/ui";
import { contactWhatsappUrl, contactWhatsappWaId } from "@/lib/crm/crm-messaging-links";
import { useWhatsAppSideChatStore } from "@/portals/crm/stores/whatsappSideChatStore";
import CallLeadModal from "@/components/crm/records/detail/CallLeadModal";
import AddPropertyModal from "@/components/crm/records/detail/AddPropertyModal";
import CallActivityFormModal from "@/components/crm/records/detail/CallActivityFormModal";
import { cn } from "@/lib/utils";

type IntentLead = {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  organization?: string;
  phone?: string;
  mobileNo?: string;
  leadOwner?: string;
  leadIntents?: string[];
  leadIntentFollowUpAt?: string;
  createdAt?: string;
};

type IntentStats = {
  total: number;
  buyers: number;
  sellers: number;
  investors: number;
  farms: number;
  pm: number;
  subscriptions: number;
  dueToday: number;
};

const INTENT_OPTIONS = [
  { label: "Buyer", icon: UserCheck, tone: "emerald" },
  { label: "Seller", icon: Home, tone: "amber" },
  { label: "Investor", icon: TrendingUp, tone: "purple" },
  { label: "Farm", icon: Building, tone: "teal" },
  { label: "Property Management", icon: ShieldCheck, tone: "sky" },
  { label: "Subscription", icon: CreditCard, tone: "indigo" },
];

const INTENT_THEME: Record<string, { badge: string; dot: string; lightBg: string }> = {
  Buyer: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
    dot: "bg-emerald-500",
    lightBg: "bg-emerald-50 text-emerald-700",
  },
  Seller: {
    badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
    dot: "bg-amber-500",
    lightBg: "bg-amber-50 text-amber-700",
  },
  Investor: {
    badge: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800",
    dot: "bg-purple-500",
    lightBg: "bg-purple-50 text-purple-700",
  },
  Farm: {
    badge: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800",
    dot: "bg-teal-500",
    lightBg: "bg-teal-50 text-teal-700",
  },
  "Property Management": {
    badge: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
    dot: "bg-sky-500",
    lightBg: "bg-sky-50 text-sky-700",
  },
  Subscription: {
    badge: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
    dot: "bg-indigo-500",
    lightBg: "bg-indigo-50 text-indigo-700",
  },
};

function getIntentTheme(intent: string) {
  return (
    INTENT_THEME[intent] || {
      badge: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
      dot: "bg-slate-400",
      lightBg: "bg-slate-100 text-slate-700",
    }
  );
}

function getFollowUpBadge(dateStr?: string) {
  if (!dateStr) return { label: "Not Scheduled", tone: "none", formatted: "—" };
  const target = new Date(dateStr);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const formatted = target.toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    year: target.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });

  if (target < startOfToday) {
    return {
      label: "Overdue",
      tone: "overdue",
      formatted,
      className: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
    };
  }
  if (target <= endOfToday) {
    return {
      label: "Due Today",
      tone: "today",
      formatted,
      className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
    };
  }
  return {
    label: "Upcoming",
    tone: "upcoming",
    formatted,
    className: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700",
  };
}

const AVATAR_GRADIENTS = [
  "from-emerald-500 to-teal-600 text-white",
  "from-blue-500 to-indigo-600 text-white",
  "from-purple-500 to-pink-600 text-white",
  "from-amber-500 to-orange-600 text-white",
  "from-sky-500 to-cyan-600 text-white",
  "from-rose-500 to-red-600 text-white",
];

function getAvatarGradient(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

export default function LeadIntentListPage() {
  const router = useRouter();
  const [items, setItems] = useState<IntentLead[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<IntentStats>({
    total: 0,
    buyers: 0,
    sellers: 0,
    investors: 0,
    farms: 0,
    pm: 0,
    subscriptions: 0,
    dueToday: 0,
  });
  const [loading, setLoading] = useState(true);
  const [intentFilter, setIntentFilter] = useState("");
  const [dueTodayOnly, setDueTodayOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [callLead, setCallLead] = useState<IntentLead | null>(null);
  const [propertyLead, setPropertyLead] = useState<IntentLead | null>(null);
  const [activityLead, setActivityLead] = useState<IntentLead | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const authHeaders = useCallback((): Record<string, string> => {
    const t = getCrmAuthToken();
    const h: Record<string, string> = {};
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (intentFilter) params.set("intent", intentFilter);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`${CRM_API_URL}/crm/lead-intent/list?${params.toString()}`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      const data = res.ok ? await res.json() : { items: [], total: 0, stats: null };
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(data.total || 0);
      if (data.stats) {
        setStats(data.stats);
      }
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, page, intentFilter, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const fullName = (l: IntentLead) =>
    `${l.firstName || ""} ${l.lastName || ""}`.trim() || "Unnamed Lead";

  const initials = (l: IntentLead) => {
    const f = (l.firstName?.[0] || "").toUpperCase();
    const last = (l.lastName?.[0] || "").toUpperCase();
    return `${f}${last}`.trim() || (l.organization?.[0] || "?").toUpperCase();
  };

  const displayedItems = useMemo(() => {
    if (!dueTodayOnly) return items;
    const now = new Date();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return items.filter((item) => {
      if (!item.leadIntentFollowUpAt) return false;
      const d = new Date(item.leadIntentFollowUpAt);
      return d <= endOfToday;
    });
  }, [items, dueTodayOnly]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4 p-4 sm:p-6 max-w-[1600px] mx-auto min-h-screen">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Lead Intent Pipeline
            </h1>
            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-bold text-slate-700 dark:text-slate-300">
              {total} prospects
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Monitor recorded buyer, seller, farm, and investor opportunities with scheduled follow-up dates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/crm/leads")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition"
          >
            All Leads
          </button>
          <button
            type="button"
            onClick={() => router.push("/crm/reports/lead-intent")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition"
          >
            <BarChart3 size={14} className="text-slate-500" />
            Analytics
          </button>
          <button
            type="button"
            onClick={() => void load()}
            title="Refresh list"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition"
          >
            <RefreshCw size={13} className={cn(loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* KPI Cards — Clean, White, Elevated Metric Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {/* Card 1: Total Intent */}
        <button
          type="button"
          onClick={() => {
            setIntentFilter("");
            setDueTodayOnly(false);
            setPage(1);
          }}
          className={cn(
            "text-left transition-all duration-150 rounded-xl border p-4 bg-white dark:bg-slate-900 shadow-xs hover:shadow-sm cursor-pointer relative overflow-hidden",
            !intentFilter && !dueTodayOnly
              ? "border-slate-900 dark:border-white ring-2 ring-slate-900/10 dark:ring-white/20"
              : "border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Intent
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <Sparkles size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
              {stats.total || total}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">All tagged prospects</p>
        </button>

        {/* Card 2: Buyers */}
        <button
          type="button"
          onClick={() => {
            setIntentFilter(intentFilter === "Buyer" ? "" : "Buyer");
            setDueTodayOnly(false);
            setPage(1);
          }}
          className={cn(
            "text-left transition-all duration-150 rounded-xl border p-4 bg-white dark:bg-slate-900 shadow-xs hover:shadow-sm cursor-pointer relative overflow-hidden",
            intentFilter === "Buyer"
              ? "border-emerald-600 dark:border-emerald-400 ring-2 ring-emerald-500/15"
              : "border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Buyers
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <UserCheck size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">
              {stats.buyers}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Property buyers</p>
        </button>

        {/* Card 3: Sellers & Farm */}
        <button
          type="button"
          onClick={() => {
            setIntentFilter(intentFilter === "Seller" ? "" : "Seller");
            setDueTodayOnly(false);
            setPage(1);
          }}
          className={cn(
            "text-left transition-all duration-150 rounded-xl border p-4 bg-white dark:bg-slate-900 shadow-xs hover:shadow-sm cursor-pointer relative overflow-hidden",
            intentFilter === "Seller" || intentFilter === "Farm"
              ? "border-amber-600 dark:border-amber-400 ring-2 ring-amber-500/15"
              : "border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Sellers / Farm
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
              <Home size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400 tabular-nums">
              {stats.sellers + (stats.farms || 0)}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Selling land or farm</p>
        </button>

        {/* Card 4: Investors */}
        <button
          type="button"
          onClick={() => {
            setIntentFilter(intentFilter === "Investor" ? "" : "Investor");
            setDueTodayOnly(false);
            setPage(1);
          }}
          className={cn(
            "text-left transition-all duration-150 rounded-xl border p-4 bg-white dark:bg-slate-900 shadow-xs hover:shadow-sm cursor-pointer relative overflow-hidden",
            intentFilter === "Investor"
              ? "border-purple-600 dark:border-purple-400 ring-2 ring-purple-500/15"
              : "border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Investors
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-purple-600 dark:text-purple-400 tabular-nums">
              {stats.investors}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Capital investments</p>
        </button>

        {/* Card 5: Follow-up Due */}
        <button
          type="button"
          onClick={() => {
            setDueTodayOnly(!dueTodayOnly);
            setPage(1);
          }}
          className={cn(
            "text-left transition-all duration-150 rounded-xl border p-4 bg-white dark:bg-slate-900 shadow-xs hover:shadow-sm cursor-pointer relative overflow-hidden",
            dueTodayOnly
              ? "border-rose-600 dark:border-rose-400 ring-2 ring-rose-500/15"
              : "border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Follow-up Due
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
              <Clock size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400 tabular-nums">
              {stats.dueToday}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Due today or overdue</p>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[260px] max-w-lg">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, phone, email, organization, owner…"
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/80 pl-9 pr-8 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:bg-white dark:focus:bg-slate-900 transition"
          />
          {searchInput ? (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>

        {/* Intent Filter Chips with Count Badges */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 custom-scrollbar">
          <button
            type="button"
            onClick={() => {
              setIntentFilter("");
              setPage(1);
            }}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer",
              !intentFilter
                ? "bg-slate-900 text-white shadow-xs dark:bg-white dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white",
            )}
          >
            <span>All</span>
            <span
              className={cn(
                "rounded-md px-1.5 py-0.2 text-[10px] font-bold tabular-nums",
                !intentFilter
                  ? "bg-slate-800 text-slate-200 dark:bg-slate-200 dark:text-slate-800"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
              )}
            >
              {stats.total || total}
            </span>
          </button>

          {INTENT_OPTIONS.map((opt) => {
            const isActive = intentFilter === opt.label;
            const theme = getIntentTheme(opt.label);
            const count =
              opt.label === "Buyer"
                ? stats.buyers
                : opt.label === "Seller"
                ? stats.sellers
                : opt.label === "Investor"
                ? stats.investors
                : opt.label === "Farm"
                ? stats.farms
                : opt.label === "Property Management"
                ? stats.pm
                : stats.subscriptions;

            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => {
                  setIntentFilter(isActive ? "" : opt.label);
                  setPage(1);
                }}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer border",
                  isActive
                    ? `${theme.badge} ring-1 ring-current shadow-xs`
                    : "border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white",
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", theme.dot)} />
                <span>{opt.label}</span>
                {count > 0 ? (
                  <span className="rounded-md bg-black/5 dark:bg-white/10 px-1.5 py-0.2 text-[10px] font-bold tabular-nums">
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Table Card */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/75 dark:border-slate-800 dark:bg-slate-800/50 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="px-5 py-3.5">Lead Details</th>
                <th className="px-4 py-3.5">Recorded Intent(s)</th>
                <th className="px-4 py-3.5">Follow-up Target</th>
                <th className="px-4 py-3.5">Owner</th>
                <th className="px-5 py-3.5 text-right">Quick Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {loading ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-800" />
                        <div className="space-y-1.5">
                          <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800" />
                          <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-800" />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-6 w-24 rounded-full bg-slate-200 dark:bg-slate-800" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-5 w-20 rounded bg-slate-200 dark:bg-slate-800" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-800" />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex h-8 w-28 rounded bg-slate-200 dark:bg-slate-800" />
                    </td>
                  </tr>
                ))
              ) : displayedItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                      <Sparkles size={24} />
                    </div>
                    <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">
                      No leads matching current filters
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {search
                        ? `No results match "${search}". Try clearing your search query.`
                        : "No recorded intents for this selection."}
                    </p>
                    {(search || intentFilter || dueTodayOnly) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchInput("");
                          setIntentFilter("");
                          setDueTodayOnly(false);
                          setPage(1);
                        }}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <X size={13} /> Reset Filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                displayedItems.map((lead) => {
                  const name = fullName(lead);
                  const gradient = getAvatarGradient(`${lead.firstName}${lead.lastName}${lead._id}`);
                  const followUp = getFollowUpBadge(lead.leadIntentFollowUpAt);

                  return (
                    <tr
                      key={lead._id}
                      className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                    >
                      {/* Lead Avatar & Details */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold text-xs bg-gradient-to-br shadow-xs",
                              gradient,
                            )}
                          >
                            {initials(lead)}
                          </div>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => router.push(`/crm/leads/${lead._id}`)}
                              className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors block truncate text-left"
                            >
                              {name}
                            </button>
                            <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {lead.organization ? (
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  {lead.organization}
                                </span>
                              ) : null}
                              {lead.phone || lead.mobileNo ? (
                                <span className="tabular-nums">{lead.phone || lead.mobileNo}</span>
                              ) : null}
                              {lead.email ? (
                                <span className="hidden md:inline truncate">{lead.email}</span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Intent Badges */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1.5">
                          {lead.leadIntents && lead.leadIntents.length > 0 ? (
                            lead.leadIntents.map((intent) => {
                              const theme = getIntentTheme(intent);
                              return (
                                <span
                                  key={intent}
                                  className={cn(
                                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-tight",
                                    theme.badge,
                                  )}
                                >
                                  <span className={cn("h-1.5 w-1.5 rounded-full", theme.dot)} />
                                  {intent}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-xs text-slate-400 italic">No intent</span>
                          )}
                        </div>
                      </td>

                      {/* Follow-up Urgency Pill */}
                      <td className="px-4 py-3.5">
                        {lead.leadIntentFollowUpAt ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums",
                                followUp.className,
                              )}
                            >
                              {followUp.tone === "overdue" ? (
                                <AlertCircle size={12} className="text-rose-600 shrink-0" />
                              ) : followUp.tone === "today" ? (
                                <Clock size={12} className="text-amber-600 shrink-0" />
                              ) : (
                                <Calendar size={12} className="text-slate-400 shrink-0" />
                              )}
                              <span>{followUp.formatted}</span>
                            </span>
                            <span className="text-[11px] text-slate-400 hidden lg:inline">
                              {followUp.label}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      {/* Assigned Owner */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 font-medium">
                          <Users size={13} className="text-slate-400 shrink-0" />
                          <span className="truncate">{lead.leadOwner || "Unassigned"}</span>
                        </div>
                      </td>

                      {/* Quick Actions */}
                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          {lead.phone || lead.mobileNo ? (
                            <button
                              type="button"
                              title={`Call ${name}`}
                              onClick={() => setCallLead(lead)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-2xs hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-blue-950 transition cursor-pointer"
                            >
                              <Phone size={13} />
                            </button>
                          ) : null}

                          {contactWhatsappUrl(lead) ? (
                            <button
                              type="button"
                              onClick={() => {
                                const waId = contactWhatsappWaId(lead);
                                if (waId) {
                                  useWhatsAppSideChatStore.getState().openChat({
                                    waId,
                                    phone: lead.mobileNo || lead.phone,
                                    leadId: lead._id,
                                    leadName: `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "Lead",
                                  });
                                }
                              }}
                              title="Chat on WhatsApp"
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-2xs hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-emerald-950 transition cursor-pointer"
                            >
                              <PhoneCall size={13} />
                            </button>
                          ) : null}

                          <button
                            type="button"
                            title="Add Property Listing"
                            onClick={() => setPropertyLead(lead)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-2xs hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-indigo-950 transition cursor-pointer"
                          >
                            <Building2 size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={() => setActivityLead(lead)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition cursor-pointer"
                          >
                            Activity
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200/80 px-5 py-3.5 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/30 text-xs text-slate-500 dark:text-slate-400">
          <div>
            Showing{" "}
            <span className="font-bold text-slate-900 dark:text-white">
              {total === 0 ? 0 : (page - 1) * pageSize + 1}
            </span>{" "}
            to{" "}
            <span className="font-bold text-slate-900 dark:text-white">
              {Math.min(page * pageSize, total)}
            </span>{" "}
            of{" "}
            <span className="font-bold text-slate-900 dark:text-white">
              {total}
            </span>{" "}
            prospects
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition"
            >
              <ChevronLeft size={14} /> Previous
            </button>

            <span className="px-2 font-semibold text-slate-700 dark:text-slate-300">
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Action Modals */}
      <CallLeadModal
        open={!!callLead}
        onClose={() => setCallLead(null)}
        phone={callLead?.mobileNo || callLead?.phone}
        leadId={callLead?._id}
        leadName={callLead ? fullName(callLead) : undefined}
        onSuccess={() => {
          const lead = callLead;
          setCallLead(null);
          if (lead) {
            setActivityLead(lead);
          }
        }}
      />
      <AddPropertyModal
        open={!!propertyLead}
        onClose={() => setPropertyLead(null)}
        leadId={propertyLead?._id}
        leadName={propertyLead ? fullName(propertyLead) : undefined}
        onSuccess={() => setPropertyLead(null)}
      />
      <CallActivityFormModal
        open={!!activityLead}
        onClose={() => setActivityLead(null)}
        leadId={activityLead?._id}
        leadName={activityLead ? fullName(activityLead) : undefined}
        onSuccess={() => void load()}
      />
    </div>
  );
}
