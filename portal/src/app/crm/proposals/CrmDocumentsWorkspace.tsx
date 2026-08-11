"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import {
  Blocks,
  Columns3,
  Download,
  FileSpreadsheet,
  FileText,
  FileType,
  LayoutList,
  Loader2,
  Mail,
  Palette,
  Pencil,
  Plus,
  ScrollText,
  Search,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from '@/lib/crm/config';
import { getCrmAuthToken } from "@/lib/crm/api";
import { canViewCrmRevenue, getStoredUser } from '@/lib/suite/auth';
import { useEmailComposerStore } from "@/stores/emailComposerStore";
import RichTextEditor from '@/components/suite/editors/RichTextEditor';
import { fetchCrmPipelines } from "@/lib/crm/shared/pipelines-api";
import ProposalPipelineBoard from "./ProposalPipelineBoard";
import {
  buildItConsultingProposalHtml,
  buildQuotationHtml,
  documentTemplatesForKind,
  PRICING_MILESTONE_PRESETS,
  type DocumentKind,
  type PricingMilestonePreset,
} from "@/lib/crm/proposal-templates";
import {
  appendBlockToBody,
  ProposalBlocksManagerDialog,
  ProposalBrandingDialog,
  type ProposalBlockRow,
} from "./proposal-library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CrmPageHeader,
  CrmButton,
  CrmHeaderTools,
  CrmTableShell,
  CrmTable,
} from "@/components/crm/ui";
import { CRM_LIST_PAGE } from "@/lib/crm/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const HS_PANEL =
  "rounded-md border border-[var(--border-color)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]";

type CommercialsInputMode = "template" | "lines" | "html";

type ProposalRow = {
  _id: string;
  title: string;
  kind: DocumentKind;
  issuerProfile?: "agency" | "freelancer";
  status: string;
  pipeline?: string;
  stage?: string;
  clientName?: string;
  clientEmail?: string;
  subject?: string;
  bodyHtml?: string;
  relatedModule?: "lead" | "contact" | "deal" | "client" | "platform-opportunity";
  relatedTo?: string;
  totalAmount?: number;
  currency?: string;
  updatedAt?: string;
  createdAt?: string;
  createdBy?: { firstName?: string; lastName?: string; email?: string };
};

type DraftShape = {
  title: string;
  kind: DocumentKind;
  issuerProfile: "agency" | "freelancer";
  status: string;
  pipeline?: string;
  stage?: string;
  clientName: string;
  clientEmail: string;
  subject: string;
  bodyHtml: string;
  relatedModule?: "lead" | "contact" | "deal" | "client" | "platform-opportunity";
  relatedTo?: string;
};

type ProposalPipeline = {
  _id: string;
  name?: string;
  isDefault?: boolean;
  stages?: Array<{ name: string; order?: number; isDefault?: boolean; probability?: number }>;
};

type AiSourceModule =
  | "leads"
  | "contacts"
  | "deals"
  | "platform-opportunities";

type AiSourceOption = {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  title?: string;
  stage?: string;
  dealValue?: number;
  organization?: string | { name?: string };
  platformClientLabel?: string;
  opportunitySourcePlatform?: string;
  notes?: string;
  sourceMetadata?: { description?: string; title?: string };
};

const emptyDraft = (): DraftShape => ({
  title: "",
  kind: "proposal",
  issuerProfile: "agency",
  status: "draft",
  pipeline: undefined,
  stage: undefined,
  clientName: "",
  clientEmail: "",
  subject: "",
  bodyHtml: "<p></p>",
  relatedModule: undefined,
  relatedTo: undefined,
});

function Dropdown({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative h-10 w-full sm:w-[200px]">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={`h-10 w-full inline-flex items-center justify-between gap-2 bg-white border rounded-md pl-3 pr-2.5 text-sm font-medium text-[var(--text-main)] shadow-sm transition-colors ${
          open ? 'border-[var(--hs-link)] ring-1 ring-[var(--hs-link)]/30' : 'border-[var(--border-color)] hover:border-[var(--primary-muted)]'
        }`}
      >
        <span className="truncate">{selected?.label}</span>
        <ChevronDown size={13} className={`text-[var(--primary-muted)] shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-[9999] bg-white border border-[var(--border-color)] rounded-md shadow-lg w-full overflow-hidden py-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors text-left ${
                opt.value === value
                  ? 'bg-[#fff1ee] text-[var(--hs-link)] font-semibold'
                  : 'text-[var(--text-main)] font-medium hover:bg-[var(--background)]'
              }`}
            >
              <span>{opt.label}</span>
              {opt.value === value && <Check size={13} className="text-[var(--hs-link)] shrink-0 ml-3" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CrmDocumentsWorkspace({
  mode = "proposals",
}: {
  mode?: "proposals" | "quotations" | "contracts";
}) {
  const isContracts = mode === "contracts";
  const isQuotations = mode === "quotations";
  /** Each module is locked to a single document kind — mirrors the Contracts workspace. */
  const lockedKind: DocumentKind = isContracts
    ? "contract"
    : isQuotations
      ? "quotation"
      : "proposal";
  const moduleNounSingular = isContracts ? "contract" : isQuotations ? "quotation" : "proposal";
  const moduleNounPlural = isContracts ? "contracts" : isQuotations ? "quotations" : "proposals";
  const moduleTitle = isContracts ? "Contracts" : isQuotations ? "Quotations" : "Proposals";
  const pipelineType = isContracts ? "contracts" : isQuotations ? "quotations" : "proposals";
  const openComposer = useEmailComposerStore((s) => s.openComposer);
  const [rows, setRows] = useState<ProposalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [pipelines, setPipelines] = useState<ProposalPipeline[]>([]);
  const [pipelineFilter, setPipelineFilter] = useState<string>("");
  const [movingStageId, setMovingStageId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [draft, setDraft] = useState<DraftShape>(emptyDraft());
  const [aiSourceModule, setAiSourceModule] = useState<AiSourceModule>("leads");
  const [aiSourceEntityId, setAiSourceEntityId] = useState("");
  const [aiSourceQuery, setAiSourceQuery] = useState("");
  const [aiSourceResults, setAiSourceResults] = useState<AiSourceOption[]>([]);
  const [aiSourceLoading, setAiSourceLoading] = useState(false);
  const [aiSourceOpen, setAiSourceOpen] = useState(false);
  const [aiClientNeeds, setAiClientNeeds] = useState("");
  const [aiExtraInstructions, setAiExtraInstructions] = useState("");
  const [proposalAiDefaultIssuer, setProposalAiDefaultIssuer] = useState<
    "agency" | "freelancer"
  >("agency");
  const [contractAiDefaultIssuer, setContractAiDefaultIssuer] = useState<
    "agency" | "freelancer"
  >("agency");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  /** e.g. `${id}:pdf` while that export is in flight */
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [brandingDialogOpen, setBrandingDialogOpen] = useState(false);
  const [blocksDialogOpen, setBlocksDialogOpen] = useState(false);
  const [insertBlocks, setInsertBlocks] = useState<ProposalBlockRow[]>([]);
  const [insertBlockSelectKey, setInsertBlockSelectKey] = useState(0);
  const [tplProjectTitle, setTplProjectTitle] = useState("");
  const [tplProductName, setTplProductName] = useState("");
  const [tplOverview, setTplOverview] = useState("");
  const [tplScope, setTplScope] = useState("");
  const [tplQuoteTitle, setTplQuoteTitle] = useState("");
  const [tplQuoteClient, setTplQuoteClient] = useState("");
  const [tplQuoteLines, setTplQuoteLines] = useState("");
  const [tplQuoteTotal, setTplQuoteTotal] = useState("");
  /** IT template — one line per bullet / tier */
  const [tplCommercialPackages, setTplCommercialPackages] = useState("");
  const [tplPaymentMilestones, setTplPaymentMilestones] = useState("");
  const [tplTechStackLines, setTplTechStackLines] = useState("");
  const [tplDeliveryMilestones, setTplDeliveryMilestones] = useState("");
  /** Used when delivery milestone list is empty */
  const [tplTimelineNarrative, setTplTimelineNarrative] = useState("");
  /** Paragraphs; blank line between case studies */
  const [tplPortfolioCases, setTplPortfolioCases] = useState("");
  /** Section 4 only — when mode is `html`, replaces generated pricing + payment block */
  const [tplCommercialsHtml, setTplCommercialsHtml] = useState("");
  const [commercialsInputMode, setCommercialsInputMode] =
    useState<CommercialsInputMode>("lines");
  const [selectedCommercialsPresetId, setSelectedCommercialsPresetId] = useState(
    () => PRICING_MILESTONE_PRESETS[0]?.id ?? "standard_mobile_tiers",
  );
  /** New docs: quick setup first; edits open straight in the editor. */
  const [composeStep, setComposeStep] = useState<"quick" | "editor">("quick");
  const [showAdvancedCompose, setShowAdvancedCompose] = useState(false);
  const [showCrmLinkOnQuick, setShowCrmLinkOnQuick] = useState(false);

  const applyCommercialsPreset = useCallback((preset: PricingMilestonePreset) => {
    setTplCommercialPackages(preset.commercialPackageLines);
    setTplPaymentMilestones(preset.paymentMilestoneLines);
    setTplDeliveryMilestones(preset.deliveryMilestoneLines);
    setTplTimelineNarrative(preset.timelineText);
  }, []);

  const authHeaders = useCallback(() => {
    const t = getCrmAuthToken();
    const h: Record<string, string> = {};
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }, []);

  const aiSourceLabel = useCallback(
    (row: AiSourceOption, module: AiSourceModule = aiSourceModule) => {
      if (module === "deals") {
        const title = row.title?.trim() || "Deal";
        const bits = [
          row.stage,
          canViewCrmRevenue(getStoredUser()) && row.dealValue != null
            ? `₹${row.dealValue}`
            : "",
        ].filter(Boolean);
        return bits.length ? `${title} (${bits.join(" · ")})` : title;
      }
      if (module === "platform-opportunities") {
        const title = row.title?.trim() || "Opportunity";
        const bits = [row.opportunitySourcePlatform, row.platformClientLabel].filter(Boolean);
        return bits.length ? `${title} (${bits.join(" · ")})` : title;
      }
      const name = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || "Unnamed";
      const org =
        typeof row.organization === "string"
          ? row.organization
          : row.organization?.name || "";
      const email = row.email?.trim() || "";
      const sub = [email, org].filter(Boolean).join(" · ");
      return sub ? `${name} (${sub})` : name;
    },
    [aiSourceModule],
  );

  const aiRelatedModule = useCallback((module: AiSourceModule) => {
    if (module === "contacts") return "contact" as const;
    if (module === "deals") return "deal" as const;
    if (module === "platform-opportunities") return "platform-opportunity" as const;
    return "lead" as const;
  }, []);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      q.set("kind", lockedKind);
      if (search.trim()) q.set("q", search.trim());
      if (pipelineFilter) q.set("pipeline", pipelineFilter);
      const res = await fetch(`${CRM_API_URL}/crm/proposals?${q.toString()}`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) {
        const hint =
          res.status === 401
            ? "Sign in again."
            : res.status === 403
              ? `You may not have CRM permission to view ${moduleNounPlural}.`
              : `Server returned ${res.status}.`;
        throw new Error(hint);
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setRows(
        list.map((row: ProposalRow) => ({
          ...row,
          pipeline:
            typeof row.pipeline === "object" &&
            row.pipeline &&
            "_id" in (row.pipeline as object)
              ? String((row.pipeline as { _id: string })._id)
              : row.pipeline
                ? String(row.pipeline)
                : undefined,
        })),
      );
    } catch (e) {
      const detail = e instanceof Error ? e.message : "";
      toast.error(
        detail
          ? `Could not load ${moduleNounPlural} — ${detail}`
          : `Could not load ${moduleNounPlural}`,
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, lockedKind, search, pipelineFilter, moduleNounPlural]);

  useEffect(() => {
    void (async () => {
      const token = getCrmAuthToken();
      const list = await fetchCrmPipelines(pipelineType, token);
      const normalized: ProposalPipeline[] = list.map((p) => ({
        _id: String(p._id),
        name: String(p.name || "Pipeline"),
        isDefault: Boolean(p.isDefault),
        stages: Array.isArray(p.stages)
          ? (p.stages as ProposalPipeline["stages"])
          : [],
      }));
      setPipelines(normalized);
      setPipelineFilter((prev) => {
        if (prev) return prev;
        const def = normalized.find((p) => p.isDefault) || normalized[0];
        return def?._id || "";
      });
    })();
  }, [pipelineType]);

  const activePipeline =
    pipelines.find((p) => p._id === pipelineFilter) ||
    pipelines.find((p) => p.isDefault) ||
    pipelines[0] ||
    null;

  const activeStages = [...(activePipeline?.stages || [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const loadInsertBlocks = useCallback(async () => {
    const token = getCrmAuthToken();
    if (!token) return;
    try {
      const res = await fetch(`${CRM_API_URL}/crm/proposal-blocks`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setInsertBlocks(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    }
  }, [authHeaders]);

  useEffect(() => {
    void loadInsertBlocks();
  }, [loadInsertBlocks]);

  useEffect(() => {
    if (dialogOpen) void loadInsertBlocks();
  }, [dialogOpen, loadInsertBlocks]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    void fetch(`${CRM_API_URL}/crm/ai/proposal-settings`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.defaultIssuerProfile === "freelancer") {
          setProposalAiDefaultIssuer("freelancer");
        } else if (data?.defaultIssuerProfile === "agency") {
          setProposalAiDefaultIssuer("agency");
        }
      })
      .catch(() => undefined);
    void fetch(`${CRM_API_URL}/crm/ai/contract-settings`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.defaultIssuerProfile === "freelancer") {
          setContractAiDefaultIssuer("freelancer");
        } else if (data?.defaultIssuerProfile === "agency") {
          setContractAiDefaultIssuer("agency");
        }
      })
      .catch(() => undefined);
  }, []);

  const openNew = (kind: DocumentKind) => {
    setEditingId(null);
    const pipe = activePipeline;
    const defaultStage =
      pipe?.stages?.find((s) => s.isDefault)?.name ||
      [...(pipe?.stages || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0]
        ?.name ||
      "Draft";
    setDraft({
      ...emptyDraft(),
      kind,
      pipeline: pipe?._id,
      stage: defaultStage,
      issuerProfile:
        kind === "contract"
          ? contractAiDefaultIssuer === "freelancer"
            ? "freelancer"
            : "agency"
          : proposalAiDefaultIssuer === "freelancer"
            ? "freelancer"
            : "agency",
      title: kind === "contract" ? "Service agreement" : "",
      bodyHtml: "<p></p>",
    });
    setTplProjectTitle("");
    setTplProductName("");
    setTplOverview("");
    setTplScope("");
    setTplQuoteTitle("");
    setTplQuoteClient("");
    setTplQuoteLines("");
    setTplQuoteTotal("");
    setTplCommercialPackages("");
    setTplPaymentMilestones("");
    setTplTechStackLines("");
    setTplDeliveryMilestones("");
    setTplTimelineNarrative("");
    setTplPortfolioCases("");
    setTplCommercialsHtml("");
    setCommercialsInputMode("lines");
    setSelectedCommercialsPresetId(PRICING_MILESTONE_PRESETS[0]?.id ?? "standard_mobile_tiers");
    setAiSourceModule("leads");
    setAiSourceEntityId("");
    setAiSourceQuery("");
    setAiSourceResults([]);
    setAiSourceOpen(false);
    setAiClientNeeds("");
    setAiExtraInstructions("");
    setComposeStep("quick");
    setShowAdvancedCompose(false);
    setShowCrmLinkOnQuick(false);
    setDialogOpen(true);
  };

  const openEdit = (row: ProposalRow) => {
    setEditingId(row._id);
    setDraft({
      title: row.title,
      kind: row.kind,
      issuerProfile: row.issuerProfile === "freelancer" ? "freelancer" : "agency",
      status: row.status,
      pipeline: row.pipeline || activePipeline?._id,
      stage: row.stage || undefined,
      clientName: row.clientName || "",
      clientEmail: row.clientEmail || "",
      subject: row.subject || "",
      bodyHtml: row.bodyHtml || "<p></p>",
      relatedModule: row.relatedModule,
      relatedTo: row.relatedTo,
    });
    setDialogOpen(true);
    setAiSourceModule(row.relatedModule === "contact" ? "contacts" : "leads");
    setAiSourceEntityId(row.relatedTo || "");
    setAiSourceQuery("");
    setAiSourceResults([]);
    setAiSourceOpen(false);
    setAiClientNeeds("");
    setAiExtraInstructions("");
    setTplCommercialsHtml("");
    setCommercialsInputMode("lines");
    setSelectedCommercialsPresetId(PRICING_MILESTONE_PRESETS[0]?.id ?? "standard_mobile_tiers");
    setComposeStep("editor");
    setShowAdvancedCompose(false);
  };

  const goToEditor = () => setComposeStep("editor");

  const quickApplyStandardTemplate = () => {
    const title =
      draft.title.trim() ||
      (draft.clientName.trim() ? `${draft.clientName} — proposal` : "Project proposal");
    const brief = aiClientNeeds.trim();
    const overview =
      brief ||
      "We will deliver a reliable, scalable solution aligned to your business goals and timeline.";
    const scope = brief
      ? `Deliverables based on your brief:\n${brief}`
      : "Discovery, design, build, QA, and handover — scope to be confirmed in kick-off.";
    const preset =
      PRICING_MILESTONE_PRESETS.find((p) => p.id === selectedCommercialsPresetId) ??
      PRICING_MILESTONE_PRESETS[0]!;
    const html = buildItConsultingProposalHtml({
      projectTitle: title,
      productName: draft.clientName.trim() || "your product",
      projectOverview: overview,
      scopeOfWork: scope,
      commercialPackageLines: preset.commercialPackageLines,
      paymentMilestoneLines: preset.paymentMilestoneLines,
      deliveryMilestoneLines: preset.deliveryMilestoneLines,
      timelineText: preset.timelineText,
    });
    setTplProjectTitle(title);
    setTplProductName(draft.clientName.trim() || "your product");
    setTplOverview(overview);
    setTplScope(scope);
    applyCommercialsPreset(preset);
    setCommercialsInputMode("template");
    setSelectedCommercialsPresetId(preset.id);
    setDraft((d) => ({
      ...d,
      title,
      bodyHtml: html,
      subject: d.subject || `Proposal: ${title}`,
    }));
    setComposeStep("editor");
    toast.success("Standard proposal inserted — refine in the editor below.");
  };

  const quickApplyQuotationTemplate = () => {
    const title = draft.title.trim() || "Quotation";
    const client = draft.clientName.trim() || "Client";
    const html = buildQuotationHtml({
      quotationTitle: title,
      clientName: client,
      lineItemsDescription:
        "Discovery & requirements\nDesign & UI\nDevelopment\nQA & launch",
      totalInr: "0",
    });
    setTplQuoteTitle(title);
    setTplQuoteClient(client);
    setDraft((d) => ({
      ...d,
      kind: "quotation",
      title,
      clientName: client,
      bodyHtml: html,
      subject: d.subject || `Quotation: ${title}`,
    }));
    setComposeStep("editor");
    toast.success("Quotation template inserted.");
  };

  const quickStartBlank = () => {
    setDraft((d) => ({
      ...d,
      bodyHtml: d.bodyHtml?.trim() && d.bodyHtml !== "<p></p>" ? d.bodyHtml : "<p></p>",
    }));
    setComposeStep("editor");
  };

  const applyTemplate = (templateId: string) => {
    if (templateId === "it_proposal") {
      const useFullCommercialsHtml =
        commercialsInputMode === "html" && tplCommercialsHtml.trim().length > 0;
      const html = buildItConsultingProposalHtml({
        projectTitle: tplProjectTitle || draft.title || "Project proposal",
        productName: tplProductName || "your product",
        projectOverview: tplOverview || "Describe goals and MVP scope.",
        scopeOfWork: tplScope || "Add modules, roles, and features.",
        commercialsHtml: useFullCommercialsHtml
          ? tplCommercialsHtml.trim()
          : undefined,
        commercialPackageLines: useFullCommercialsHtml
          ? undefined
          : tplCommercialPackages.trim() || undefined,
        paymentMilestoneLines: useFullCommercialsHtml
          ? undefined
          : tplPaymentMilestones.trim() || undefined,
        techStackLines: tplTechStackLines.trim() || undefined,
        deliveryMilestoneLines: tplDeliveryMilestones.trim() || undefined,
        timelineText: tplTimelineNarrative.trim() || undefined,
        portfolioCaseStudyText: tplPortfolioCases.trim() || undefined,
      });
      setDraft((d) => ({
        ...d,
        title: d.title || tplProjectTitle || "Project proposal",
        bodyHtml: html,
        subject: d.subject || `Proposal: ${tplProjectTitle || d.title || "Project"}`,
      }));
      toast.success("IT proposal template inserted — edit freely in the editor.");
    } else if (templateId === "quotation") {
      const html = buildQuotationHtml({
        quotationTitle: tplQuoteTitle || draft.title || "Quotation",
        clientName: tplQuoteClient || draft.clientName || "Client",
        lineItemsDescription: tplQuoteLines || "Discovery & requirements\nDesign & UI\nDevelopment\nQA & launch",
        totalInr: tplQuoteTotal || "0",
      });
      setDraft((d) => ({
        ...d,
        kind: "quotation",
        title: d.title || tplQuoteTitle || "Quotation",
        clientName: d.clientName || tplQuoteClient,
        bodyHtml: html,
        subject: d.subject || `Quotation: ${tplQuoteTitle || d.title || "Services"}`,
      }));
      toast.success("Quotation template inserted.");
    }
  };

  const saveDraft = async () => {
    const token = getCrmAuthToken();
    if (!token) {
      toast.error("Sign in to save");
      return;
    }
    if (!draft.title?.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: draft.title.trim(),
        kind: draft.kind,
        issuerProfile: draft.issuerProfile,
        status: draft.status,
        pipeline: draft.pipeline || undefined,
        stage: draft.stage || undefined,
        clientName: draft.clientName?.trim() || "",
        clientEmail: draft.clientEmail?.trim() || "",
        subject: draft.subject?.trim() || "",
        bodyHtml: draft.bodyHtml || "",
        relatedModule: draft.relatedModule,
        relatedTo: draft.relatedTo || undefined,
      };
      const url = editingId
        ? `${CRM_API_URL}/crm/proposals/${editingId}`
        : `${CRM_API_URL}/crm/proposals`;
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || "Save failed");
      }
      toast.success(editingId ? "Updated" : "Created");
      setDialogOpen(false);
      void fetchRows();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const moveProposalStage = async (row: ProposalRow, stage: string) => {
    setMovingStageId(row._id);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/proposals/${row._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          pipeline: row.pipeline || activePipeline?._id,
          stage,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || "Could not move proposal");
      }
      toast.success(`Moved to ${stage}`);
      void fetchRows();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not move proposal");
    } finally {
      setMovingStageId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const token = getCrmAuthToken();
    if (!token) return;
    const res = await fetch(`${CRM_API_URL}/crm/proposals/${deleteId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    setDeleteId(null);
    if (!res.ok) {
      toast.error("Could not delete");
      return;
    }
    toast.success("Removed");
    void fetchRows();
  };

  const sendEmail = async () => {
    if (!editingId) {
      toast.error("Save to CRM once before sending, so we can track status.");
      return;
    }
    if (!draft.clientEmail?.trim() || !draft.clientEmail.includes("@")) {
      toast.error("Add a valid client email to send");
      return;
    }
    const subj = draft.subject?.trim() || draft.title?.trim() || "Proposal";
    openComposer({
      recipientEmail: draft.clientEmail.trim(),
      recipientName: draft.clientName?.trim() || "",
      initialData: {
        subject: subj,
        body: draft.bodyHtml || "",
      },
      module: "CRM",
      entityId: "000000000000000000000000",
      onSuccess: () => {
        if (editingId) {
          void fetch(`${CRM_API_URL}/crm/proposals/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ status: "sent" }),
          }).then(() => fetchRows());
        }
        toast.success("Email sent — status set to Sent when saved on server.");
      },
    });
    setDialogOpen(false);
  };

  const draftWithAi = async () => {
    const sourceId = aiSourceEntityId.trim();
    if (!sourceId) {
      toast.error("Select a CRM record to draft from");
      return;
    }
    const isContract = draft.kind === "contract";
    setAiDrafting(true);
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/ai/${isContract ? "draft-contract" : "draft-proposal"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            module: aiSourceModule,
            entityId: sourceId,
            issuerProfile: draft.issuerProfile,
            ...(isContract
              ? {}
              : { kind: draft.kind === "quotation" ? "quotation" : "proposal" }),
            clientNeeds: aiClientNeeds.trim() || undefined,
            instructions: aiExtraInstructions.trim() || undefined,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || `AI draft failed (${res.status})`);
      }
      const data = await res.json();
      setDraft((prev) => ({
        ...prev,
        kind: isContract ? "contract" : prev.kind,
        title:
          typeof data?.title === "string" && data.title.trim()
            ? data.title.trim()
            : prev.title,
        subject:
          typeof data?.subject === "string" && data.subject.trim()
            ? data.subject.trim()
            : prev.subject,
        bodyHtml:
          typeof data?.bodyHtml === "string" && data.bodyHtml.trim()
            ? data.bodyHtml
            : prev.bodyHtml,
        clientName:
          typeof data?.clientName === "string" && data.clientName.trim()
            ? data.clientName.trim()
            : prev.clientName,
        clientEmail:
          typeof data?.clientEmail === "string" && data.clientEmail.trim()
            ? data.clientEmail.trim()
            : prev.clientEmail,
        relatedModule: aiRelatedModule(aiSourceModule),
        relatedTo: sourceId,
      }));
      toast.success(
        isContract
          ? "AI contract drafted from CRM context."
          : "AI proposal drafted from CRM context.",
      );
      setComposeStep("editor");
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : isContract
            ? "AI contract draft failed"
            : "AI proposal draft failed",
      );
    } finally {
      setAiDrafting(false);
    }
  };

  useEffect(() => {
    const q = aiSourceQuery.trim();
    if (!dialogOpen || !q) {
      setAiSourceResults([]);
      setAiSourceLoading(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      setAiSourceLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", "1");
        params.set("pageSize", "8");
        params.set("search", q);
        const endpoint =
          aiSourceModule === "leads"
            ? `${CRM_API_URL}/crm/leads?${params.toString()}`
            : aiSourceModule === "contacts"
              ? `${CRM_API_URL}/crm/contacts?${params.toString()}`
              : aiSourceModule === "deals"
                ? `${CRM_API_URL}/crm/deals?${params.toString()}`
                : `${CRM_API_URL}/crm/platform-opportunities?${params.toString()}`;
        const res = await fetch(endpoint, {
          headers: authHeaders(),
          cache: "no-store",
        });
        if (!res.ok) {
          setAiSourceResults([]);
          return;
        }
        const data = await res.json();
        const rows = Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data)
            ? data
            : [];
        setAiSourceResults(rows as AiSourceOption[]);
      } catch {
        setAiSourceResults([]);
      } finally {
        setAiSourceLoading(false);
      }
    }, 260);
    return () => window.clearTimeout(timer);
  }, [aiSourceQuery, aiSourceModule, dialogOpen, authHeaders, aiRelatedModule]);

  const filenameFromDisposition = (header: string | null, fallback: string) => {
    if (!header) return fallback;
    const star = header.match(/filename\*=UTF-8''([^;\n]+)/i);
    if (star?.[1]) {
      try {
        return decodeURIComponent(star[1].trim());
      } catch {
        /* use fallback */
      }
    }
    const quoted = header.match(/filename="([^"]+)"/i);
    if (quoted?.[1]) return quoted[1].trim();
    const plain = header.match(/filename=([^;\n]+)/i);
    if (plain?.[1]) return plain[1].trim().replace(/^"|"$/g, "");
    return fallback;
  };

  const slugDownloadName = (title: string, ext: string) => {
    const slug = (title || "document")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s-]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80);
    return `${slug || "document"}.${ext}`;
  };

  const downloadExport = async (
    id: string,
    format: "pdf" | "docx" | "xlsx",
    titleHint: string,
  ) => {
    const token = getCrmAuthToken();
    if (!token) {
      toast.error("Sign in to download");
      return;
    }
    const path =
      format === "pdf" ? "export/pdf" : format === "docx" ? "export/docx" : "export/xlsx";
    const ext = format === "pdf" ? "pdf" : format === "docx" ? "docx" : "xlsx";
    const fallbackName = slugDownloadName(titleHint, ext);
    const key = `${id}:${format}`;
    setExportingKey(key);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/proposals/${id}/${path}`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) {
        const hint =
          res.status === 401
            ? "Sign in again."
            : res.status === 403
              ? "You may not have permission to export."
              : `Server returned ${res.status}.`;
        throw new Error(hint);
      }
      const blob = await res.blob();
      const name = filenameFromDisposition(
        res.headers.get("Content-Disposition"),
        fallbackName,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(
        format === "pdf"
          ? "PDF downloaded"
          : format === "docx"
            ? "Word document downloaded"
            : "Excel workbook downloaded",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    } finally {
      setExportingKey(null);
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      draft: "bg-slate-100 text-slate-700",
      sent: "bg-sky-100 text-sky-800",
      accepted: "bg-emerald-100 text-emerald-800",
      declined: "bg-rose-100 text-rose-800",
      expired: "bg-amber-100 text-amber-900",
      archived: "bg-zinc-100 text-zinc-600",
    };
    return map[s] || "bg-slate-100 text-slate-600";
  };

  return (
    <div className={`${CRM_LIST_PAGE} mx-auto w-full max-w-6xl space-y-6 pb-8 md:pb-10`}>
      <CrmPageHeader
        bordered={false}
        title={moduleTitle}
        description={
          isContracts
            ? "Create and manage client contracts with customizable pipeline stages. List or board view — move contracts through Draft → Signed like deals and leads."
            : isQuotations
              ? "Create and send quotations with their own pipeline stages. List or board view — move quotations through Draft → Accepted like deals and leads."
              : "Quick setup: client, brief, then one-click standard proposal or AI from CRM. Advanced template fields stay optional. PDF, Word, and Excel are generated on download or send."
        }
        icon={<ScrollText className="h-5 w-5" aria-hidden />}
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: moduleTitle },
        ]}
        actions={
          <CrmHeaderTools
            leading={
              <>
                <CrmButton
                  variant="secondary"
                  onClick={() => setBlocksDialogOpen(true)}
                  leftIcon={<Blocks className="h-4 w-4" />}
                >
                  Content library
                </CrmButton>
                <CrmButton
                  variant="secondary"
                  onClick={() => setBrandingDialogOpen(true)}
                  leftIcon={<Palette className="h-4 w-4" />}
                >
                  Branding
                </CrmButton>
                <CrmButton
                  variant="primary"
                  onClick={() => openNew(lockedKind)}
                  leftIcon={<Plus className="h-4 w-4" />}
                >
                  New {moduleNounSingular}
                </CrmButton>
              </>
            }
          />
        }
      />

      <div
        className={`${HS_PANEL} flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-3`}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--primary-muted)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, client…"
            className="h-10 pl-9 rounded-md border-[var(--border-color)]"
          />
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
          {pipelines.length > 0 ? (
            <Dropdown
              value={pipelineFilter || "__all__"}
              onChange={(v) => setPipelineFilter(v === "__all__" ? "" : v)}
              options={[
                { value: "__all__", label: "All pipelines" },
                ...pipelines.map((p) => ({
                  value: p._id,
                  label: p.name || "Pipeline",
                })),
              ]}
            />
          ) : null}
          <div className="inline-flex h-10 rounded-md border border-[var(--border-color)] bg-white p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 text-xs font-semibold ${
                viewMode === "list"
                  ? "bg-[var(--primary)] text-white"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-dim)]"
              }`}
              title="List view"
            >
              <LayoutList className="h-3.5 w-3.5" />
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode("board")}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 text-xs font-semibold ${
                viewMode === "board"
                  ? "bg-[var(--primary)] text-white"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-dim)]"
              }`}
              title="Pipeline board"
            >
              <Columns3 className="h-3.5 w-3.5" />
              Board
            </button>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full shrink-0 rounded-md border-[var(--border-color)] font-semibold text-[var(--text-main)] hover:bg-[var(--background)] sm:w-auto"
            onClick={() => void fetchRows()}
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className={`${HS_PANEL} overflow-hidden ${viewMode === "board" ? "p-3" : ""}`}>
        {loading ? (
          <div className="flex items-center justify-center py-20 text-[var(--primary-muted)] gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--primary-muted)]">
            {`No ${moduleNounPlural} yet. Create a ${moduleNounSingular} from a template or start blank.`}
          </div>
        ) : viewMode === "board" ? (
          <ProposalPipelineBoard
            stages={activeStages}
            rows={rows}
            movingId={movingStageId}
            entityLabel={moduleNounSingular}
            settingsPipelinesLabel={`${moduleTitle.slice(0, -1)} Pipelines`}
            onOpen={(row) => openEdit(row as ProposalRow)}
            onMoveStage={(row, stage) => void moveProposalStage(row as ProposalRow, stage)}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="crm-table w-full">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Stage</th>
                  <th>Client</th>
                  {isContracts ? <th>Value</th> : null}
                  <th>Updated</th>
                  <th className="crm-table-actions text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id}>
                    <td><span className="crm-list-name">{r.title}</span></td>
                    <td>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadge(r.status)}`}
                      >
                        {r.stage || r.status}
                      </span>
                    </td>
                    <td>
                      <div>{r.clientName || "—"}</div>
                      {r.clientEmail ? (
                        <div className="text-xs text-[var(--primary-muted)]">{r.clientEmail}</div>
                      ) : null}
                    </td>
                    {isContracts ? (
                      <td>
                        {typeof r.totalAmount === "number"
                          ? `${r.currency || "INR"} ${r.totalAmount.toLocaleString()}`
                          : "—"}
                      </td>
                    ) : null}
                    <td>
                      {r.updatedAt ? new Date(r.updatedAt).toLocaleString() : "—"}
                    </td>
                    <td className="crm-table-actions">
                      <div className="flex items-center justify-end gap-0.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 shrink-0 p-0 text-[var(--text-muted)]"
                              title="Download PDF, Word, or Excel"
                              disabled={
                                exportingKey != null && exportingKey.startsWith(`${r._id}:`)
                              }
                            >
                              {exportingKey != null && exportingKey.startsWith(`${r._id}:`) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52 rounded-md">
                            <DropdownMenuItem
                              className="cursor-pointer gap-2"
                              onClick={() => void downloadExport(r._id, "pdf", r.title)}
                              disabled={
                                exportingKey != null && exportingKey.startsWith(`${r._id}:`)
                              }
                            >
                              <Download className="h-4 w-4 text-[var(--hs-link)]" />
                              Download as PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer gap-2"
                              onClick={() => void downloadExport(r._id, "docx", r.title)}
                              disabled={
                                exportingKey != null && exportingKey.startsWith(`${r._id}:`)
                              }
                            >
                              <FileType className="h-4 w-4 text-[var(--text-main)]" />
                              Download as Word (.docx)
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer gap-2"
                              onClick={() => void downloadExport(r._id, "xlsx", r.title)}
                              disabled={
                                exportingKey != null && exportingKey.startsWith(`${r._id}:`)
                              }
                            >
                              <FileSpreadsheet className="h-4 w-4 text-[#217346]" />
                              Download as Excel (.xlsx)
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 p-0 text-[var(--hs-link)]"
                          onClick={() => openEdit(r)}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 p-0 text-rose-600"
                          onClick={() => setDeleteId(r._id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[min(56rem,calc(100vw-2rem))] max-h-[90vh] flex flex-col rounded-md border-[var(--border-color)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--text-main)]">
              {editingId
                ? "Edit document"
                : draft.kind === "quotation"
                  ? "New quotation"
                  : draft.kind === "contract"
                    ? "New contract"
                    : "New proposal"}
            </DialogTitle>
            <DialogDescription className="text-[var(--primary-muted)]">
              {composeStep === "quick" && !editingId ? (
                <>
                  Step 1 — client and how to build. Step 2 — edit the document. Advanced template fields stay
                  optional.
                </>
              ) : draft.kind === "contract" ? (
                <>
                  Edit your contract in the editor. Use advanced options for AI re-draft or legal review before
                  signing.
                </>
              ) : (
                <>Edit your proposal in the editor. Download PDF or Word after saving.</>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-1">
            {composeStep === "quick" && !editingId ? (
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)]">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--hs-link)] text-white">
                    1
                  </span>
                  Quick setup
                  <ChevronRight className="h-3.5 w-3.5" />
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border-color)] bg-white text-[var(--text-muted)]">
                    2
                  </span>
                  Edit &amp; save
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-[var(--text-main)]">Client name</Label>
                    <Input
                      value={draft.clientName || ""}
                      onChange={(e) => setDraft((d) => ({ ...d, clientName: e.target.value }))}
                      className="rounded-md border-[var(--border-color)]"
                      placeholder="Acme Inc"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[var(--text-main)]">Client email</Label>
                    <Input
                      type="email"
                      value={draft.clientEmail || ""}
                      onChange={(e) => setDraft((d) => ({ ...d, clientEmail: e.target.value }))}
                      className="rounded-md border-[var(--border-color)]"
                      placeholder="client@company.com"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="text-[var(--text-main)]">Document title</Label>
                    <Input
                      value={draft.title}
                      onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                      className="rounded-md border-[var(--border-color)]"
                      placeholder={
                        draft.kind === "quotation"
                          ? "e.g. Website redesign — quotation"
                          : draft.kind === "contract"
                            ? "e.g. Master service agreement"
                            : "e.g. Mobile app — project proposal"
                      }
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="text-[var(--text-main)]">Brief (optional)</Label>
                    <textarea
                      value={aiClientNeeds}
                      onChange={(e) => setAiClientNeeds(e.target.value)}
                      placeholder="What they need, timeline, budget, key features… Used for AI and standard templates."
                      className="min-h-[88px] w-full rounded-md border border-[var(--border-color)] bg-white p-3 text-sm"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {draft.kind === "contract" ? (
                    <button
                      type="button"
                      disabled={aiDrafting || !aiSourceEntityId}
                      onClick={() => void draftWithAi()}
                      className="flex flex-col items-start gap-2 rounded-lg border-2 border-[var(--hs-link)] bg-[#f0fbfc] p-4 text-left transition hover:bg-[#e6f4f7] disabled:opacity-50"
                    >
                      <Wand2 className="h-5 w-5 text-[var(--hs-link)]" />
                      <span className="text-sm font-semibold text-[var(--text-main)]">AI contract</span>
                      <span className="text-xs text-[var(--text-muted)]">
                        From a linked CRM record. Legal review required.
                      </span>
                    </button>
                  ) : draft.kind === "quotation" ? (
                    <button
                      type="button"
                      onClick={() => quickApplyQuotationTemplate()}
                      className="flex flex-col items-start gap-2 rounded-lg border-2 border-[var(--hs-link)] bg-[#f0fbfc] p-4 text-left transition hover:bg-[#e6f4f7] sm:col-span-3"
                    >
                      <FileText className="h-5 w-5 text-[var(--hs-link)]" />
                      <span className="text-sm font-semibold text-[var(--text-main)]">Quotation template</span>
                      <span className="text-xs text-[var(--text-muted)]">
                        Line items and total — edit amounts in the editor.
                      </span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={aiDrafting || !aiSourceEntityId}
                        onClick={() => void draftWithAi()}
                        className="flex flex-col items-start gap-2 rounded-lg border-2 border-[var(--hs-link)] bg-[#f0fbfc] p-4 text-left transition hover:bg-[#e6f4f7] disabled:opacity-50"
                      >
                        <Wand2 className="h-5 w-5 text-[var(--hs-link)]" />
                        <span className="text-sm font-semibold text-[var(--text-main)]">Draft with AI</span>
                        <span className="text-xs text-[var(--text-muted)]">
                          {aiSourceEntityId
                            ? "Uses CRM context + your brief."
                            : "Link a CRM record below first."}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => quickApplyStandardTemplate()}
                        className="flex flex-col items-start gap-2 rounded-lg border border-[var(--border-color)] bg-white p-4 text-left shadow-sm transition hover:border-[var(--hs-link)]/40"
                      >
                        <Sparkles className="h-5 w-5 text-[var(--hs-link)]" />
                        <span className="text-sm font-semibold text-[var(--text-main)]">Standard proposal</span>
                        <span className="text-xs text-[var(--text-muted)]">
                          2Bigha IT layout with default pricing tiers.
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => quickStartBlank()}
                        className="flex flex-col items-start gap-2 rounded-lg border border-[var(--border-color)] bg-white p-4 text-left shadow-sm transition hover:border-[var(--hs-link)]/40"
                      >
                        <Pencil className="h-5 w-5 text-[var(--text-muted)]" />
                        <span className="text-sm font-semibold text-[var(--text-main)]">Start blank</span>
                        <span className="text-xs text-[var(--text-muted)]">Empty editor — write from scratch.</span>
                      </button>
                    </>
                  )}
                </div>

                {draft.kind !== "quotation" ? (
                  <div className="rounded-md border border-[var(--border-color)] bg-white p-3 space-y-3">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between text-sm font-semibold text-[var(--text-main)]"
                      onClick={() => setShowCrmLinkOnQuick((v) => !v)}
                    >
                      Link CRM record {aiSourceEntityId ? "(linked)" : "(optional, for AI)"}
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${showCrmLinkOnQuick ? "rotate-180" : ""}`}
                      />
                    </button>
                    {showCrmLinkOnQuick ? (
                      <div className="grid gap-2 sm:grid-cols-2 pt-1 border-t border-[var(--surface-dim)]">
                        <Select
                          value={aiSourceModule}
                          onValueChange={(v) => {
                            setAiSourceModule(v as AiSourceModule);
                            setAiSourceEntityId("");
                            setAiSourceQuery("");
                            setAiSourceResults([]);
                          }}
                        >
                          <SelectTrigger className="h-9 rounded-md border-[var(--border-color)]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="leads">Lead</SelectItem>
                            <SelectItem value="contacts">Contact</SelectItem>
                            <SelectItem value="deals">Deal</SelectItem>
                            <SelectItem value="platform-opportunities">Platform opportunity</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="relative">
                          <Input
                            value={aiSourceQuery}
                            onChange={(e) => {
                              setAiSourceQuery(e.target.value);
                              setAiSourceOpen(true);
                              if (!e.target.value.trim()) setAiSourceEntityId("");
                            }}
                            onFocus={() => setAiSourceOpen(true)}
                            placeholder="Search name or email…"
                            className="h-9 rounded-md border-[var(--border-color)]"
                          />
                          {aiSourceOpen && aiSourceResults.length > 0 ? (
                            <div className="absolute z-30 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-[var(--border-color)] bg-white shadow-md">
                              {aiSourceResults.map((row) => (
                                <button
                                  key={row._id}
                                  type="button"
                                  className="block w-full px-2 py-2 text-left text-xs hover:bg-[var(--background)]"
                                  onClick={() => {
                                    setAiSourceEntityId(row._id);
                                    setAiSourceQuery(aiSourceLabel(row, aiSourceModule));
                                    setAiSourceOpen(false);
                                    if (!draft.clientName && row.firstName) {
                                      setDraft((d) => ({
                                        ...d,
                                        clientName:
                                          `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() ||
                                          d.clientName,
                                        clientEmail: row.email?.trim() || d.clientEmail,
                                      }));
                                    }
                                  }}
                                >
                                  {aiSourceLabel(row, aiSourceModule)}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-md"
                    onClick={() => {
                      setShowAdvancedCompose(true);
                      goToEditor();
                    }}
                  >
                    Skip to editor
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {!editingId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 -mt-1 px-2 text-[var(--hs-link)]"
                    onClick={() => setComposeStep("quick")}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Back to quick setup
                  </Button>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2 rounded-md border border-[var(--border-color)] bg-[#f8fafc] p-3">
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs text-[var(--text-muted)]">Title</Label>
                    <Input
                      value={draft.title}
                      onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                      className="rounded-md border-[var(--border-color)] bg-white font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-[var(--text-muted)]">Client</Label>
                    <Input
                      value={draft.clientName || ""}
                      onChange={(e) => setDraft((d) => ({ ...d, clientName: e.target.value }))}
                      className="rounded-md border-[var(--border-color)] bg-white h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-[var(--text-muted)]">Email</Label>
                    <Input
                      type="email"
                      value={draft.clientEmail || ""}
                      onChange={(e) => setDraft((d) => ({ ...d, clientEmail: e.target.value }))}
                      className="rounded-md border-[var(--border-color)] bg-white h-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[var(--text-main)] text-sm font-semibold">Document</Label>
                  <div className="rounded-md border border-[var(--border-color)] min-h-[320px] bg-white">
                    <RichTextEditor
                      content={draft.bodyHtml || ""}
                      onChange={(html) => setDraft((d) => ({ ...d, bodyHtml: html }))}
                      placeholder="Your proposal content…"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md border border-[var(--border-color)] bg-[var(--background)] px-3 py-2.5 text-sm font-semibold text-[var(--text-main)]"
                  onClick={() => setShowAdvancedCompose((v) => !v)}
                >
                  {showAdvancedCompose ? "Hide" : "Show"} advanced options
                  <ChevronDown
                    className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${showAdvancedCompose ? "rotate-180" : ""}`}
                  />
                </button>

                {showAdvancedCompose ? (
                  <div className="space-y-4 rounded-md border border-[var(--surface-dim)] p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label className="text-[var(--text-main)]">Kind</Label>
                        <Select
                          value={draft.kind}
                          onValueChange={(v) => setDraft((d) => ({ ...d, kind: v as DocumentKind }))}
                        >
                          <SelectTrigger className="rounded-md border-[var(--border-color)]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {isContracts ? (
                              <SelectItem value="contract">Contract</SelectItem>
                            ) : isQuotations ? (
                              <SelectItem value="quotation">Quotation</SelectItem>
                            ) : (
                              <SelectItem value="proposal">Proposal</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[var(--text-main)]">Issuer</Label>
                        <Select
                          value={draft.issuerProfile}
                          onValueChange={(v) =>
                            setDraft((d) => ({ ...d, issuerProfile: v as "agency" | "freelancer" }))
                          }
                        >
                          <SelectTrigger className="rounded-md border-[var(--border-color)]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="agency">Agency</SelectItem>
                            <SelectItem value="freelancer">Freelancer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[var(--text-main)]">Pipeline</Label>
                        <Select
                          value={draft.pipeline || activePipeline?._id || ""}
                          onValueChange={(v) => {
                            const pipe = pipelines.find((p) => p._id === v);
                            const stage =
                              pipe?.stages?.find((s) => s.isDefault)?.name ||
                              [...(pipe?.stages || [])].sort(
                                (a, b) => (a.order ?? 0) - (b.order ?? 0),
                              )[0]?.name ||
                              draft.stage;
                            setDraft((d) => ({
                              ...d,
                              pipeline: v,
                              stage: stage || d.stage,
                            }));
                          }}
                        >
                          <SelectTrigger className="rounded-md border-[var(--border-color)]">
                            <SelectValue placeholder="Select pipeline" />
                          </SelectTrigger>
                          <SelectContent>
                            {pipelines.map((p) => (
                              <SelectItem key={p._id} value={p._id}>
                                {p.name || "Pipeline"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[var(--text-main)]">Stage</Label>
                        <Select
                          value={draft.stage || ""}
                          onValueChange={(v) =>
                            setDraft((d) => ({ ...d, stage: v }))
                          }
                        >
                          <SelectTrigger className="rounded-md border-[var(--border-color)]">
                            <SelectValue placeholder="Select stage" />
                          </SelectTrigger>
                          <SelectContent>
                            {(
                              pipelines.find((p) => p._id === (draft.pipeline || activePipeline?._id))
                                ?.stages || activeStages
                            ).map((s) => (
                              <SelectItem key={s.name} value={s.name}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[var(--text-main)]">Status</Label>
                        <Select
                          value={draft.status}
                          onValueChange={(v) => setDraft((d) => ({ ...d, status: v }))}
                        >
                          <SelectTrigger className="rounded-md border-[var(--border-color)]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="sent">Sent</SelectItem>
                            <SelectItem value="accepted">
                              {isContracts ? "Signed" : "Accepted"}
                            </SelectItem>
                            <SelectItem value="declined">Declined</SelectItem>
                            <SelectItem value="expired">Expired</SelectItem>
                            <SelectItem value="archived">Archived</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[var(--text-main)]">Email subject</Label>
                      <Input
                        value={draft.subject || ""}
                        onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                        className="rounded-md border-[var(--border-color)]"
                        placeholder="Proposal: …"
                      />
                    </div>

            <div className="rounded-md border border-[var(--surface-dim)] bg-[var(--background)] p-4 space-y-3">
              <p className="text-sm font-semibold text-[var(--text-main)]">Template assistant</p>
              <div className="rounded-md border border-[var(--border-color)] bg-white p-3 space-y-3">
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-semibold text-[var(--text-main)]">
                    {draft.kind === "contract" ? "AI contract drafting" : "AI proposal drafting"}
                  </p>
                  <p className="text-xs text-[var(--primary-muted)]">
                    {draft.kind === "contract" ? (
                      <>
                        Generate a service agreement from CRM context using your{" "}
                        <Link href="/crm/settings/ai-contract" className="text-[var(--hs-link)] underline">
                          AI contract maker
                        </Link>{" "}
                        settings (agency or freelancer).
                      </>
                    ) : (
                      <>
                        Generate a styled proposal from lead/contact context using your{" "}
                        <Link href="/crm/settings/ai-proposal" className="text-[var(--hs-link)] underline">
                          AI proposal drafter
                        </Link>{" "}
                        settings (agency or freelancer profile).
                      </>
                    )}
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-[var(--text-muted)]">Source module</Label>
                    <Select
                      value={aiSourceModule}
                      onValueChange={(v) => {
                        setAiSourceModule(v as AiSourceModule);
                        setAiSourceEntityId("");
                        setAiSourceQuery("");
                        setAiSourceResults([]);
                        setAiSourceOpen(false);
                      }}
                    >
                      <SelectTrigger className="h-9 rounded-md border-[var(--border-color)]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="leads">Lead</SelectItem>
                        <SelectItem value="contacts">Contact</SelectItem>
                        <SelectItem value="deals">Deal</SelectItem>
                        <SelectItem value="platform-opportunities">Platform opportunity</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-[var(--text-muted)]">
                      {aiSourceModule === "leads"
                        ? "Search lead"
                        : aiSourceModule === "contacts"
                          ? "Search contact"
                          : aiSourceModule === "deals"
                            ? "Search deal"
                            : "Search platform opportunity"}
                    </Label>
                    <div className="relative">
                      <Input
                        value={aiSourceQuery}
                        onChange={(e) => {
                          setAiSourceQuery(e.target.value);
                          setAiSourceOpen(true);
                          if (!e.target.value.trim()) setAiSourceEntityId("");
                        }}
                        onFocus={() => setAiSourceOpen(true)}
                        placeholder={
                          aiSourceModule === "deals" ||
                          aiSourceModule === "platform-opportunities"
                            ? "Type title or keywords…"
                            : "Type name or email…"
                        }
                        className="h-9 rounded-md border-[var(--border-color)]"
                      />
                      {aiSourceLoading ? (
                        <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-[var(--primary-muted)]" />
                      ) : null}
                      {aiSourceOpen &&
                        (aiSourceResults.length > 0 || aiSourceQuery.trim().length > 0) && (
                          <div className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-[var(--border-color)] bg-white shadow-md">
                            {aiSourceResults.length === 0 ? (
                              <div className="px-2 py-2 text-xs text-[var(--primary-muted)]">No matches</div>
                            ) : (
                              aiSourceResults.map((row) => (
                                <button
                                  key={row._id}
                                  type="button"
                                  className="block w-full border-b border-[#f1f3f5] px-2 py-2 text-left text-xs text-[var(--text-main)] hover:bg-[var(--background)]"
                                  onClick={() => {
                                    setAiSourceEntityId(row._id);
                                    setAiSourceQuery(aiSourceLabel(row, aiSourceModule));
                                    setAiSourceOpen(false);
                                    if (aiSourceModule === "platform-opportunities") {
                                      const parts = [
                                        row.notes?.trim(),
                                        row.sourceMetadata?.description?.trim(),
                                        row.sourceMetadata?.title?.trim(),
                                      ].filter(Boolean);
                                      if (parts.length) setAiClientNeeds(parts.join("\n\n"));
                                      setDraft((d) => ({ ...d, issuerProfile: "freelancer" }));
                                    }
                                    if (aiSourceModule === "deals" && row.title) {
                                      setTplProjectTitle(row.title);
                                    }
                                  }}
                                >
                                  {aiSourceLabel(row, aiSourceModule)}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                    </div>
                    <p className="text-xs text-[var(--primary-muted)]">
                      Selected ID: {aiSourceEntityId || "None selected"}
                    </p>
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <Label className="text-xs text-[var(--text-muted)]">Client needs / scope</Label>
                    <textarea
                      value={aiClientNeeds}
                      onChange={(e) => setAiClientNeeds(e.target.value)}
                      placeholder="What client needs, deliverables, timeline, budget, constraints..."
                      className="min-h-[78px] w-full rounded-md border border-[var(--border-color)] bg-white p-2 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <Label className="text-xs text-[var(--text-muted)]">Extra AI instructions (optional)</Label>
                    <textarea
                      value={aiExtraInstructions}
                      onChange={(e) => setAiExtraInstructions(e.target.value)}
                      placeholder="Any special formatting, tone, sections, exclusions..."
                      className="min-h-[70px] w-full rounded-md border border-[var(--border-color)] bg-white p-2 text-sm"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 rounded-md bg-[var(--hs-link)] hover:bg-[#007d94]"
                    disabled={aiDrafting}
                    onClick={() => void draftWithAi()}
                  >
                    {aiDrafting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="h-4 w-4" />
                    )}
                    Draft with AI
                  </Button>
                  <p className="text-xs text-[var(--primary-muted)]">
                    Uses issuer profile selection and fills title, subject, body, and client details.
                  </p>
                </div>
              </div>
              {draft.kind === "contract" ? null : draft.kind === "proposal" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    placeholder="Project title (headline)"
                    value={tplProjectTitle}
                    onChange={(e) => setTplProjectTitle(e.target.value)}
                    className="rounded-md border-[var(--border-color)] bg-white"
                  />
                  <Input
                    placeholder="Product name (for closing line)"
                    value={tplProductName}
                    onChange={(e) => setTplProductName(e.target.value)}
                    className="rounded-md border-[var(--border-color)] bg-white"
                  />
                  <textarea
                    placeholder="Project overview (paragraphs)"
                    value={tplOverview}
                    onChange={(e) => setTplOverview(e.target.value)}
                    className="sm:col-span-2 min-h-[72px] rounded-md border border-[var(--border-color)] bg-white p-2 text-sm"
                  />
                  <textarea
                    placeholder="Scope of work (features, modules, constraints)"
                    value={tplScope}
                    onChange={(e) => setTplScope(e.target.value)}
                    className="sm:col-span-2 min-h-[96px] rounded-md border border-[var(--border-color)] bg-white p-2 text-sm"
                  />
                  <div className="sm:col-span-2 space-y-3 rounded-md border border-[var(--border-color)] bg-white p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold text-[var(--text-main)]">
                          Pricing, payment &amp; delivery milestones
                        </p>
                        <p className="text-xs text-[var(--primary-muted)]">
                          Pick a built-in template, write your own lines, or paste full HTML for section 4 only.
                        </p>
                      </div>
                      <Select
                        value={commercialsInputMode}
                        onValueChange={(v) => {
                          const mode = v as CommercialsInputMode;
                          setCommercialsInputMode(mode);
                          if (mode === "template") {
                            const preset = PRICING_MILESTONE_PRESETS.find(
                              (p) => p.id === selectedCommercialsPresetId,
                            );
                            if (preset) applyCommercialsPreset(preset);
                          }
                        }}
                      >
                        <SelectTrigger className="h-9 w-full rounded-md border-[var(--border-color)] sm:w-[280px]">
                          <SelectValue placeholder="How to fill pricing…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="template">Built-in templates</SelectItem>
                          <SelectItem value="lines">My own — line by line</SelectItem>
                          <SelectItem value="html">My own — full HTML (section 4)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {commercialsInputMode === "template" ? (
                      <div className="space-y-2">
                        <Label className="text-xs text-[var(--text-muted)]">Template</Label>
                        <Select
                          value={selectedCommercialsPresetId}
                          onValueChange={(id) => {
                            setSelectedCommercialsPresetId(id);
                            const preset = PRICING_MILESTONE_PRESETS.find((p) => p.id === id);
                            if (preset) applyCommercialsPreset(preset);
                          }}
                        >
                          <SelectTrigger className="rounded-md border-[var(--border-color)]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-h-[min(320px,50vh)]">
                            {PRICING_MILESTONE_PRESETS.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs leading-relaxed text-[var(--primary-muted)]">
                          {
                            PRICING_MILESTONE_PRESETS.find(
                              (p) => p.id === selectedCommercialsPresetId,
                            )?.description
                          }
                        </p>
                        <p className="text-xs font-medium text-[var(--hs-link)]">
                          Fields below are filled from this template — edit anything before you insert the document.
                        </p>
                      </div>
                    ) : null}
                    {commercialsInputMode === "html" ? (
                      <div className="space-y-2">
                        <Label className="text-[var(--text-main)]">
                          Section 4 HTML — commercials &amp; pricing only
                        </Label>
                        <textarea
                          placeholder={
                            "<h3>Pricing</h3><p>…</p><ul><li>…</li></ul>\n(Replaces auto-generated tiers + payment bullets; bank details still append later in the proposal.)"
                          }
                          value={tplCommercialsHtml}
                          onChange={(e) => setTplCommercialsHtml(e.target.value)}
                          className="min-h-[160px] w-full rounded-md border border-[var(--border-color)] bg-[var(--background)] p-2 text-sm font-mono text-sm"
                        />
                      </div>
                    ) : null}
                  </div>
                  {(commercialsInputMode === "template" || commercialsInputMode === "lines") && (
                    <>
                      <p className="sm:col-span-2 text-xs text-[var(--primary-muted)] font-medium uppercase tracking-wide">
                        {commercialsInputMode === "template"
                          ? "Template fields (editable)"
                          : "Your lines (optional — leave blank for defaults)"}
                      </p>
                      <textarea
                        placeholder={
                          "Commercial tiers — one per line\ne.g. Essential — ₹ 1,80,000 + GST\nStandard — ₹ 2,40,000 + GST"
                        }
                        value={tplCommercialPackages}
                        onChange={(e) => setTplCommercialPackages(e.target.value)}
                        className="sm:col-span-2 min-h-[72px] rounded-md border border-[var(--border-color)] bg-white p-2 text-sm font-mono text-sm"
                      />
                      <textarea
                        placeholder={
                          "Payment milestones — one per line\ne.g. 30% — contract sign\n40% — UAT\n30% — go-live"
                        }
                        value={tplPaymentMilestones}
                        onChange={(e) => setTplPaymentMilestones(e.target.value)}
                        className="sm:col-span-2 min-h-[72px] rounded-md border border-[var(--border-color)] bg-white p-2 text-sm font-mono text-sm"
                      />
                    </>
                  )}
                  <textarea
                    placeholder={
                      "Tech stack — one per line\ne.g. Mobile: React Native\nBackend: NestJS, MongoDB"
                    }
                    value={tplTechStackLines}
                    onChange={(e) => setTplTechStackLines(e.target.value)}
                    className="sm:col-span-2 min-h-[72px] rounded-md border border-[var(--border-color)] bg-white p-2 text-sm font-mono text-sm"
                  />
                  {(commercialsInputMode === "template" || commercialsInputMode === "lines") && (
                    <>
                      <textarea
                        placeholder={
                          "Delivery milestones — one per line (overrides short timeline below if any line is set)\ne.g. Week 1–2: Discovery & UX\nWeek 3–8: Build & QA"
                        }
                        value={tplDeliveryMilestones}
                        onChange={(e) => setTplDeliveryMilestones(e.target.value)}
                        className="sm:col-span-2 min-h-[72px] rounded-md border border-[var(--border-color)] bg-white p-2 text-sm font-mono text-sm"
                      />
                      <textarea
                        placeholder="Short timeline summary (used only if delivery milestones list is empty)"
                        value={tplTimelineNarrative}
                        onChange={(e) => setTplTimelineNarrative(e.target.value)}
                        className="sm:col-span-2 min-h-[56px] rounded-md border border-[var(--border-color)] bg-white p-2 text-sm"
                      />
                    </>
                  )}
                  <textarea
                    placeholder={
                      "Portfolio & case studies — paragraphs (blank line between stories). Or leave blank for default; use Content library to paste rich case-study HTML into the body after insert."
                    }
                    value={tplPortfolioCases}
                    onChange={(e) => setTplPortfolioCases(e.target.value)}
                    className="sm:col-span-2 min-h-[88px] rounded-md border border-[var(--border-color)] bg-white p-2 text-sm"
                  />
                </div>
              ) : draft.kind === "quotation" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    placeholder="Quotation title"
                    value={tplQuoteTitle}
                    onChange={(e) => setTplQuoteTitle(e.target.value)}
                    className="rounded-md border-[var(--border-color)] bg-white"
                  />
                  <Input
                    placeholder="Client name"
                    value={tplQuoteClient}
                    onChange={(e) => setTplQuoteClient(e.target.value)}
                    className="rounded-md border-[var(--border-color)] bg-white"
                  />
                  <textarea
                    placeholder="Line items (one per line)"
                    value={tplQuoteLines}
                    onChange={(e) => setTplQuoteLines(e.target.value)}
                    className="sm:col-span-2 min-h-[80px] rounded-md border border-[var(--border-color)] bg-white p-2 text-sm font-mono text-sm"
                  />
                  <Input
                    placeholder="Total INR (numeric part)"
                    value={tplQuoteTotal}
                    onChange={(e) => setTplQuoteTotal(e.target.value)}
                    className="rounded-md border-[var(--border-color)] bg-white"
                  />
                </div>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                {documentTemplatesForKind(draft.kind).map((o) => (
                  <Button
                    key={o.id}
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-9 w-full justify-center rounded-md text-[var(--text-main)] sm:w-auto"
                    onClick={() => applyTemplate(o.id)}
                  >
                    Insert: {o.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-[var(--surface-dim)] bg-[var(--background)] p-3 space-y-2">
              <Label className="text-[var(--text-main)] text-sm font-semibold">Reusable content</Label>
              <p className="text-xs text-[var(--primary-muted)]">
                Append a saved block from your library (portfolio, payment terms, legal snippets, etc.). Manage blocks with{" "}
                <button
                  type="button"
                  className="text-[var(--hs-link)] font-semibold underline-offset-2 hover:underline"
                  onClick={() => {
                    setBlocksDialogOpen(true);
                  }}
                >
                  Content library
                </button>
                .
              </p>
              <Select
                key={insertBlockSelectKey}
                defaultValue="__none__"
                onValueChange={(id) => {
                  if (id === "__none__") return;
                  const b = insertBlocks.find((x) => x._id === id);
                  if (b) {
                    setDraft((d) => ({
                      ...d,
                      bodyHtml: appendBlockToBody(d.bodyHtml || "", b),
                    }));
                    toast.success(`Inserted “${b.name}”`);
                  }
                  setInsertBlockSelectKey((k) => k + 1);
                }}
              >
                <SelectTrigger className="rounded-md border-[var(--border-color)] bg-white max-w-md">
                  <SelectValue placeholder="Insert reusable block…" />
                </SelectTrigger>
                <SelectContent className="max-h-[min(280px,50vh)]">
                  <SelectItem value="__none__">Choose a block…</SelectItem>
                  {insertBlocks.map((b) => (
                    <SelectItem key={b._id} value={b._id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
                  </div>
                ) : null}
              </>
            )}
          </div>

          <DialogFooter className="border-t border-[var(--surface-dim)] pt-4 !flex !flex-col-reverse gap-2 sm:!flex-row sm:!flex-nowrap sm:items-center sm:justify-end sm:gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full rounded-md sm:w-auto"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            {composeStep === "editor" || editingId ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full rounded-md border-[var(--hs-link)] text-[var(--hs-link)] sm:w-auto"
                  onClick={() => void sendEmail()}
                >
                  <Mail className="h-4 w-4 shrink-0" />
                  Send email…
                </Button>
                <Button
                  type="button"
                  className="h-10 w-full rounded-md bg-[var(--hs-link)] hover:bg-[#e86a4d] sm:w-auto"
                  disabled={saving}
                  onClick={() => void saveDraft()}
                >
                  {saving ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : null}
                  {editingId ? "Save changes" : "Save to CRM"}
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProposalBrandingDialog
        open={brandingDialogOpen}
        onOpenChange={setBrandingDialogOpen}
        crmApiUrl={CRM_API_URL}
        authHeaders={authHeaders}
      />
      <ProposalBlocksManagerDialog
        open={blocksDialogOpen}
        onOpenChange={setBlocksDialogOpen}
        crmApiUrl={CRM_API_URL}
        authHeaders={authHeaders}
        onChanged={() => void loadInsertBlocks()}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="rounded-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-md">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-md bg-rose-600" onClick={() => void confirmDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

