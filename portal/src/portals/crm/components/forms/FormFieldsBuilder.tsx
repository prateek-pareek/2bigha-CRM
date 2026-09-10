"use client";

import { useState } from "react";
import { GripVertical, Pencil, Plus, Star, Trash2 } from "lucide-react";
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
  type FormField,
} from "@/lib/crm/forms";
import FormFieldEditorPanel from "./FormFieldEditorPanel";

type Props = {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
};

function SortableFieldRow({
  field,
  index,
  onEdit,
  onRemove,
}: {
  field: FormField;
  index: number;
  onEdit: () => void;
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-3 rounded-md border border-[var(--surface-dim)] bg-white p-3 ${
        isDragging ? "shadow-lg border-[var(--hs-link)]" : ""
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex h-8 w-6 items-center justify-center text-[var(--primary-muted)] hover:text-[var(--text-muted)] cursor-grab active:cursor-grabbing shrink-0"
      >
        <GripVertical size={14} />
      </div>
      <div className="w-6 h-6 rounded-md bg-[var(--surface-dim)] flex items-center justify-center text-xs font-semibold text-[var(--primary-muted)] shrink-0">
        {index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-[var(--text-main)] truncate">{field.label}</p>
          {field.required && <Star size={11} className="text-rose-500 shrink-0" fill="currentColor" />}
        </div>
        <p className="text-xs text-[var(--primary-muted)] mt-0.5">
          {FORM_FIELD_TYPE_LABELS[field.type]}
          {field.mapsTo && ` · Maps to ${FORM_FIELD_LEAD_TARGET_LABELS[field.mapsTo]}`}
          {!field.mapsTo && ` · Custom field (${field.key})`}
        </p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 rounded-md hover:bg-[var(--background)] text-[var(--text-muted)] hover:text-[var(--hs-link)] transition-colors"
          title="Edit field"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 rounded-md hover:bg-rose-50 text-[var(--primary-muted)] hover:text-rose-600 transition-colors"
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[var(--primary-muted)] uppercase tracking-wider">
          {fields.length} question{fields.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={() => {
            setEditingField(null);
            setPanelOpen(true);
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--hs-link)] hover:text-[var(--hs-link-hover)] transition-colors"
        >
          <Plus size={13} /> Add field
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="py-10 flex flex-col items-center justify-center text-center rounded-md border border-dashed border-[var(--surface-dim)]">
          <p className="text-sm text-[var(--text-main)] font-semibold">No fields yet</p>
          <p className="text-xs text-[var(--primary-muted)] mt-1 max-w-xs">
            Add the questions you want to ask — name, phone, email, budget, or anything custom.
          </p>
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
