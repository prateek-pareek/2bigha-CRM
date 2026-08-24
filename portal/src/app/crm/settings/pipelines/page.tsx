"use client";

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { GitBranch, Plus, Trash2, CheckCircle2, Loader2, Save, ChevronLeft, Users, Pencil, ChevronDown, GripVertical, ScrollText, FileText } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CRM_API_URL } from '@/lib/crm/config';
import CrmSlidePanelShell from '@/components/crm/shell/CrmSlidePanelShell';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const LBL = "block text-xs font-semibold text-[var(--text-muted)] mb-1";
const INP = "w-full h-9 bg-white border border-[var(--border-color)] rounded-md px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--primary-muted)] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all";

interface Stage {
  id?: string;
  name: string;
  probability: number;
  order: number;
  isDefault: boolean;
}

type PipelineOutreachAiContext = {
  useGlobalSettings?: boolean;
  businessSummary?: string;
  servicesOffered?: string;
  idealClientProfile?: string;
  tonePreset?: 'consultative' | 'direct' | 'warm' | 'formal';
  mustMention?: string;
  avoidSaying?: string;
  additionalContext?: string;
  aiInstructions?: string;
  requiredContextFields?: string[];
  missingContextAction?: 'skip' | 'draft_anyway' | 'create_task';
  missingContextTaskTitle?: string;
};

interface Pipeline {
  _id: string;
  name: string;
  type?: 'leads' | 'proposals' | 'contracts';
  categoryType?: 'it_consulting' | 'freelancer';
  /** Only meaningful when type === 'leads': Property Listing vs Property Management. */
  leadVertical?: 'property_listing' | 'property_management';
  stages: Stage[];
  isDefault: boolean;
  outreachAiContext?: PipelineOutreachAiContext;
}

const LEAD_VERTICAL_OPTIONS = [
  { value: 'property_listing', label: 'Property Listing' },
  { value: 'property_management', label: 'Property Management' },
] as const;

const OUTREACH_CONTEXT_FIELDS: { key: string; label: string }[] = [
  { key: 'firstName', label: 'First name' },
  { key: 'organization', label: 'Company' },
  { key: 'jobTitle', label: 'Job title' },
  { key: 'industry', label: 'Industry' },
  { key: 'customFields.requirements', label: 'Requirements' },
];

const PIPELINE_CATEGORY_OPTIONS = [
  { value: 'it_consulting', label: 'IT Consulting' },
  { value: 'freelancer', label: 'Freelancer' },
] as const;

interface SortableStageRowProps {
  id: string;
  index: number;
  stage: Stage;
  onNameChange: (name: string) => void;
  onProbChange: (prob: number) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function SortableStageRow({
  id,
  index,
  stage,
  onNameChange,
  onProbChange,
  onRemove,
  canRemove,
}: SortableStageRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 0,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 bg-white ${isDragging ? 'shadow-lg border-[var(--hs-link)]' : ''}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="w-6 h-8 flex items-center justify-center text-[var(--primary-muted)] hover:text-[var(--text-muted)] cursor-grab active:cursor-grabbing shrink-0"
      >
        <GripVertical size={14} />
      </div>
      <div className="w-6 h-6 rounded-md bg-[var(--surface-dim)] flex items-center justify-center text-xs font-semibold text-[var(--primary-muted)] shrink-0">
        {index + 1}
      </div>
      <input
        type="text"
        placeholder="Stage name"
        className="flex-1 h-8 bg-white border border-[var(--border-color)] rounded-md px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--primary-muted)] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all"
        value={stage.name}
        onChange={(e) => onNameChange(e.target.value)}
      />
      <input
        type="text"
        inputMode="numeric"
        placeholder="0"
        className="w-20 h-8 bg-white border border-[var(--border-color)] rounded-md px-2 text-sm text-[var(--text-main)] text-center outline-none placeholder:text-[var(--primary-muted)] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all"
        value={stage.probability}
        onChange={(e) => {
          const v = parseInt(e.target.value.replace(/\D/g, ''), 10);
          onProbChange(isNaN(v) ? 0 : Math.min(100, v));
        }}
      />
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        className="w-7 h-7 flex items-center justify-center text-[var(--primary-muted)] hover:text-rose-500 hover:bg-rose-50 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export default function PipelinesManagementPage() {
  const [activeTab, setActiveTab] = useState<'leads' | 'proposals' | 'contracts'>('leads');
  const [leadsPipelines, setLeadsPipelines] = useState<Pipeline[]>([]);
  const [proposalPipelines, setProposalPipelines] = useState<Pipeline[]>([]);
  const [contractPipelines, setContractPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPipeline, setEditingPipeline] = useState<Pipeline | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Pipeline | null>(null);
  const [newPipeline, setNewPipeline] = useState<{
    name: string;
    type: 'leads' | 'proposals' | 'contracts';
    categoryType: 'it_consulting' | 'freelancer';
    leadVertical?: 'property_listing' | 'property_management';
    stages: Stage[];
    outreachAiContext?: PipelineOutreachAiContext;
  }>({
    name: '',
    type: 'leads' as 'leads' | 'proposals' | 'contracts',
    categoryType: 'it_consulting',
    leadVertical: 'property_listing',
    outreachAiContext: { useGlobalSettings: true, missingContextAction: 'draft_anyway' },
    stages: [
      { id: 'init-1', name: 'Qualification', probability: 10, order: 1, isDefault: true },
      { id: 'init-2', name: 'Proposal', probability: 50, order: 2, isDefault: false },
      { id: 'init-3', name: 'Closed Won', probability: 100, order: 3, isDefault: false },
    ]
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = newPipeline.stages.findIndex((s) => s.id === active.id);
      const newIndex = newPipeline.stages.findIndex((s) => s.id === over.id);

      const rearranged = arrayMove(newPipeline.stages, oldIndex, newIndex).map(
        (stage, idx) => ({ ...stage, order: idx + 1 })
      );

      setNewPipeline({
        ...newPipeline,
        stages: rearranged,
      });
    }
  };

  const handleAddStage = () => {
    const nextOrder = newPipeline.stages.length + 1;
    setNewPipeline({
      ...newPipeline,
      stages: [
        ...newPipeline.stages,
        {
          id: Math.random().toString(36).substr(2, 9),
          name: '',
          probability: 0,
          order: nextOrder,
          isDefault: false
        }
      ]
    });
  };

  const pipelines =
    activeTab === 'leads'
      ? leadsPipelines
      : activeTab === 'proposals'
        ? proposalPipelines
        : contractPipelines;

  const fetchPipelines = async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    try {
      const [leadsRes, proposalsRes, contractsRes] = await Promise.all([
        fetch(`${CRM_API_URL}/crm/pipelines?type=leads`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${CRM_API_URL}/crm/pipelines?type=proposals`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${CRM_API_URL}/crm/pipelines?type=contracts`, { headers: { 'Authorization': `Bearer ${token}` } }),
      ]);
      if (leadsRes.ok) setLeadsPipelines(await leadsRes.json());
      if (proposalsRes.ok) setProposalPipelines(await proposalsRes.json());
      if (contractsRes.ok) setContractPipelines(await contractsRes.json());
    } catch (err) {
      console.error('Failed to fetch pipelines:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPipelines();
  }, []);


  const handleSave = async () => {
    if (!newPipeline.name.trim()) {
      toast.error('Please enter a pipeline name');
      return;
    }
    if (newPipeline.stages.some(s => !s.name.trim())) {
      toast.error('All stages must have a name');
      return;
    }
    setSaving(true);
    const token = localStorage.getItem('token');
    try {
      const isEditing = !!editingPipeline;
      const url = isEditing
        ? `${CRM_API_URL}/crm/pipelines/${editingPipeline!._id}`
        : `${CRM_API_URL}/crm/pipelines`;
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ...newPipeline, type: activeTab })
      });
      if (res.ok) {
        toast.success(isEditing ? 'Pipeline updated!' : 'Pipeline created!');
        closeModal();
        fetchPipelines();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || 'Failed to save pipeline');
      }
    } catch (err) {
      console.error('Failed to save pipeline:', err);
      toast.error('An error occurred while saving');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (pipeline: Pipeline) => {
    setDeletingId(pipeline._id);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/pipelines/${pipeline._id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('Pipeline deleted');
        fetchPipelines();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || 'Failed to delete pipeline');
      }
    } catch (err) {
      toast.error('An error occurred while deleting');
    } finally {
      setDeletingId(null);
      setShowDeleteConfirm(null);
    }
  };

  const openCreate = () => {
    setEditingPipeline(null);
    setNewPipeline({
      name: '',
      type: activeTab,
      categoryType: 'it_consulting',
      leadVertical: activeTab === 'leads' ? 'property_listing' : undefined,
      stages:
        activeTab === 'leads'
          ? [
              { id: 'l1', name: 'New', probability: 5, order: 1, isDefault: true },
              { id: 'l2', name: 'Contacted', probability: 15, order: 2, isDefault: false },
              { id: 'l3', name: 'Qualified', probability: 40, order: 3, isDefault: false },
              { id: 'l4', name: 'Converted', probability: 100, order: 4, isDefault: false },
            ]
          : activeTab === 'proposals'
              ? [
                  { id: 'pr1', name: 'Draft', probability: 10, order: 1, isDefault: true },
                  { id: 'pr2', name: 'Internal Review', probability: 25, order: 2, isDefault: false },
                  { id: 'pr3', name: 'Sent', probability: 45, order: 3, isDefault: false },
                  { id: 'pr4', name: 'Negotiation', probability: 65, order: 4, isDefault: false },
                  { id: 'pr5', name: 'Accepted', probability: 100, order: 5, isDefault: false },
                  { id: 'pr6', name: 'Declined', probability: 0, order: 6, isDefault: false },
                ]
              : [
                  { id: 'c1', name: 'Draft', probability: 10, order: 1, isDefault: true },
                  { id: 'c2', name: 'Internal Review', probability: 25, order: 2, isDefault: false },
                  { id: 'c3', name: 'Sent', probability: 45, order: 3, isDefault: false },
                  { id: 'c4', name: 'Awaiting Signature', probability: 60, order: 4, isDefault: false },
                  { id: 'c5', name: 'Negotiation', probability: 70, order: 5, isDefault: false },
                  { id: 'c6', name: 'Signed', probability: 100, order: 6, isDefault: false },
                  { id: 'c7', name: 'Declined', probability: 0, order: 7, isDefault: false },
                  { id: 'c8', name: 'Expired', probability: 0, order: 8, isDefault: false },
                ],
    });
    setIsModalOpen(true);
  };

  const openEdit = (pipeline: Pipeline) => {
    setEditingPipeline(pipeline);
    setNewPipeline({
      name: pipeline.name,
      type: pipeline.type || activeTab,
      categoryType: pipeline.categoryType || 'it_consulting',
      leadVertical:
        (pipeline.type || activeTab) === 'leads'
          ? pipeline.leadVertical || 'property_listing'
          : undefined,
      outreachAiContext: pipeline.outreachAiContext || {
        useGlobalSettings: true,
        missingContextAction: 'draft_anyway',
      },
      stages: pipeline.stages
        .map(s => ({ ...s, id: (s as any)._id || Math.random().toString(36).substr(2, 9) }))
        .sort((a, b) => a.order - b.order),
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingPipeline(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/crm/settings"
            className="p-1.5 hover:bg-[var(--background)] rounded-md transition-colors border border-transparent hover:border-[var(--surface-dim)]"
          >
            <ChevronLeft size={18} className="text-[var(--primary-muted)]" />
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#fff3f0] border border-[#ffd6cc] flex items-center justify-center">
              <GitBranch size={16} className="text-[var(--hs-link)]" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-[var(--text-main)] leading-tight">Pipelines</h1>
              <p className="text-xs text-[var(--primary-muted)]">Design custom workflows for leads, proposals, and contracts.</p>
            </div>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--hs-link)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[var(--hs-link-hover)] transition-colors"
        >
          <Plus size={14} />
          Create Pipeline
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-[var(--surface-dim)]">
        {([
          { id: 'leads' as const, label: 'Lead Pipelines', icon: Users },
          { id: 'proposals' as const, label: 'Proposal Pipelines', icon: ScrollText },
          { id: 'contracts' as const, label: 'Contract Pipelines', icon: FileText },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setActiveTab(id); setNewPipeline(prev => ({ ...prev, type: id })); }}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === id
                ? 'border-[var(--hs-link)] text-[var(--hs-link)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-[var(--primary-muted)]" />
        </div>
      ) : pipelines.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--border-color)] bg-[var(--background)] px-6 py-20 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-md bg-[#fff3f0] text-[var(--hs-link)]">
            <GitBranch size={24} />
          </div>
          <p className="text-sm font-semibold text-[var(--text-main)]">No pipelines yet</p>
          <p className="mt-1 text-sm text-[var(--primary-muted)]">
            Create your first{' '}
            {activeTab === 'leads'
              ? 'lead'
              : activeTab === 'proposals'
                ? 'proposal'
                : 'contract'}{' '}
            pipeline to get started.
          </p>
          <button
            onClick={openCreate}
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-[var(--hs-link)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--hs-link-hover)] transition-colors"
          >
            <Plus size={14} /> Create Pipeline
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {pipelines.map(pipeline => (
            <div key={pipeline._id} className="bg-white border border-[var(--surface-dim)] rounded-md overflow-hidden shadow-sm hover:shadow-md hover:border-[var(--hs-link)]/30 transition-all group">
              {/* Card header */}
              <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--surface-dim)] bg-[var(--surface-dim)]">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-[var(--text-main)]">{pipeline.name}</h2>
                    {pipeline.isDefault && (
                      <span className="px-2 py-0.5 rounded-md text-xs font-semibold text-[var(--hs-link)] bg-[#e5f5f8] border border-[#b3e0ea]">
                        Default
                      </span>
                    )}
                    {activeTab === 'leads' && (
                      <span className="px-2 py-0.5 rounded-md text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200">
                        {pipeline.leadVertical === 'property_management' ? 'Property Management' : 'Property Listing'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--primary-muted)] mt-0.5">{pipeline.stages.length} stages</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Context: {PIPELINE_CATEGORY_OPTIONS.find((o) => o.value === (pipeline.categoryType || 'it_consulting'))?.label || 'IT Consulting'}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(pipeline)}
                    className="p-1.5 text-[var(--primary-muted)] hover:text-[var(--text-muted)] hover:bg-[var(--background)] rounded-md transition-colors"
                    title="Edit pipeline"
                  >
                    <Pencil size={14} />
                  </button>
                  {showDeleteConfirm?._id === pipeline._id ? (
                    <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-md px-2 py-1">
                      <span className="text-xs text-rose-600 font-semibold">Delete?</span>
                      <button
                        onClick={() => handleDelete(pipeline)}
                        disabled={deletingId === pipeline._id}
                        className="text-xs font-semibold text-rose-600 hover:text-rose-800"
                      >
                        {deletingId === pipeline._id ? <Loader2 size={12} className="animate-spin" /> : 'Yes'}
                      </button>
                      <button onClick={() => setShowDeleteConfirm(null)} className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)]">No</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowDeleteConfirm(pipeline)}
                      className="p-1.5 text-[var(--primary-muted)] hover:text-rose-500 hover:bg-rose-50 rounded-md transition-colors"
                      title="Delete pipeline"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Stages */}
              <div className="divide-y divide-[var(--surface-dim)]">
                {pipeline.stages.sort((a, b) => a.order - b.order).map((stage, idx) => (
                  <div key={idx} className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--background)] transition-colors">
                    <div className="w-6 h-6 rounded-md bg-[var(--surface-dim)] flex items-center justify-center text-xs font-semibold text-[var(--primary-muted)] shrink-0">
                      {stage.order}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-main)] truncate">{stage.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--primary-muted)]">{stage.probability}%</span>
                      {stage.isDefault && <CheckCircle2 size={14} className="text-emerald-500" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Slide panel */}
      {isModalOpen && typeof document !== 'undefined' && createPortal(
        <CrmSlidePanelShell
          isOpen={isModalOpen}
          onClose={closeModal}
          title={editingPipeline ? 'Edit Pipeline' : 'Create Pipeline'}
          subtitle={editingPipeline
            ? `Editing stages for "${editingPipeline.name}"`
            : `New ${activeTab === 'leads' ? 'lead' : activeTab} pipeline`}
          headerTone="hubspot"
          footer={
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[var(--hs-link)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--hs-link-hover)] transition-colors shadow-sm disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Saving…' : (editingPipeline ? 'Update Pipeline' : 'Create Pipeline')}
              </button>
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex items-center justify-center rounded-md border border-[var(--border-color)] bg-white px-5 py-2.5 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--background)] transition-colors"
              >
                Cancel
              </button>
            </div>
          }
        >
          <div className="space-y-5">
            {/* Pipeline name */}
            <div>
              <label className={LBL}>Pipeline name <span className="text-[#f2545b]">*</span></label>
              <input
                type="text"
                autoFocus
                placeholder="e.g. Enterprise Sales"
                className={INP}
                value={newPipeline.name}
                onChange={(e) => setNewPipeline({ ...newPipeline, name: e.target.value })}
              />
            </div>

            <div>
              <label className={LBL}>Pipeline context</label>
              <div className="relative">
                <select
                  value={newPipeline.categoryType}
                  onChange={(e) =>
                    setNewPipeline({
                      ...newPipeline,
                      categoryType: e.target.value as
                        | 'it_consulting'
                        | 'freelancer',
                    })
                  }
                  className={INP + " appearance-none pr-9"}
                >
                  {PIPELINE_CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--primary-muted)] pointer-events-none" />
              </div>
              <p className="mt-1 text-xs text-[var(--primary-muted)]">
                AI email drafting uses this context to write as IT consulting or freelancer.
              </p>
            </div>

            {(newPipeline.type === 'leads' || activeTab === 'leads') && (
              <div>
                <label className={LBL}>Lead vertical</label>
                <div className="relative">
                  <select
                    value={newPipeline.leadVertical || 'property_listing'}
                    onChange={(e) =>
                      setNewPipeline({
                        ...newPipeline,
                        leadVertical: e.target.value as 'property_listing' | 'property_management',
                      })
                    }
                    className={INP + " appearance-none pr-9"}
                  >
                    {LEAD_VERTICAL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--primary-muted)] pointer-events-none" />
                </div>
                <p className="mt-1 text-xs text-[var(--primary-muted)]">
                  Which lead board this pipeline shows up under — Property Listing or Property Management leads use fully separate, independently-customizable pipelines.
                </p>
              </div>
            )}

            {(newPipeline.type === 'leads' || activeTab === 'leads') ? (
              <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-4 space-y-3">
                <p className="text-sm font-semibold text-violet-950">AI outreach context (this pipeline)</p>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newPipeline.outreachAiContext?.useGlobalSettings !== false}
                    onChange={(e) =>
                      setNewPipeline({
                        ...newPipeline,
                        outreachAiContext: {
                          ...newPipeline.outreachAiContext,
                          useGlobalSettings: e.target.checked,
                        },
                      })
                    }
                  />
                  Use global AI outreach settings
                </label>
                {newPipeline.outreachAiContext?.useGlobalSettings === false ? (
                  <div className="space-y-2">
                    <div>
                      <label className={LBL}>Business positioning</label>
                      <textarea
                        className={INP + " min-h-[72px] py-2"}
                        value={newPipeline.outreachAiContext?.businessSummary || ''}
                        onChange={(e) =>
                          setNewPipeline({
                            ...newPipeline,
                            outreachAiContext: {
                              ...newPipeline.outreachAiContext,
                              businessSummary: e.target.value,
                            },
                          })
                        }
                        placeholder="How you position outreach for agency vs freelancer leads in this pipeline."
                      />
                    </div>
                    <div>
                      <label className={LBL}>Services / offerings</label>
                      <textarea
                        className={INP + " min-h-[56px] py-2"}
                        value={newPipeline.outreachAiContext?.servicesOffered || ''}
                        onChange={(e) =>
                          setNewPipeline({
                            ...newPipeline,
                            outreachAiContext: {
                              ...newPipeline.outreachAiContext,
                              servicesOffered: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className={LBL}>Default AI instructions</label>
                      <textarea
                        className={INP + " min-h-[56px] py-2"}
                        value={newPipeline.outreachAiContext?.aiInstructions || ''}
                        onChange={(e) =>
                          setNewPipeline({
                            ...newPipeline,
                            outreachAiContext: {
                              ...newPipeline.outreachAiContext,
                              aiInstructions: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                ) : null}
                <div>
                  <label className={LBL}>Required context before auto-send</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {OUTREACH_CONTEXT_FIELDS.map((f) => {
                      const checked = (
                        newPipeline.outreachAiContext?.requiredContextFields || []
                      ).includes(f.key);
                      return (
                        <label key={f.key} className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const prev =
                                newPipeline.outreachAiContext?.requiredContextFields || [];
                              const requiredContextFields = checked
                                ? prev.filter((k) => k !== f.key)
                                : [...prev, f.key];
                              setNewPipeline({
                                ...newPipeline,
                                outreachAiContext: {
                                  ...newPipeline.outreachAiContext,
                                  requiredContextFields,
                                },
                              });
                            }}
                          />
                          {f.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className={LBL}>When context is missing</label>
                  <select
                    className={INP}
                    value={newPipeline.outreachAiContext?.missingContextAction || 'draft_anyway'}
                    onChange={(e) =>
                      setNewPipeline({
                        ...newPipeline,
                        outreachAiContext: {
                          ...newPipeline.outreachAiContext,
                          missingContextAction: e.target.value as PipelineOutreachAiContext['missingContextAction'],
                        },
                      })
                    }
                  >
                    <option value="draft_anyway">Draft anyway (ask in email)</option>
                    <option value="skip">Skip auto-send</option>
                    <option value="create_task">Create task for rep</option>
                  </select>
                </div>
              </div>
            ) : null}

            {/* Stages */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={LBL + " mb-0"}>Stages <span className="text-[#f2545b]">*</span></label>
                <button
                  type="button"
                  onClick={handleAddStage}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--hs-link)] hover:text-[var(--hs-link-hover)] transition-colors"
                >
                  <Plus size={13} /> Add stage
                </button>
              </div>

              {/* Column headers */}
              <div className="flex items-center gap-2 px-1 mb-1.5">
                <div className="w-6 shrink-0" />
                <span className="flex-1 text-xs font-semibold text-[var(--primary-muted)]">Stage name</span>
                <span className="w-20 text-xs font-semibold text-[var(--primary-muted)] text-center">Win %</span>
                <div className="w-7 shrink-0" />
              </div>

              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-0.5">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={newPipeline.stages.map((s) => s.id!)}
                    strategy={verticalListSortingStrategy}
                  >
                    {newPipeline.stages.map((stage, i) => (
                      <SortableStageRow
                        key={stage.id}
                        id={stage.id!}
                        index={i}
                        stage={stage}
                        onNameChange={(name) => {
                          const updated = [...newPipeline.stages];
                          updated[i] = { ...updated[i], name };
                          setNewPipeline({ ...newPipeline, stages: updated });
                        }}
                        onProbChange={(probability) => {
                          const updated = [...newPipeline.stages];
                          updated[i] = { ...updated[i], probability };
                          setNewPipeline({ ...newPipeline, stages: updated });
                        }}
                        onRemove={() => {
                          const updated = newPipeline.stages
                            .filter((_, idx) => idx !== i)
                            .map((s, idx) => ({ ...s, order: idx + 1 }));
                          setNewPipeline({ ...newPipeline, stages: updated });
                        }}
                        canRemove={newPipeline.stages.length > 1}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            </div>
          </div>
        </CrmSlidePanelShell>,
        document.body
      )}
    </div>
  );
}
