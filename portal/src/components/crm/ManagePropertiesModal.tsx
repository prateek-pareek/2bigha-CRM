"use client";

import React, { useState, useEffect } from 'react';
import { CrmJiraPortal } from '@/components/crm/CrmJiraPortal';
import { crmModalChrome } from '@/lib/pm/jira-ui';
import { X, GripVertical, Trash2, Plus, Settings2, Loader2, AlertCircle } from 'lucide-react';
import { CRM_API_URL } from '@/lib/api/config';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import CustomFieldModal from './CustomFieldModal';
import DeleteCustomFieldMergeDialog, { type CustomFieldMergeRow } from './DeleteCustomFieldMergeDialog';
import type { CrmModuleKey } from '@/lib/crm/crm-field-layout';

interface ManagePropertiesModalProps {
  isOpen: boolean;
  onClose: () => void;
  module: string;
  onSuccess: () => void;
}

function SortableField({ field, onDelete, onEdit }: { field: any, onDelete: (id: string) => void, onEdit: (field: any) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: field._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 0,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center justify-between p-4 mb-2 bg-card border rounded-[3px] transition-all ${isDragging ? 'border-primary shadow-xl scale-[1.02]' : 'border-[#ebecf0] hover:border-primary/30'}`}
    >
      <div className="flex items-center gap-4">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-slate-300 hover:text-slate-500 rounded-lg">
          <GripVertical size={20} />
        </div>
        <div>
          <h4 className="font-bold text-sm text-text-main flex items-center gap-2">
            {field.name}
            {field.required && <span className="text-xs bg-rose-50 text-rose-500 px-2 py-0.5 rounded-full">Required</span>}
          </h4>
          <p className="text-xs text-text-muted font-mono">{field.key} • {field.type}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => onDelete(field._id)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-[3px] transition-colors">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

export default function ManagePropertiesModal({ isOpen, onClose, module, onSuccess }: ManagePropertiesModalProps) {
  const [fields, setFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [mergeDeleteField, setMergeDeleteField] = useState<CustomFieldMergeRow | null>(null);

  useEffect(() => {
    if (isOpen) fetchFields();
  }, [isOpen, module]);

  const fetchFields = async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/custom-fields?module=${module}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
    if (res.ok) {
      const data = await res.json();
      let allFields = [...data];
      
      // Merge standard fields if module is leads
      if (module === 'leads') {
        const standardFields = [
          { _id: 'std_firstName', name: 'First Name', key: 'firstName', type: 'text', isStandard: true },
          { _id: 'std_lastName', name: 'Last Name', key: 'lastName', type: 'text', isStandard: true },
          { _id: 'std_email', name: 'Email', key: 'email', type: 'email', isStandard: true },
          { _id: 'std_phone', name: 'Phone', key: 'phone', type: 'text', isStandard: true },
          { _id: 'std_organization', name: 'Company', key: 'organization', type: 'text', isStandard: true },
          { _id: 'std_source', name: 'Source', key: 'source', type: 'text', isStandard: true },
          { _id: 'std_stage', name: 'Stage', key: 'stage', type: 'text', isStandard: true },
        ];
        // Fetch hidden standard fields from local storage to not show them if user 'deleted' them
        const hiddenFields = JSON.parse(localStorage.getItem(`hidden_${module}_fields`) || '[]');
        const visibleStandardFields = standardFields.filter(f => !hiddenFields.includes(f.key));
        
        allFields = [...visibleStandardFields, ...allFields];
      }
      
      setFields(allFields);
    }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load custom properties");
    } finally {
      setLoading(false);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFields((items) => {
        const oldIndex = items.findIndex((i) => i._id === active.id);
        const newIndex = items.findIndex((i) => i._id === over.id);
        const newArray = arrayMove(items, oldIndex, newIndex);
        
        // Save to backend
        const token = localStorage.getItem('token');
        fetch(`${CRM_API_URL}/custom-fields/reorder`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ ids: newArray.filter(f => !f.isStandard).map(f => f._id) }) // Only reorder custom fields in DB backend
        }).then(res => {
          if (res.ok) {
            toast.success("Properties reordered locally and in database");
            onSuccess(); // Trigger parent refresh
          }
        });

        return newArray;
      });
    }
  };

  const handleDelete = async (field: any) => {
    if (field.isStandard) {
      if (
        !confirm(
          'Remove this standard property from configuration views? Data stays on records; this only hides the field here.',
        )
      )
        return;
      const hiddenFields = JSON.parse(localStorage.getItem(`hidden_${module}_fields`) || '[]');
      hiddenFields.push(field.key);
      localStorage.setItem(`hidden_${module}_fields`, JSON.stringify(hiddenFields));
      setFields(fields.filter((f) => f._id !== field._id));
      toast.success('Standard property removed from configuration views');
      onSuccess();
      return;
    }

    setMergeDeleteField({ _id: field._id, name: field.name, key: field.key });
  };

  if (!isOpen) return null;

  const content = (
    <div className={crmModalChrome.overlay}>
      <div className={crmModalChrome.backdrop} onClick={onClose} />
      <div className={`${crmModalChrome.slidePanel} max-w-md crm-jira-modal`}>
        <div className={crmModalChrome.slideHeader}>
          <div className="min-w-0 flex-1">
            <h2 className={`${crmModalChrome.slideTitle} flex items-center gap-2`}>
              <Settings2 className="text-[#0c66e4]" size={18} strokeWidth={1.75} />
              Manage properties
            </h2>
            <p className={crmModalChrome.slideSubtitle}>Reorder or modify custom fields for {module}</p>
          </div>
          <button type="button" onClick={onClose} className={crmModalChrome.closeBtn} aria-label="Close">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className={`${crmModalChrome.slideBody} bg-[#fafbfc]`}>
          {loading ? (
             <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={32} /></div>
          ) : (
             <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
               <SortableContext items={fields.map(f => f._id)} strategy={verticalListSortingStrategy}>
                 <div className="space-y-1 pr-2">
                   {fields.map(field => (
                     <SortableField key={field._id} field={field} onDelete={() => handleDelete(field)} onEdit={() => {}} />
                   ))}
                 </div>
                 {fields.length === 0 && (
                   <div className="text-center py-16 border-2 border-dashed border-[#dfe1e6] rounded-[3px]">
                     <p className="text-sm font-bold text-slate-400">No custom properties found</p>
                     <p className="text-xs text-slate-400 mt-2">Add your first property below</p>
                   </div>
                 )}
               </SortableContext>
             </DndContext>
          )}
        </div>

        <div className={`${crmModalChrome.slideFooter} flex-col items-stretch gap-3`}>
           <div className="flex items-center justify-center gap-2 rounded-[3px] border border-[#dfe1e6] bg-[#deebff] px-3 py-2 text-xs font-medium text-[#0c66e4]">
             <AlertCircle size={14} strokeWidth={1.75} /> Drag properties to reorder configuration
           </div>
           <button type="button" onClick={() => setIsCreateModalOpen(true)} className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-[3px] bg-[#0c66e4] px-4 text-sm font-medium text-white hover:bg-[#0055cc]">
             <Plus size={16} strokeWidth={1.75} />
             Create custom field
           </button>
        </div>
      </div>
      
      <CustomFieldModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          setIsCreateModalOpen(false);
          fetchFields();
          onSuccess();
        }}
      />

      <DeleteCustomFieldMergeDialog
        open={!!mergeDeleteField}
        onOpenChange={(open) => !open && setMergeDeleteField(null)}
        field={mergeDeleteField}
        module={module as CrmModuleKey}
        siblingCustomFields={fields
          .filter((f) => !f.isStandard && f._id !== mergeDeleteField?._id)
          .map((f) => ({ _id: f._id, name: f.name, key: f.key }))}
        onSuccess={() => {
          setMergeDeleteField(null);
          fetchFields();
          onSuccess();
        }}
      />
    </div>
  );

  return <CrmJiraPortal>{content}</CrmJiraPortal>;
}
