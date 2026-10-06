"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  Video,
  Scale,
  FileCheck,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  User,
  Calendar,
  ExternalLink,
} from "lucide-react";
import { CrmButton } from "@/components/crm/ui";
import {
  fetchTwoBighaClientFeatureRequests,
  type LeadStatusResponse,
} from "@/portals/crm/lib/twobigha-client-api";

interface Props {
  clientId: string;
}

export default function Client2BighaRequestsTab({ clientId }: Props) {
  const [data, setData] = useState<LeadStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<"all" | "featured" | "social" | "legal">("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchTwoBighaClientFeatureRequests(clientId);
      setData(res);
    } catch (err) {
      console.error("Failed to load feature requests:", err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const featuredList = data?.featured || [];
  const socialList = data?.socialMedia || [];
  const legalList = data?.legal || [];
  const totalRequests = featuredList.length + socialList.length + legalList.length;

  const renderStatusBadge = (status?: string) => {
    const s = String(status || "PENDING").toUpperCase();
    if (s === "APPROVED" || s === "COMPLETED") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <CheckCircle2 size={10} /> {s}
        </span>
      );
    }
    if (s === "REJECTED" || s === "CANCELLED") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          <XCircle size={10} /> {s}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
        <Clock size={10} /> {s}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 bg-card rounded-[var(--crm-radius-ui)] border border-border">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setActiveSubTab("all")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeSubTab === "all" ? "bg-primary text-primary-foreground" : "bg-muted/60 text-text-muted hover:bg-muted"
            }`}
          >
            All Requests
            <span className="text-[10px] bg-background/20 px-1.5 py-0.5 rounded-full font-bold">
              {totalRequests}
            </span>
          </button>
          <button
            onClick={() => setActiveSubTab("featured")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeSubTab === "featured" ? "bg-primary text-primary-foreground" : "bg-muted/60 text-text-muted hover:bg-muted"
            }`}
          >
            <Sparkles size={13} />
            Featured ({featuredList.length})
          </button>
          <button
            onClick={() => setActiveSubTab("social")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeSubTab === "social" ? "bg-primary text-primary-foreground" : "bg-muted/60 text-text-muted hover:bg-muted"
            }`}
          >
            <Video size={13} />
            Social & Video ({socialList.length})
          </button>
          <button
            onClick={() => setActiveSubTab("legal")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeSubTab === "legal" ? "bg-primary text-primary-foreground" : "bg-muted/60 text-text-muted hover:bg-muted"
            }`}
          >
            <Scale size={13} />
            Legal Verification ({legalList.length})
          </button>
        </div>

        <CrmButton variant="ghost" className="!h-8 !px-2.5" onClick={loadData} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </CrmButton>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12 text-text-muted gap-2">
          <Loader2 size={18} className="animate-spin text-primary" />
          <span className="text-xs">Loading requests board from 2bigha...</span>
        </div>
      ) : totalRequests === 0 ? (
        <div className="text-center p-12 bg-card rounded-[var(--crm-radius-ui)] border border-dashed border-border">
          <Clock size={36} className="mx-auto text-text-muted mb-2 opacity-50" />
          <h4 className="text-sm font-semibold text-text">No active requests</h4>
          <p className="text-xs text-text-muted mt-1 max-w-sm mx-auto">
            This client has not submitted any featured listing, social video, or legal verification requests yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Featured Listings */}
          {(activeSubTab === "all" || activeSubTab === "featured") &&
            featuredList.map((req, i) => (
              <div
                key={`featured-${req.id || i}`}
                className="bg-card rounded-[var(--crm-radius-ui)] border border-border p-4 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-600">
                      <Sparkles size={15} />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-text block">Featured Listing Request</span>
                      <span className="text-[10px] text-text-muted">Property ID: {req.propertyId || "—"}</span>
                    </div>
                  </div>
                  {renderStatusBadge(req.status || req.approvalStatus)}
                </div>

                <div className="text-xs font-semibold text-text line-clamp-1">
                  {req.propertyTitle || "Property Title Not Set"}
                </div>

                {req.adminNotes && (
                  <div className="p-2 bg-muted/40 rounded text-[11px] text-text-muted border border-border">
                    <span className="font-semibold text-text block text-[10px]">Admin Notes:</span>
                    {req.adminNotes}
                  </div>
                )}

                <div className="flex items-center justify-between text-[10px] text-text-muted pt-2 border-t border-border">
                  <span>Created: {req.createdAt ? new Date(req.createdAt).toLocaleDateString("en-IN") : "—"}</span>
                  {req.updatedAt && (
                    <span>Updated: {new Date(req.updatedAt).toLocaleDateString("en-IN")}</span>
                  )}
                </div>
              </div>
            ))}

          {/* Social Media & Video */}
          {(activeSubTab === "all" || activeSubTab === "social") &&
            socialList.map((req, i) => (
              <div
                key={`social-${req.id || i}`}
                className="bg-card rounded-[var(--crm-radius-ui)] border border-border p-4 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-600">
                      <Video size={15} />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-text block">Social Media / Video Shoot</span>
                      <span className="text-[10px] text-text-muted">Property ID: {req.propertyId || "—"}</span>
                    </div>
                  </div>
                  {renderStatusBadge(req.status)}
                </div>

                <div className="text-xs font-semibold text-text line-clamp-1">
                  {req.propertyTitle || "Property Title Not Set"}
                </div>

                {req.assignedTo && (
                  <div className="flex items-center gap-1.5 text-xs text-text-muted">
                    <User size={12} className="text-text-muted" />
                    <span>Assigned To: <strong className="text-text">{req.assignedTo}</strong></span>
                  </div>
                )}

                {req.videoLink && (
                  <a
                    href={req.videoLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary font-semibold hover:underline"
                  >
                    <ExternalLink size={12} /> Watch Video Shoot
                  </a>
                )}

                <div className="flex items-center justify-between text-[10px] text-text-muted pt-2 border-t border-border">
                  <span>Created: {req.createdAt ? new Date(req.createdAt).toLocaleDateString("en-IN") : "—"}</span>
                  {req.completedAt && (
                    <span className="text-emerald-600 font-medium">Done: {new Date(req.completedAt).toLocaleDateString("en-IN")}</span>
                  )}
                </div>
              </div>
            ))}

          {/* Legal Verification */}
          {(activeSubTab === "all" || activeSubTab === "legal") &&
            legalList.map((req, i) => (
              <div
                key={`legal-${req.id || i}`}
                className="bg-card rounded-[var(--crm-radius-ui)] border border-border p-4 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-600">
                      <Scale size={15} />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-text block">Legal Verification</span>
                      <span className="text-[10px] text-text-muted">Property ID: {req.propertyId || "—"}</span>
                    </div>
                  </div>
                  {renderStatusBadge(req.status)}
                </div>

                <div className="text-xs font-semibold text-text line-clamp-1">
                  {req.propertyTitle || "Property Title Not Set"}
                </div>

                {req.reviewedByName && (
                  <div className="flex items-center gap-1.5 text-xs text-text-muted">
                    <User size={12} className="text-text-muted" />
                    <span>Lawyer / Reviewer: <strong className="text-text">{req.reviewedByName}</strong></span>
                  </div>
                )}

                {req.hasReport && (
                  <div className="flex items-center gap-1.5 p-2 bg-emerald-500/10 rounded text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                    <FileCheck size={14} />
                    <span>Report Attached: {req.reportFileName || "Legal_Report.pdf"}</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-[10px] text-text-muted pt-2 border-t border-border">
                  <span>Created: {req.createdAt ? new Date(req.createdAt).toLocaleDateString("en-IN") : "—"}</span>
                  {req.reviewedAt && (
                    <span>Reviewed: {new Date(req.reviewedAt).toLocaleDateString("en-IN")}</span>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
