"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Building2,
  TreePine,
  Filter,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Loader2,
  ExternalLink,
  MapPin,
  RefreshCw,
  Globe,
  UserCheck,
} from "lucide-react";
import { CrmButton } from "@/components/crm/ui";
import {
  fetchTwoBighaClientProperties,
  fetchTwoBighaAllProperties,
  type LeadProperty,
  type LeadPropertyCounts,
} from "@/portals/crm/lib/twobigha-client-api";

interface Props {
  clientId: string;
}

export default function Client2BighaPropertiesTab({ clientId }: Props) {
  const [properties, setProperties] = useState<LeadProperty[]>([]);
  const [counts, setCounts] = useState<LeadPropertyCounts>({});
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [approvalStatus, setApprovalStatus] = useState<string>("");
  const [propertyCategory, setPropertyCategory] = useState<string>("");
  const [scope, setScope] = useState<"client" | "all">("client");
  const [page, setPage] = useState(1);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 12,
        search: search || undefined,
        approvalStatus: approvalStatus || undefined,
        propertyCategory: propertyCategory || undefined,
      };

      const res =
        scope === "all"
          ? await fetchTwoBighaAllProperties(params)
          : await fetchTwoBighaClientProperties(clientId, params);

      setProperties(res.result || []);
      setCounts(res.counts || {});
      setTotalCount(res.totalCount || 0);
    } catch (err) {
      console.error("Failed to load properties:", err);
    } finally {
      setLoading(false);
    }
  }, [clientId, page, search, approvalStatus, propertyCategory, scope]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const statusTabs = [
    { label: "All", value: "", count: counts.all ?? totalCount },
    { label: "Approved", value: "APPROVED", count: counts.approved ?? 0 },
    { label: "Pending", value: "PENDING", count: counts.pending ?? 0 },
    { label: "Rejected", value: "REJECTED", count: counts.rejected ?? 0 },
    { label: "Flagged", value: "FLAGGED", count: counts.flagged ?? 0 },
  ];

  return (
    <div className="space-y-4">
      {/* Top Controls Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-card p-3.5 rounded-[var(--crm-radius-ui)] border border-border">
        {/* Scope switcher & status pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          {/* Scope Toggle */}
          <div className="flex bg-muted p-0.5 rounded-lg border border-border shrink-0">
            <button
              onClick={() => {
                setScope("client");
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-all ${
                scope === "client"
                  ? "bg-background text-text shadow-xs"
                  : "text-text-muted hover:text-text"
              }`}
            >
              <UserCheck size={12} />
              Client Only
            </button>
            <button
              onClick={() => {
                setScope("all");
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-all ${
                scope === "all"
                  ? "bg-background text-text shadow-xs"
                  : "text-text-muted hover:text-text"
              }`}
            >
              <Globe size={12} />
              All 2Bigha Live
            </button>
          </div>

          <div className="h-4 w-px bg-border shrink-0" />

          {/* Status Tabs */}
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => {
                setApprovalStatus(tab.value);
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                approvalStatus === tab.value
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted/60 text-text-muted hover:bg-muted"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  approvalStatus === tab.value
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-background text-text-muted"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Category & Search */}
        <div className="flex items-center gap-2">
          <select
            value={propertyCategory}
            onChange={(e) => {
              setPropertyCategory(e.target.value);
              setPage(1);
            }}
            className="text-xs bg-background border border-border rounded-md px-2.5 py-1.5 text-text focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Categories</option>
            <option value="PROPERTY">Urban / Commercial</option>
            <option value="FARM">Farmhouse / Farmland</option>
          </select>

          <div className="relative w-48 sm:w-56">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search title, city..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs bg-background border border-border rounded-md pl-8 pr-3 py-1.5 text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <CrmButton
            variant="ghost"
            className="!h-8 !px-2.5"
            onClick={loadData}
            title="Refresh"
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </CrmButton>
        </div>
      </div>

      {/* Property Cards Grid */}
      {loading ? (
        <div className="flex items-center justify-center p-12 text-text-muted gap-2">
          <Loader2 size={18} className="animate-spin text-primary" />
          <span className="text-xs">Loading live properties from 2bigha API...</span>
        </div>
      ) : properties.length === 0 ? (
        <div className="text-center p-12 bg-card rounded-[var(--crm-radius-ui)] border border-dashed border-border space-y-3">
          <Building2 size={36} className="mx-auto text-text-muted opacity-50" />
          <h4 className="text-sm font-semibold text-text">No properties found for this client</h4>
          <p className="text-xs text-text-muted max-w-sm mx-auto">
            This client does not currently have any properties linked to their account on 2Bigha.
          </p>
          <CrmButton
            variant="secondary"
            className="!h-8 text-xs gap-1.5 mx-auto"
            onClick={() => {
              setScope("all");
              setPage(1);
            }}
          >
            <Globe size={13} /> View All 2Bigha Live Properties (5,600+)
          </CrmButton>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {properties.map((prop) => (
            <div
              key={prop.id}
              className="bg-card rounded-[var(--crm-radius-ui)] border border-border overflow-hidden hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                {/* Image / Banner */}
                {(() => {
                  const img = prop.images?.[0];
                  const imgUrl = img?.variants?.medium || img?.variants?.original || img?.variants?.thumbnail || img?.url;
                  return (
                    <div className="h-36 bg-muted relative overflow-hidden flex items-center justify-center">
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt={prop.title || "Property"}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-text-muted gap-1">
                          {prop.propertyType === "AGRICULTURAL" || prop.propertyType === "FARMHOUSE" ? (
                            <TreePine size={32} className="opacity-40" />
                          ) : (
                            <Building2 size={32} className="opacity-40" />
                          )}
                          <span className="text-[11px]">No image uploaded</span>
                        </div>
                      )}

                      {/* Status Badges */}
                      <div className="absolute top-2 left-2 flex gap-1">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            prop.approvalStatus === "APPROVED"
                              ? "bg-emerald-500 text-white"
                              : prop.approvalStatus === "PENDING"
                              ? "bg-amber-500 text-white"
                              : prop.approvalStatus === "REJECTED"
                              ? "bg-rose-500 text-white"
                              : "bg-slate-600 text-white"
                          }`}
                        >
                          {prop.approvalStatus || "DRAFT"}
                        </span>
                        {prop.isVerified && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white flex items-center gap-0.5">
                            <CheckCircle2 size={10} /> Verified
                          </span>
                        )}
                      </div>

                      {prop.price ? (
                        <div className="absolute bottom-2 right-2 bg-black/75 backdrop-blur-xs text-white px-2 py-0.5 rounded text-xs font-bold">
                          ₹{prop.price.toLocaleString("en-IN")}
                        </div>
                      ) : null}
                    </div>
                  );
                })()}

                {/* Content */}
                <div className="p-3.5 space-y-2">
                  <h4 className="text-xs font-bold text-text line-clamp-1" title={prop.title}>
                    {prop.title || "Untitled Property"}
                  </h4>

                  <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                    <MapPin size={12} className="shrink-0 text-text-muted" />
                    <span className="truncate">
                      {[prop.city, prop.district, prop.state].filter(Boolean).join(", ") || "Location not set"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-border">
                    <div>
                      <span className="text-text-muted block text-[10px]">Type / Unit</span>
                      <span className="font-semibold text-text">
                        {prop.propertyType || "Standard"} · {prop.area ? `${prop.area} ${prop.areaUnit || ""}` : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px]">Availability</span>
                      <span className="font-semibold text-text uppercase text-[10px]">
                        {prop.availablilityStatus || "Available"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="px-3.5 py-2.5 bg-muted/30 border-t border-border flex items-center justify-between text-[11px] text-text-muted">
                <span>Created by: {prop.createdByUserName || prop.createdByName || "Self"}</span>
                {prop.createdAt && (
                  <span>{new Date(prop.createdAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
