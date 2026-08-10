"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Loader2,
  TrendingUp,
} from "lucide-react";
import { CRM_API_URL } from "@/lib/api/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import { cn } from "@/lib/utils";

type Pipeline = { _id: string; name: string };

type ForecastDeal = {
  _id: string;
  title: string;
  organization?: string;
  stage: string;
  dealValue: number;
  dealValueINR: number;
  contractValueINR?: number;
  pricingType?: "fixed" | "monthly";
  contractMonths?: number;
  probability: number;
  weightedINR: number;
  expectedClosureDate: string | null;
  closedDate?: string | null;
  dealOwner: string;
};

type ForecastMonth = {
  key: string;
  label: string;
  gross: number;
  weighted: number;
  generated: number;
  dealCount: number;
  generatedDealCount: number;
  deals: ForecastDeal[];
  generatedDeals: ForecastDeal[];
  isPast?: boolean;
  isCurrent?: boolean;
  isForecast?: boolean;
};

type ForecastPayload = {
  currency: string;
  summary: {
    grossTotal: number;
    weightedTotal: number;
    dealCount: number;
    unscheduledCount: number;
    unscheduledGross: number;
    unscheduledWeighted: number;
    generatedTotal?: number;
    generatedDealCount?: number;
    generatedThisMonth?: number;
    generatedLookbackMonths?: number;
    monthlyMrrWeighted?: number;
  };
  months: ForecastMonth[];
  unscheduled: ForecastDeal[];
};

function fmtMoney(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function CrmRevenueForecastPanel({
  owner = "All",
  months = 6,
}: {
  owner?: string;
  months?: number;
}) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState("all");
  const [data, setData] = useState<ForecastPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showUnscheduled, setShowUnscheduled] = useState(false);

  useEffect(() => {
    const token = getCrmAuthToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`${CRM_API_URL}/crm/pipelines?type=deals`, { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setPipelines(Array.isArray(rows) ? rows : []))
      .catch(() => setPipelines([]));
  }, []);

  const loadForecast = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = getCrmAuthToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    const params = new URLSearchParams({
      owner: owner || "All",
      months: String(months),
    });
    if (pipelineId && pipelineId !== "all") {
      params.set("pipeline", pipelineId);
    }
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/reports/revenue-forecast?${params.toString()}`,
        { headers },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || `Failed to load forecast (${res.status})`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load forecast");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [owner, pipelineId, months]);

  useEffect(() => {
    void loadForecast();
  }, [loadForecast]);

  const chartData = useMemo(
    () =>
      (data?.months || []).map((m) => ({
        name: m.label,
        key: m.key,
        gross: m.gross,
        weighted: m.weighted,
        generated: m.generated || 0,
        deals: m.dealCount,
      })),
    [data],
  );

  const generatedTotal = data?.summary.generatedTotal ?? 0;
  const generatedDealCount = data?.summary.generatedDealCount ?? 0;
  const generatedThisMonth = data?.summary.generatedThisMonth ?? 0;
  const lookback = data?.summary.generatedLookbackMonths ?? months;

  if (loading && !data) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-[3px] border border-[#ebecf0] bg-card">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-text-main">Revenue prediction</h2>
          <p className="mt-1 max-w-2xl text-xs text-text-muted">
            Generated revenue from Closed Won deals, plus weighted forecast (contract value × stage
            win probability). Fixed-price deals use the project amount; monthly deals use monthly ×
            contract months (spread across months in the forecast window). Amounts in INR.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-text-muted" htmlFor="forecast-pipeline">
            Pipeline
          </label>
          <select
            id="forecast-pipeline"
            value={pipelineId}
            onChange={(e) => setPipelineId(e.target.value)}
            className="h-9 rounded-md border border-[var(--border-color)] bg-white px-3 text-sm font-medium text-text-main shadow-sm"
          >
            <option value="all">All pipelines</option>
            {pipelines.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="rounded-[3px] border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900">
          {error}
        </p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <SummaryCard
              title="Generated revenue"
              value={fmtMoney(generatedTotal)}
              hint={`${generatedDealCount} Closed Won · last ${lookback} mo`}
              icon={<CheckCircle2 className="h-5 w-5" />}
              color="emerald"
            />
            <SummaryCard
              title="Generated this month"
              value={fmtMoney(generatedThisMonth)}
              hint="Closed Won in current month"
              icon={<DollarSign className="h-5 w-5" />}
              color="emerald"
            />
            <SummaryCard
              title="Weighted forecast"
              value={fmtMoney(data.summary.weightedTotal)}
              hint={
                data.summary.monthlyMrrWeighted
                  ? `Incl. ${fmtMoney(data.summary.monthlyMrrWeighted)} weighted MRR`
                  : "Open deals × stage probability"
              }
              icon={<TrendingUp className="h-5 w-5" />}
              color="blue"
            />
            <SummaryCard
              title="Gross pipeline"
              value={fmtMoney(data.summary.grossTotal)}
              hint={`${data.summary.dealCount} open deals`}
              icon={<DollarSign className="h-5 w-5" />}
              color="indigo"
            />
            <SummaryCard
              title="Unscheduled"
              value={String(data.summary.unscheduledCount)}
              hint={`${fmtMoney(data.summary.unscheduledWeighted)} weighted`}
              icon={<DollarSign className="h-5 w-5" />}
              color="amber"
            />
          </div>

          <div className="rounded-[3px] border border-[var(--hs-link)] bg-[var(--hs-link)]/5 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-[var(--hs-link)] mb-2">Revenue summary</h3>
            <p className="text-xs text-text-main leading-relaxed">
              Generated revenue from Closed Won deals is{" "}
              <span className="font-bold">{fmtMoney(generatedTotal)}</span> across{" "}
              <span className="font-bold">{generatedDealCount}</span> deals in the last{" "}
              {lookback} months
              {generatedThisMonth > 0
                ? ` (including ${fmtMoney(generatedThisMonth)} this month)`
                : ""}
              . Open pipeline weighted forecast is{" "}
              <span className="font-bold">{fmtMoney(data.summary.weightedTotal)}</span> across{" "}
              <span className="font-bold">{data.summary.dealCount}</span> deals
              {data.summary.unscheduledCount > 0
                ? `; ${data.summary.unscheduledCount} open deals lack a close date in the forecast window.`
                : "."}
            </p>
          </div>

          <div className="rounded-[3px] border border-[#ebecf0] bg-card p-6 shadow-sm">
            <h3 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-text-muted">
              Generated vs forecast by month
            </h3>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "var(--text-muted)", fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--text-muted)", fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) =>
                      v >= 100000 ? `₹${Math.round(v / 100000)}L` : `₹${v}`
                    }
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      fmtMoney(Number(value) || 0),
                      name === "generated"
                        ? "Generated"
                        : name === "gross"
                          ? "Gross pipeline"
                          : "Weighted forecast",
                    ]}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #f1f5f9",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, fontWeight: 600 }}
                    formatter={(value) =>
                      value === "generated"
                        ? "Generated (won)"
                        : value === "gross"
                          ? "Gross pipeline"
                          : "Weighted forecast"
                    }
                  />
                  <Bar dataKey="generated" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="gross" fill="#94a3b8" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="weighted" fill="var(--hs-link)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-[3px] border border-[#ebecf0] bg-card shadow-sm overflow-hidden">
            <div className="border-b border-[#ebecf0] px-6 py-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted">
                By month
              </h3>
              <p className="mt-1 text-xs text-text-muted">
                Expand a month to see Closed Won deals (generated) and open deals (forecast).
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {data.months.map((month) => {
                const open = expandedKey === month.key;
                const hasAny =
                  month.dealCount > 0 ||
                  month.generatedDealCount > 0 ||
                  month.generated > 0 ||
                  month.weighted > 0;
                return (
                  <div key={month.key}>
                    <button
                      type="button"
                      onClick={() => setExpandedKey(open ? null : month.key)}
                      className="flex w-full items-center gap-3 px-6 py-4 text-left hover:bg-[#f4f5f7]/80"
                    >
                      {open ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-text-main">
                          {month.label}
                          {month.isCurrent ? (
                            <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-[var(--hs-link)]">
                              Current
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-text-muted">
                          {month.generatedDealCount || 0} won · {month.dealCount} open
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums text-emerald-700">
                          {fmtMoney(month.generated || 0)}
                        </p>
                        <p className="text-[10px] text-text-muted">
                          forecast {fmtMoney(month.weighted)}
                        </p>
                      </div>
                    </button>
                    {open && (
                      <div className="space-y-3 pb-4">
                        {(month.generatedDeals?.length || 0) > 0 && (
                          <div>
                            <p className="px-6 pb-2 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                              Generated (Closed Won)
                            </p>
                            <DealTable deals={month.generatedDeals} mode="generated" />
                          </div>
                        )}
                        {month.deals.length > 0 && (
                          <div>
                            <p className="px-6 pb-2 text-[10px] font-bold uppercase tracking-wide text-text-muted">
                              Forecast (open)
                            </p>
                            <DealTable deals={month.deals} mode="forecast" />
                          </div>
                        )}
                        {!hasAny && (
                          <p className="px-6 text-xs text-text-muted">
                            No won or open deals for this month.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {data.unscheduled.length > 0 && (
            <div className="rounded-[3px] border border-amber-100 bg-amber-50/50 shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setShowUnscheduled((v) => !v)}
                className="flex w-full items-center justify-between px-6 py-4 text-left"
              >
                <div>
                  <h3 className="text-sm font-semibold text-amber-950">
                    Unscheduled open deals ({data.unscheduled.length})
                  </h3>
                  <p className="text-xs text-amber-900/80">
                    Missing expected close date or outside the forecast window ·{" "}
                    {fmtMoney(data.summary.unscheduledWeighted)} weighted
                  </p>
                </div>
                {showUnscheduled ? (
                  <ChevronDown className="h-4 w-4 text-amber-800" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-amber-800" />
                )}
              </button>
              {showUnscheduled && <DealTable deals={data.unscheduled} mode="forecast" />}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  hint,
  icon,
  color,
}: {
  title: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  color: "blue" | "emerald" | "indigo" | "amber";
}) {
  const colors = {
    blue: "bg-primary/5 text-primary",
    emerald: "bg-emerald-50 text-emerald-600",
    indigo: "bg-indigo-50 text-indigo-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className="rounded-[3px] border border-[#ebecf0] bg-card p-5 shadow-sm">
      <div className={cn("mb-3 inline-flex rounded-[3px] p-2.5", colors[color])}>{icon}</div>
      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-text-muted">{title}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-text-main">{value}</p>
      <p className="mt-1 text-[11px] text-text-muted">{hint}</p>
    </div>
  );
}

function DealTable({
  deals,
  mode,
}: {
  deals: ForecastDeal[];
  mode: "forecast" | "generated";
}) {
  return (
    <div className="overflow-x-auto border-t border-[#ebecf0] bg-white/80">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead>
          <tr className="border-b border-[#ebecf0] text-[10px] font-bold uppercase tracking-wide text-text-muted">
            <th className="px-6 py-2.5">Deal</th>
            <th className="px-3 py-2.5">Stage</th>
            <th className="px-3 py-2.5">{mode === "generated" ? "Closed" : "Close"}</th>
            <th className="px-3 py-2.5 text-right">Value</th>
            {mode === "forecast" && <th className="px-3 py-2.5 text-right">Prob.</th>}
            <th className="px-6 py-2.5 text-right">
              {mode === "generated" ? "Generated" : "Weighted"}
            </th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => (
            <tr key={d._id} className="border-b border-slate-50 last:border-0 hover:bg-[#f4f5f7]/60">
              <td className="px-6 py-2.5">
                <Link
                  href={`/crm/deals/${d._id}`}
                  className="font-semibold text-[var(--hs-link)] hover:underline"
                >
                  {d.title}
                </Link>
                {d.organization ? (
                  <p className="mt-0.5 text-[10px] text-text-muted">{d.organization}</p>
                ) : null}
                {d.pricingType === "monthly" ? (
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                    Monthly · {d.contractMonths || 12} mo
                  </p>
                ) : null}
              </td>
              <td className="px-3 py-2.5 text-text-muted">{d.stage}</td>
              <td className="px-3 py-2.5 text-text-muted">
                {fmtDate(mode === "generated" ? d.closedDate || d.expectedClosureDate : d.expectedClosureDate)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {fmtMoney(d.dealValueINR)}
                {d.pricingType === "monthly" ? "/mo" : ""}
              </td>
              {mode === "forecast" && (
                <td className="px-3 py-2.5 text-right tabular-nums">{d.probability}%</td>
              )}
              <td className="px-6 py-2.5 text-right font-semibold tabular-nums">
                {fmtMoney(
                  mode === "generated"
                    ? d.contractValueINR ?? d.dealValueINR
                    : d.weightedINR,
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
