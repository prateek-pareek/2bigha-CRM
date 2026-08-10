"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  ComposedChart,
  Line,
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
import { CRM_API_URL } from '@/lib/crm/config';
import { getCrmAuthToken } from "@/lib/crm/api";
import { CrmChartPanel, CrmDropdown } from "@/components/crm/ui";
import { CRM_CHART_PRIMARY, CRM_CHART_SECONDARY } from "@/lib/crm/shared/chart-theme";
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
      <div className="flex min-h-[320px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-color)] bg-card">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 font-sans pb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#e2e8f0] pb-4">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-[#1e293b]">Revenue Prediction & Forecast</h2>
          <p className="max-w-2xl text-xs font-medium text-slate-500 leading-relaxed">
            Generated revenue from Closed Won deals, plus weighted forecast (contract value × stage
            win probability). Fixed-price deals use the project amount; monthly deals use monthly ×
            contract months (spread across months in the forecast window). Amounts in INR.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Pipeline
          </label>
          <CrmDropdown
            value={pipelineId}
            onChange={setPipelineId}
            options={[
              { value: "all", label: "All pipelines" },
              ...pipelines.map((p) => ({ value: p._id, label: p.name })),
            ]}
          />
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900">
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
              color="primary"
            />
            <SummaryCard
              title="Gross pipeline"
              value={fmtMoney(data.summary.grossTotal)}
              hint={`${data.summary.dealCount} open deals`}
              icon={<DollarSign className="h-5 w-5" />}
              color="primary"
            />
            <SummaryCard
              title="Unscheduled"
              value={String(data.summary.unscheduledCount)}
              hint={`${fmtMoney(data.summary.unscheduledWeighted)} weighted`}
              icon={<DollarSign className="h-5 w-5" />}
              color="amber"
            />
          </div>

          <div className="rounded-xl border border-[#2563eb]/20 bg-[#eff6ff] p-5 shadow-xs">
            <h3 className="text-sm font-bold text-[#2563eb] mb-1">Revenue Summary</h3>
            <p className="text-xs font-medium text-slate-700 leading-relaxed">
              Generated revenue from Closed Won deals is{" "}
              <span className="font-extrabold text-[#0f172a]">{fmtMoney(generatedTotal)}</span> across{" "}
              <span className="font-extrabold text-[#0f172a]">{generatedDealCount}</span> deals in the last{" "}
              {lookback} months
              {generatedThisMonth > 0
                ? ` (including ${fmtMoney(generatedThisMonth)} this month)`
                : ""}
              . Open pipeline weighted forecast is{" "}
              <span className="font-extrabold text-[#0f172a]">{fmtMoney(data.summary.weightedTotal)}</span> across{" "}
              <span className="font-extrabold text-[#0f172a]">{data.summary.dealCount}</span> deals
              {data.summary.unscheduledCount > 0
                ? `; ${data.summary.unscheduledCount} open deals lack a close date in the forecast window.`
                : "."}
            </p>
          </div>

          <CrmChartPanel title="Generated vs Forecast by Month" bodyClassName="pt-0">
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.6} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "#475569", fontWeight: 700 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
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
                        ? "Generated (Closed Won)"
                        : name === "gross"
                          ? "Gross pipeline"
                          : "Weighted forecast",
                    ]}
                    contentStyle={{
                      borderRadius: 12,
                      border: "none",
                      boxShadow: "0 12px 24px -8px rgb(0 0 0 / 0.15)",
                      fontSize: 12,
                      fontWeight: 600,
                      backgroundColor: "rgba(255,255,255,0.97)",
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
                  <Bar dataKey="generated" name="Generated (Closed Won)" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="gross" name="Gross pipeline" fill="#e2e8f0" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  <Line type="monotone" dataKey="weighted" name="Weighted forecast" stroke="#2563eb" strokeWidth={3} dot={{ r: 5, fill: "#2563eb", strokeWidth: 2, stroke: "#fff" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CrmChartPanel>

          <div className="rounded-xl border border-[#e2e8f0] bg-white shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] overflow-hidden">
            <div className="border-b border-[#e2e8f0] px-6 py-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                By Month Breakdown
              </h3>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Expand a month to see Closed Won deals (generated) and open deals (forecast).
              </p>
            </div>
            <div className="divide-y divide-[#e2e8f0]">
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
                      className="flex w-full items-center gap-3 px-6 py-4 text-left transition-colors hover:bg-[#f8fafc]"
                    >
                      {open ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-[#1e293b]">
                          {month.label}
                          {month.isCurrent ? (
                            <span className="ml-2.5 inline-flex items-center rounded-md bg-[#eff6ff] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#2563eb]">
                              Current
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs font-medium text-slate-500">
                          {month.generatedDealCount || 0} won · {month.dealCount} open
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-extrabold tabular-nums text-[#10b981]">
                          {fmtMoney(month.generated || 0)}
                        </p>
                        <p className="text-xs font-medium text-slate-500">
                          forecast {fmtMoney(month.weighted)}
                        </p>
                      </div>
                    </button>
                    {open && (
                      <div className="space-y-4 px-6 pb-5 pt-1 bg-[#f8fafc]/50 border-t border-[#e2e8f0]">
                        {(month.generatedDeals?.length || 0) > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-bold uppercase tracking-wider text-[#10b981]">
                              Generated (Closed Won)
                            </p>
                            <DealTable deals={month.generatedDeals} mode="generated" />
                          </div>
                        )}
                        {month.deals.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                              Forecast (Open Deals)
                            </p>
                            <DealTable deals={month.deals} mode="forecast" />
                          </div>
                        )}
                        {!hasAny && (
                          <p className="text-xs font-medium text-slate-500">
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
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 shadow-xs overflow-hidden">
              <button
                type="button"
                onClick={() => setShowUnscheduled((v) => !v)}
                className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-amber-100/50"
              >
                <div>
                  <h3 className="text-sm font-bold text-amber-950">
                    Unscheduled open deals ({data.unscheduled.length})
                  </h3>
                  <p className="text-xs font-medium text-amber-800/90">
                    Missing expected close date or outside the forecast window ·{" "}
                    <span className="font-bold">{fmtMoney(data.summary.unscheduledWeighted)}</span> weighted
                  </p>
                </div>
                {showUnscheduled ? (
                  <ChevronDown className="h-4 w-4 text-amber-800" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-amber-800" />
                )}
              </button>
              {showUnscheduled && (
                <div className="p-4 border-t border-amber-200/80 bg-white">
                  <DealTable deals={data.unscheduled} mode="forecast" />
                </div>
              )}
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
  color: "primary" | "emerald" | "amber";
}) {
  const colors = {
    primary: "bg-[#dbeafe] text-[#2563eb]",
    emerald: "bg-[#dcfce7] text-[#10b981]",
    amber: "bg-[#fef3c7] text-[#d97706]",
  };
  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-white p-5 shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] transition-all hover:border-slate-300">
      <div className={cn("mb-3 inline-flex rounded-xl p-2.5 shadow-xs", colors[color])}>{icon}</div>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums text-[#0f172a]">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-400">{hint}</p>
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
    <div className="overflow-x-auto rounded-lg border border-[#e2e8f0] bg-white shadow-xs">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead>
          <tr className="bg-[#f8fafc] border-b border-[#e2e8f0] text-xs font-bold text-[#1e293b]">
            <th className="px-4 py-3">Deal</th>
            <th className="px-4 py-3">Stage</th>
            <th className="px-4 py-3">{mode === "generated" ? "Closed" : "Close"}</th>
            <th className="px-4 py-3 text-right">Value</th>
            {mode === "forecast" && <th className="px-4 py-3 text-right">Prob.</th>}
            <th className="px-4 py-3 text-right">
              {mode === "generated" ? "Generated" : "Weighted"}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e2e8f0]">
          {deals.map((d) => (
            <tr key={d._id} className="transition-colors hover:bg-[#f8fafc]">
              <td className="px-4 py-3.5">
                <Link
                  href={`/crm/deals/${d._id}`}
                  className="font-bold text-[#2563eb] hover:underline"
                >
                  {d.title}
                </Link>
                {d.organization ? (
                  <p className="mt-0.5 text-xs font-medium text-slate-500">{d.organization}</p>
                ) : null}
                {d.pricingType === "monthly" ? (
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[#10b981]">
                    Monthly · {d.contractMonths || 12} mo
                  </p>
                ) : null}
              </td>
              <td className="px-4 py-3.5 font-semibold text-slate-700">{d.stage}</td>
              <td className="px-4 py-3.5 font-medium text-slate-500">
                {fmtDate(mode === "generated" ? d.closedDate || d.expectedClosureDate : d.expectedClosureDate)}
              </td>
              <td className="px-4 py-3.5 text-right font-bold tabular-nums text-[#0f172a]">
                {fmtMoney(d.dealValueINR)}
                {d.pricingType === "monthly" ? "/mo" : ""}
              </td>
              {mode === "forecast" && (
                <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-slate-700">{d.probability}%</td>
              )}
              <td className="px-4 py-3.5 text-right font-extrabold tabular-nums text-[#0f172a]">
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
