"use client";

import { useState } from "react";
import {
  AlignLeft,
  Calendar,
  CheckSquare,
  CircleDot,
  Copy,
  GripVertical,
  Hash,
  List,
  ListChecks,
  Mail,
  Pencil,
  Phone,
  Plus,
  Star,
  Trash2,
  Type,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  FORM_FIELD_LEAD_TARGET_LABELS,
  FORM_FIELD_TYPE_LABELS,
  FORM_STARTER_FIELDS,
  slugifyFieldKey,
  type FormField,
  type FormFieldType,
} from "@/lib/crm/forms";
import { CRM_BTN_PRIMARY, CRM_BTN_SECONDARY } from "@/lib/crm/ui";
import FormFieldEditorPanel from "./FormFieldEditorPanel";

type Props = {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
};

const TYPE_ICON: Record<FormFieldType, typeof Type> = {
  text: Type,
  textarea: AlignLeft,
  email: Mail,
  phone: Phone,
  number: Hash,
  date: Calendar,
  select: List,
  multiselect: ListChecks,
  radio: CircleDot,
  checkbox: CheckSquare,
};

function SortableFieldRow({
  field,
  index,
  onEdit,
  onDuplicate,
  onRemove,
}: {
  field: FormField;
  index: number;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.key,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 0,
    opacity: isDragging ? 0.5 : 1,
  };
  const Icon = TYPE_ICON[field.type] || Type;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] p-3 ${
        isDragging ? "shadow-md border-[var(--text-muted)]" : "hover:bg-[var(--background)]"
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex h-8 w-6 items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-grab active:cursor-grabbing shrink-0"
        title="Drag to reorder"
      >
        <GripVertical size={14} />
      </div>
      <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--primary-light)] text-[var(--primary)] flex items-center justify-center shrink-0">
        <Icon size={14} />
      </div>
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">{index + 1}.</span>
          <p className="text-sm font-semibold text-[var(--text-main)] truncate">{field.label}</p>
          {field.required && <Star size={11} className="text-rose-500 shrink-0" fill="currentColor" />}
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
          {FORM_FIELD_TYPE_LABELS[field.type]}
          {field.mapsTo
            ? ` · Maps to ${FORM_FIELD_LEAD_TARGET_LABELS[field.mapsTo]}`
            : ` · Custom field (${field.key})`}
        </p>
      </button>
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 rounded-[var(--radius-md)] hover:bg-[var(--background)] text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
          title="Edit field"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          className="p-1.5 rounded-[var(--radius-md)] hover:bg-[var(--background)] text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
          title="Duplicate field"
        >
          <Copy size={14} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 rounded-[var(--radius-md)] hover:bg-rose-50 text-[var(--text-muted)] hover:text-rose-600 transition-colors"
          title="Remove field"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

/** Drag-reorderable list of a form's questions, with an add/edit side panel — the core Form Builder UI. */
export default function FormFieldsBuilder({ fields, onChange }: Props) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingField, setEditingField] = useState<FormField | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sorted = [...fields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sorted.findIndex((f) => f.key === active.id);
    const newIndex = sorted.findIndex((f) => f.key === over.id);
    const reordered = arrayMove(sorted, oldIndex, newIndex).map((f, i) => ({ ...f, order: i }));
    onChange(reordered);
  };

  const handleSaveField = (field: FormField) => {
    const isEditing = fields.some((f) => f.key === editingField?.key);
    if (isEditing) {
      onChange(fields.map((f) => (f.key === editingField?.key ? field : f)));
    } else {
      onChange([...fields, { ...field, order: fields.length }]);
    }
    setPanelOpen(false);
    setEditingField(null);
  };

  const handleDuplicate = (field: FormField) => {
    const key = slugifyFieldKey(`${field.label} copy`, fields.map((f) => f.key));
    onChange([
      ...fields,
      {
        ...field,
        key,
        label: `${field.label} (copy)`,
        order: fields.length,
      },
    ]);
  };

  const handleAddStarters = () => {
    const keys = fields.map((f) => f.key);
    const next = [...fields];
    for (const starter of FORM_STARTER_FIELDS) {
      const key = slugifyFieldKey(starter.label, keys);
      keys.push(key);
      next.push({ ...starter, key, order: next.length });
    }
    onChange(next);
  };

  const openAdd = () => {
    setEditingField(null);
    setPanelOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          {fields.length} question{fields.length === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          {fields.length === 0 && (
            <button type="button" onClick={handleAddStarters} className={CRM_BTN_SECONDARY}>
              Add name, email &amp; phone
            </button>
          )}
          <button type="button" onClick={openAdd} className={CRM_BTN_SECONDARY}>
            <Plus size={14} /> Add field
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center text-center rounded-[var(--radius-md)] border border-dashed border-[var(--border-color)] bg-[var(--card-bg)]">
          <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--primary-light)] text-[var(--primary)] flex items-center justify-center mb-3">
            <ListChecks size={20} />
          </div>
          <p className="text-sm text-[var(--text-main)] font-semibold">No fields yet</p>
          <p className="text-xs text-[var(--text-muted)] mt-1 max-w-xs">
            Add the questions you want to ask — name, phone, email, budget, or anything custom.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={handleAddStarters} className={CRM_BTN_SECONDARY}>
              Use starter fields
            </button>
            <button type="button" onClick={openAdd} className={CRM_BTN_PRIMARY}>
              <Plus size={14} /> Add field
            </button>
          </div>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sorted.map((f) => f.key)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {sorted.map((field, i) => (
                <SortableFieldRow
                  key={field.key}
                  field={field}
                  index={i}
                  onEdit={() => {
                    setEditingField(field);
                    setPanelOpen(true);
                  }}
                  onDuplicate={() => handleDuplicate(field)}
                  onRemove={() => onChange(fields.filter((f) => f.key !== field.key))}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <FormFieldEditorPanel
        isOpen={panelOpen}
        onClose={() => {
          setPanelOpen(false);
          setEditingField(null);
        }}
        onSave={handleSaveField}
        field={editingField}
        existingKeys={fields.map((f) => f.key)}
      />
    </div>
  );
}
