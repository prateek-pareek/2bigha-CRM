"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { CrmJiraPortal } from '@/components/crm/shell/CrmJiraPortal';
import { CrmCenterModalShell } from '@/components/crm/shell/CrmCenterModalShell';
import {
    Plus,
    Clock,
    Trash2,
    Edit2,
    Calendar,
    GripVertical,
    AlertTriangle,
    ArrowUpRight,
    User,
} from 'lucide-react';
import CrmSlidePanelShell from '@/components/crm/shell/CrmSlidePanelShell';
import { CRM_API_URL } from '@/lib/crm/config';
import { getCrmAuthToken } from '@/lib/crm/api';
import ActivityLogger, { CrmPortalUserOption, formatCrmUserLabel } from '@/components/crm/inbox/ActivityLogger';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from "@/lib/utils";
import { toast } from 'sonner';
import CRMFilterBar from '@/components/crm/segments/CRMFilterBar';
import { applyFilters, FilterCriteria, FilterProperty } from '@/lib/crm/filter-config';
import {
  CrmPageHeader,
  CrmButton,
  CrmCountBadge,
  CrmListToolbar,
  CrmKanbanBoard,
  CrmKanbanColumn,
  CrmKanbanAvatar,
} from '@/components/crm/ui';
import { CRM_LIST_PAGE } from '@/lib/crm/ui';
import { crmStageAccent } from '@/lib/crm/stage-accent';
import { CrmViewToggle, type CrmViewMode } from '@/components/crm/ui/CrmViewToggle';
import { TaskDetailBody, isTaskEscalated, isTaskOverdue, normalizeTaskStatus, yesterdayDueDateIso, type CrmTask } from './TaskDetailBody';
import {
    DndContext,
    closestCorners,
    pointerWithin,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    useDroppable,
    type CollisionDetection,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const TASK_COLUMNS = [
    { name: 'Open' },
    { name: 'In Progress' },
    { name: 'Done' },
];

type TaskPerson = CrmPortalUserOption & { fullName?: string; name?: string };

interface Task extends CrmTask {}

function taskPersonLabel(p: TaskPerson | string | undefined, fallback?: string): string {
    if (!p) return fallback || '';
    if (typeof p === 'string') return fallback || '';
    return formatCrmUserLabel(p) || fallback || '';
}

function taskPersonInitials(p: TaskPerson | string | undefined): string {
    const label = taskPersonLabel(p);
    if (!label) return '';
    return label
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || '')
        .join('');
}

function priorityChipClass(priority?: string): string {
    const p = String(priority || '').toLowerCase();
    if (p === 'urgent' || p === 'high') return 'bg-rose-100 text-rose-700';
    if (p === 'medium') return 'bg-amber-100 text-amber-700';
    if (p === 'low') return 'bg-slate-100 text-slate-600';
    return 'bg-slate-100 text-slate-600';
}

function TaskCard({
    task,
    onClick,
    onDelete,
    onEdit,
    selectable,
    selected,
    onToggleSelect,
}: {
    task: Task;
    onClick: () => void;
    onDelete: () => void;
    onEdit: () => void;
    selectable?: boolean;
    selected?: boolean;
    onToggleSelect?: () => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: task._id,
        data: { type: 'Task', task },
    });
    const didDragRef = useRef(false);

    useEffect(() => {
        if (isDragging) didDragRef.current = true;
    }, [isDragging]);

    const overdue = isTaskOverdue(task);
    const escalated = isTaskEscalated(task);
    const assigneeLabel = taskPersonLabel(
        task.assignee as TaskPerson,
        task.metadata?.assigneeName || task.metadata?.pmAssigneeName,
    );
    const stageKey = escalated
        ? 'Escalated'
        : overdue && normalizeTaskStatus(task.status) !== 'Done'
            ? 'Overdue'
            : normalizeTaskStatus(task.status);
    const accent = crmStageAccent(stageKey);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 100 : 1,
        ['--crm-stage-accent' as string]: accent,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            role="button"
            tabIndex={0}
            onClick={() => {
                if (didDragRef.current) {
                    didDragRef.current = false;
                    return;
                }
                onClick();
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                }
            }}
            className={cn(
                'group relative mt-3 box-border cursor-grab overflow-hidden rounded-[5px] border border-[#e2e8f0] bg-white p-3 shadow-[0_4px_4px_0_rgba(219,219,219,0.25)]',
                'active:cursor-grabbing select-none transition-[transform,box-shadow] duration-150',
                'hover:shadow-[0_6px_12px_0_rgba(219,219,219,0.35)]',
                isDragging && 'rotate-1 scale-[1.02] opacity-95 shadow-2xl ring-2 ring-[var(--primary)]/25',
                selected && 'ring-2 ring-[var(--primary)]/35',
            )}
        >
            <div className="mb-2.5 h-[3px] w-full rounded-sm" style={{ background: accent }} aria-hidden />

            <div className="flex items-start gap-2">
                {selectable ? (
                    <label
                        className="mt-0.5 inline-flex shrink-0"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <input
                            type="checkbox"
                            checked={Boolean(selected)}
                            onChange={() => onToggleSelect?.()}
                            className="h-3.5 w-3.5 cursor-pointer accent-[var(--primary)]"
                            aria-label={`Select task ${task.title || task._id}`}
                        />
                    </label>
                ) : null}

                <h4 className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-[#1f2020] line-clamp-2 group-hover:text-[var(--primary)]">
                    {task.title || 'Untitled Task'}
                </h4>

                <span
                    className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center text-[#94a3b8] group-hover:text-[#64748b]"
                    aria-hidden
                >
                    <GripVertical size={14} strokeWidth={2} />
                </span>
            </div>

            <div className="mt-2.5 flex items-center gap-1.5 border-t border-[#e2e8f0] pt-2.5">
                <span title={assigneeLabel || 'Unassigned'} className="shrink-0">
                    <CrmKanbanAvatar
                        size="sm"
                        className={cn(!assigneeLabel && 'border-dashed text-[var(--text-muted)]/60')}
                    >
                        {taskPersonInitials(task.assignee as TaskPerson) || <User size={11} strokeWidth={2} />}
                    </CrmKanbanAvatar>
                </span>

                {escalated ? (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                        <ArrowUpRight size={11} strokeWidth={2.5} />
                        Escalated
                    </span>
                ) : null}

                {task.metadata?.priority ? (
                    <span
                        className={cn(
                            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                            priorityChipClass(task.metadata.priority),
                        )}
                    >
                        {task.metadata.priority}
                    </span>
                ) : null}

                {task.metadata?.dueDate ? (
                    <span
                        className={cn(
                            'inline-flex min-w-0 items-center gap-1 truncate text-[10px] font-semibold',
                            overdue ? 'text-rose-600' : 'text-[#707070]',
                        )}
                    >
                        {overdue ? (
                            <AlertTriangle size={11} strokeWidth={2.25} className="shrink-0" />
                        ) : (
                            <Calendar size={11} strokeWidth={2} className="shrink-0" />
                        )}
                        {new Date(task.metadata.dueDate).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                        })}
                    </span>
                ) : null}

                <div
                    className="ml-auto flex shrink-0 items-center"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <button
                        type="button"
                        title="Edit"
                        onClick={(e) => {
                            e.stopPropagation();
                            onEdit();
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#707070] transition-colors hover:bg-[#f7f8f9] hover:text-[var(--primary)]"
                    >
                        <Edit2 size={13} strokeWidth={2.25} />
                    </button>
                    <button
                        type="button"
                        title="Delete"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#707070] transition-colors hover:bg-rose-50 hover:text-rose-600"
                    >
                        <Trash2 size={13} strokeWidth={2.25} />
                    </button>
                </div>
            </div>
        </div>
    );
}

function BoardColumn({ column, tasks, onTaskClick, onAddClick, onDeleteTask, onEditTask, isAdmin, selectedIds, onToggleSelect }: {
    column: { name: string };
    tasks: Task[];
    onTaskClick: (task: Task) => void;
    onAddClick: () => void;
    onDeleteTask: (id: string) => void;
    onEditTask: (task: Task) => void;
    isAdmin: boolean;
    selectedIds: Set<string>;
    onToggleSelect: (id: string) => void;
}) {
    const { setNodeRef, isOver } = useDroppable({
        id: column.name,
        data: { type: 'Column', columnName: column.name },
        disabled: false,
    });

    const overdueCount = tasks.filter(isTaskOverdue).length;
    const escalatedCount = tasks.filter(isTaskEscalated).length;
    const isEscalatedColumn = column.name === 'Escalated';
    const isOverdueColumn = column.name === 'Overdue';

    return (
        <CrmKanbanColumn
            title={column.name}
            stageKey={column.name}
            summary={
                <span className="inline-flex items-center gap-1.5">
                    <span>{tasks.length} task{tasks.length === 1 ? '' : 's'}</span>
                    {overdueCount > 0 && !isOverdueColumn && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">
                            <AlertTriangle size={10} strokeWidth={2.5} />
                            {overdueCount} overdue
                        </span>
                    )}
                    {escalatedCount > 0 && !isEscalatedColumn && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">
                            <ArrowUpRight size={10} strokeWidth={2.5} />
                            {escalatedCount} escalated
                        </span>
                    )}
                </span>
            }
            onAdd={onAddClick}
            style={{ minHeight: 320 }}
            className={cn(
                '!w-auto !max-w-none min-w-[220px] flex-1 basis-0',
                isOver && 'ring-2 ring-primary/30',
            )}
        >
            <div
                ref={setNodeRef}
                className={cn(
                    'flex min-h-[10rem] flex-1 flex-col transition-colors',
                    isOver && 'rounded-[var(--radius-md)] bg-primary/5',
                )}
            >
                {tasks.length === 0 ? (
                    <button
                        type="button"
                        onClick={onAddClick}
                        className="group mt-3 flex h-32 flex-col items-center justify-center gap-1.5 rounded-[var(--radius-md)] border-2 border-dashed border-[var(--border-color)] text-[var(--text-muted)] transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                    >
                        {isEscalatedColumn ? (
                            <ArrowUpRight size={22} className="opacity-50 group-hover:opacity-100" strokeWidth={1.5} />
                        ) : (
                            <Clock size={22} className="opacity-50 group-hover:opacity-100" strokeWidth={1.5} />
                        )}
                        <p className="text-xs font-bold">
                            {isEscalatedColumn ? 'No escalated tasks' : isOverdueColumn ? 'No overdue tasks' : 'No tasks yet'}
                        </p>
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold opacity-0 transition-opacity group-hover:opacity-100">
                            <Plus size={12} strokeWidth={3} />{' '}
                            {isEscalatedColumn ? 'Mark / add escalated' : isOverdueColumn ? 'Mark / add overdue' : 'Add task'}
                        </span>
                    </button>
                ) : (
                    <SortableContext items={tasks.map(t => t._id)} strategy={verticalListSortingStrategy}>
                        {tasks.map((task) => (
                            <TaskCard
                                key={task._id}
                                task={task}
                                onClick={() => onTaskClick(task)}
                                onDelete={() => onDeleteTask(task._id)}
                                onEdit={() => onEditTask(task)}
                                selectable={isAdmin}
                                selected={selectedIds.has(task._id)}
                                onToggleSelect={() => onToggleSelect(task._id)}
                            />
                        ))}
                    </SortableContext>
                )}
            </div>
        </CrmKanbanColumn>
    );
}

/** Column-shaped shimmer so the board keeps its layout while the first fetch resolves. */
function TaskBoardSkeleton() {
    return (
        <div className="flex h-full items-start gap-3 overflow-hidden pb-4">
            {TASK_COLUMNS.map((column) => (
                <div
                    key={column.name}
                    className="flex min-w-[220px] flex-1 basis-0 flex-col gap-3 rounded-[5px] border border-[var(--border-color)] p-2"
                >
                    <div className="h-14 animate-pulse rounded-[5px] bg-[var(--surface-dim)]" />
                    {[0, 1].map((i) => (
                        <div
                            key={i}
                            className="h-24 animate-pulse rounded-[5px] border border-[var(--border-color)] bg-[var(--surface-dim)]"
                            style={{ animationDelay: `${i * 100}ms` }}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

export default function TasksPage() {
    const { user, isAdmin } = usePermissions();
    const defaultReporterId = useMemo(
        () => String(user?._id || user?.id || ''),
        [user?._id, user?.id],
    );
    const [crmUsers, setCrmUsers] = useState<CrmPortalUserOption[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [isEditingForm, setIsEditingForm] = useState(false);
    const [filters, setFilters] = useState<FilterCriteria[]>([]);
    const [filterProperties, setFilterProperties] = useState<FilterProperty[]>([]);
    const [search, setSearch] = useState('');
    const [defaultColumnForNew, setDefaultColumnForNew] = useState<string>('Open');
    const [viewMode, setViewMode] = useState<CrmViewMode>('kanban');
    const [teamScope, setTeamScope] = useState(false);
    const [mineOnly, setMineOnly] = useState(false);
    /** Derived lane focus — Overdue / Escalated are not persisted statuses. */
    const [laneFilter, setLaneFilter] = useState<'all' | 'overdue' | 'escalated'>('all');
    const [relatedLeadId, setRelatedLeadId] = useState('');
    const [relatedListingId, setRelatedListingId] = useState('');
    const [pmListings, setPmListings] = useState<Array<{ _id: string; title?: string }>>([]);
    const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
    const [bulkStatus, setBulkStatus] = useState<string>('Open');
    const [bulkApplying, setBulkApplying] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const collisionDetection: CollisionDetection = (args) => {
        const hits = pointerWithin(args);
        if (hits.length > 0) return hits;
        return closestCorners(args);
    };

    const fetchTasks = async (opts?: { silent?: boolean }) => {
        if (!opts?.silent) setLoading(true);
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(
                `${CRM_API_URL}/crm/activities?type=Task${teamScope ? '&teamScope=1' : ''}${mineOnly && (user?._id || user?.id) ? `&assignee=${user._id || user.id}` : ''}`,
                {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setTasks(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to fetch tasks', err);
        } finally {
            if (!opts?.silent) setLoading(false);
        }
    };

    useEffect(() => {
        fetchTasks();
    }, [teamScope, mineOnly, user?._id, user?.id]);

    useEffect(() => {
        const token = getCrmAuthToken();
        if (!token) return;
        void fetch(`${CRM_API_URL}/crm-users/list/task-assignees`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => r.json())
            .then((data) => {
                if (Array.isArray(data) && data.length) {
                    setCrmUsers(data);
                    return;
                }
                return fetch(`${CRM_API_URL}/crm-users/list/crm-portal`, {
                    headers: { Authorization: `Bearer ${token}` },
                }).then((r) => r.json()).then((fallback) => {
                    if (Array.isArray(fallback)) setCrmUsers(fallback);
                });
            })
            .catch(() => {
                void fetch(`${CRM_API_URL}/crm-users/list/crm-portal`, {
                    headers: { Authorization: `Bearer ${token}` },
                })
                    .then((r) => r.json())
                    .then((data) => {
                        if (Array.isArray(data)) setCrmUsers(data);
                    })
                    .catch(() => {});
            });
        void fetch(`${CRM_API_URL}/crm/property-listings?listingBucket=pm&pageSize=50`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => r.json())
            .then((data) => {
                const rows = Array.isArray(data) ? data : data?.items || data?.data || [];
                if (Array.isArray(rows)) {
                    setPmListings(rows.map((row: any) => ({ _id: String(row._id), title: row.title })));
                }
            })
            .catch(() => {});
    }, []);

    const filteredTasks = useMemo(
        () => {
            const isVirtualStatus = (f: FilterCriteria) => {
                if (f.property !== 'status') return false;
                const v = String(f.value || '').toLowerCase();
                return v === 'overdue' || v === 'escalated';
            };
            const virtualStatus = filters.filter(isVirtualStatus);
            const standardFilters = filters.filter((f) => !isVirtualStatus(f));

            let rows = applyFilters(tasks, standardFilters, filterProperties);

            for (const f of virtualStatus) {
                const wantEscalated = String(f.value || '').toLowerCase() === 'escalated';
                const hit = (t: Task) => (wantEscalated ? isTaskEscalated(t) : isTaskOverdue(t));
                if (f.operator === 'not_equals') {
                    rows = rows.filter((t) => !hit(t));
                } else {
                    // equals / contains → match the virtual lane
                    rows = rows.filter((t) => hit(t));
                }
            }

            if (laneFilter === 'overdue') {
                rows = rows.filter(isTaskOverdue);
            } else if (laneFilter === 'escalated') {
                rows = rows.filter(isTaskEscalated);
            }

            const q = search.trim().toLowerCase();
            if (q) {
                rows = rows.filter(
                    (t) =>
                        (t.title || '').toLowerCase().includes(q) ||
                        (t.content || '').toLowerCase().includes(q),
                );
            }
            return rows;
        },
        [tasks, filters, filterProperties, search, laneFilter],
    );

    const filteredTaskIds = useMemo(() => filteredTasks.map((t) => t._id), [filteredTasks]);
    const filteredTaskIdKey = useMemo(() => filteredTaskIds.join('|'), [filteredTaskIds]);

    useEffect(() => {
        const validIds = new Set(filteredTaskIdKey ? filteredTaskIdKey.split('|') : []);
        setSelectedTaskIds((prev) => {
            if (prev.size === 0) return prev;
            let changed = false;
            const next = new Set<string>();
            prev.forEach((id) => {
                if (validIds.has(id)) next.add(id);
                else changed = true;
            });
            // Returning a new Set with the same members re-renders forever.
            if (!changed && next.size === prev.size) return prev;
            return next;
        });
    }, [filteredTaskIdKey]);

    const toggleSelectTask = (id: string) => {
        setSelectedTaskIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAllFiltered = () => {
        setSelectedTaskIds(prev => {
            const next = new Set(prev);
            const allSelected = filteredTaskIds.length > 0 && filteredTaskIds.every(id => next.has(id));
            if (allSelected) {
                filteredTaskIds.forEach(id => next.delete(id));
            } else {
                filteredTaskIds.forEach(id => next.add(id));
            }
            return next;
        });
    };

    const getTasksForColumn = (columnName: string) => {
        return filteredTasks.filter(t => {
            const overdue = isTaskOverdue(t);
            const escalated = isTaskEscalated(t);
            if (columnName === 'Open') {
                const s = normalizeTaskStatus(t.status);
                return s === 'Open' && !overdue && !escalated;
            }
            if (columnName === 'In Progress') {
                return normalizeTaskStatus(t.status) === 'In Progress' && !overdue && !escalated;
            }
            if (columnName === 'Done') return normalizeTaskStatus(t.status) === 'Done';
            return false;
        });
    };

    const overdueTasks = filteredTasks.filter((t) => isTaskOverdue(t) && !isTaskEscalated(t));
    const escalatedTasks = filteredTasks.filter(isTaskEscalated);

    const handleSaveActivity = async (payload: any) => {
        const token = localStorage.getItem('token');
        const listing = pmListings.find((p) => p._id === relatedListingId);
        const body = {
            ...payload,
            type: 'Task',
            status: payload.status || (
                defaultColumnForNew === 'Overdue' || defaultColumnForNew === 'Escalated'
                    ? 'Open'
                    : defaultColumnForNew
            ),
            relatedTo: relatedLeadId || relatedListingId || payload.relatedTo,
            relatedType: relatedLeadId ? 'Lead' : relatedListingId ? 'PropertyListing' : payload.relatedType,
            metadata: {
                ...(payload.metadata || {}),
                relatedPropertyId: relatedListingId || undefined,
                relatedPropertyTitle: listing?.title,
                propertyListingId: relatedListingId || undefined,
            },
        };
        const res = await fetch(`${CRM_API_URL}/crm/activities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body)
        });
        if (res.ok) {
            fetchTasks();
            setIsCreating(false);
            setRelatedLeadId('');
            setRelatedListingId('');
        }
    };

    const handleUpdateActivity = async (payload: any) => {
        if (!editingTask) return;
        const token = localStorage.getItem('token');
        const res = await fetch(`${CRM_API_URL}/crm/activities/${editingTask._id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            fetchTasks();
            setEditingTask(null);
            setIsEditingForm(false);
        }
    };

    const handlePatchKeepOpen = async (payload: Record<string, unknown>) => {
        if (!editingTask) return;
        const token = localStorage.getItem('token');
        const res = await fetch(`${CRM_API_URL}/crm/activities/${editingTask._id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            toast.error('Could not update task');
            throw new Error('patch failed');
        }
        const data = await res.json();
        setEditingTask(data);
        // Soft-update board in place — avoid skeleton blink behind the modal.
        setTasks((prev) => prev.map((t) => (t._id === data._id ? { ...t, ...data } : t)));
        void fetchTasks({ silent: true });

        if (payload.escalate || payload.escalateTo) {
            toast.success('Task escalated');
        } else if ('assignee' in payload) {
            toast.success(payload.assignee ? 'Assignee updated' : 'Task unassigned');
        } else if (payload.comment) {
            toast.success('Comment posted');
        } else if (payload.metadata && typeof payload.metadata === 'object' && 'checklist' in (payload.metadata as object)) {
            toast.success('Checklist updated');
        } else {
            toast.success('Task saved');
        }
    };

    const handleDeleteTask = async (id: string) => {
        if (!confirm('Permanently delete this task?')) return;
        const token = localStorage.getItem('token');
        await fetch(`${CRM_API_URL}/crm/activities/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        setTasks(tasks.filter(t => t._id !== id));
        setSelectedTaskIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const statusOptions = [...TASK_COLUMNS.map(c => c.name), 'Overdue', 'Escalated'];
    const bulkSelectOptions = statusOptions;

    const handleBulkMove = async () => {
        if (!isAdmin) return;
        if (selectedTaskIds.size === 0) return;
        const token = localStorage.getItem('token');
        setBulkApplying(true);
        try {
            const ids = Array.from(selectedTaskIds);
            const markOverdue = bulkStatus === 'Overdue';
            const markEscalated = bulkStatus === 'Escalated';
            await Promise.all(
                ids.map((id) => {
                    const task = tasks.find((t) => t._id === id);
                    let body: Record<string, unknown>;
                    if (markOverdue) {
                        body = {
                            status: 'Open',
                            metadata: {
                                ...(task?.metadata || {}),
                                markedOverdue: true,
                                escalated: false,
                                dueDate: task?.metadata?.dueDate || yesterdayDueDateIso(),
                            },
                        };
                    } else if (markEscalated) {
                        body = {
                            status: normalizeTaskStatus(task?.status) === 'Done' ? 'Open' : (task?.status || 'Open'),
                            escalate: true,
                            metadata: {
                                ...(task?.metadata || {}),
                                escalated: true,
                                escalatedAt: new Date().toISOString(),
                                markedOverdue: Boolean(task?.metadata?.markedOverdue),
                            },
                        };
                    } else {
                        body = {
                            status: bulkStatus,
                            metadata: {
                                ...(task?.metadata || {}),
                                markedOverdue: false,
                                escalated: false,
                                escalatedAt: null,
                                escalatedTo: null,
                            },
                        };
                    }
                    return fetch(`${CRM_API_URL}/crm/activities/${id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify(body),
                    });
                }),
            );
            await fetchTasks();
            setSelectedTaskIds(new Set());
            toast.success(
                markEscalated ? 'Marked escalated' : markOverdue ? 'Marked overdue' : `Moved to ${bulkStatus}`,
            );
        } finally {
            setBulkApplying(false);
        }
    };

    const handleBulkDelete = async () => {
        if (!isAdmin || selectedTaskIds.size === 0) return;
        if (!confirm(`Delete ${selectedTaskIds.size} selected task(s)?`)) return;
        const token = localStorage.getItem('token');
        setBulkApplying(true);
        try {
            const ids = Array.from(selectedTaskIds);
            await Promise.all(
                ids.map((id) =>
                    fetch(`${CRM_API_URL}/crm/activities/${id}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` },
                    }),
                ),
            );
            setTasks(prev => prev.filter(t => !selectedTaskIds.has(t._id)));
            setSelectedTaskIds(new Set());
        } finally {
            setBulkApplying(false);
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;

        const activeData = active.data.current;
        if (activeData?.type !== 'Task') return;

        const taskId = active.id as string;
        const task = tasks.find(t => t._id === taskId);
        if (!task) return;

        const validStatuses = TASK_COLUMNS.map(c => c.name);
        const overData = over.data.current;

        // Drop onto Overdue lane → mark overdue (keep Open / In Progress status)
        if (overData?.type === 'Column' && overData.columnName === 'Overdue') {
            if (isTaskOverdue(task) && !isTaskEscalated(task)) return;
            const nextMeta = {
                ...(task.metadata || {}),
                markedOverdue: true,
                escalated: false,
                escalatedAt: undefined,
                escalatedTo: undefined,
                dueDate: task.metadata?.dueDate || yesterdayDueDateIso(),
            };
            setTasks((prev) =>
                prev.map((t) => (t._id === taskId ? { ...t, metadata: nextMeta } : t)),
            );
            const token = localStorage.getItem('token');
            try {
                const res = await fetch(`${CRM_API_URL}/crm/activities/${taskId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({
                        status: normalizeTaskStatus(task.status) === 'Done' ? 'Open' : task.status,
                        metadata: nextMeta,
                    }),
                });
                if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
                toast.success('Marked overdue');
            } catch (err) {
                console.error(err);
                setTasks((prev) => prev.map((t) => (t._id === taskId ? task : t)));
                toast.error('Could not mark overdue');
            }
            return;
        }

        // Drop onto Escalated lane → mark escalated
        if (overData?.type === 'Column' && overData.columnName === 'Escalated') {
            if (isTaskEscalated(task)) return;
            const nextMeta = {
                ...(task.metadata || {}),
                escalated: true,
                escalatedAt: new Date().toISOString(),
            };
            setTasks((prev) =>
                prev.map((t) =>
                    t._id === taskId
                        ? {
                              ...t,
                              status: normalizeTaskStatus(t.status) === 'Done' ? 'Open' : t.status,
                              metadata: nextMeta,
                          }
                        : t,
                ),
            );
            const token = localStorage.getItem('token');
            try {
                const res = await fetch(`${CRM_API_URL}/crm/activities/${taskId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({
                        status: normalizeTaskStatus(task.status) === 'Done' ? 'Open' : task.status,
                        escalate: true,
                        metadata: nextMeta,
                    }),
                });
                if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
                toast.success('Marked escalated');
            } catch (err) {
                console.error(err);
                setTasks((prev) => prev.map((t) => (t._id === taskId ? task : t)));
                toast.error('Could not mark escalated');
            }
            return;
        }

        let newStatus = '';

        if (overData?.type === 'Column' && overData.columnName) {
            newStatus = String(overData.columnName);
        } else if (overData?.type === 'Task' && overData.task) {
            newStatus = normalizeTaskStatus((overData.task as Task).status);
        } else if (validStatuses.includes(String(over.id))) {
            newStatus = String(over.id);
        } else if (String(over.id) === 'Overdue' || String(over.id) === 'Escalated') {
            return;
        } else {
            return;
        }

        if (!validStatuses.includes(newStatus)) return;

        const prevStatus = normalizeTaskStatus(task.status);
        const wasEscalated = Boolean(task.metadata?.escalated);
        const wasMarkedOverdue = Boolean(task.metadata?.markedOverdue);
        const statusChanged = prevStatus !== newStatus;
        const shouldClearFlags = wasEscalated || wasMarkedOverdue;

        if (!statusChanged && !shouldClearFlags) return;

        const nextMeta = shouldClearFlags
            ? {
                  ...(task.metadata || {}),
                  escalated: false,
                  escalatedAt: null,
                  escalatedTo: null,
                  markedOverdue: false,
              }
            : undefined;

        const patchBody: Record<string, unknown> = { status: newStatus };
        if (nextMeta) patchBody.metadata = nextMeta;

        setTasks((prev) =>
            prev.map((t) =>
                t._id === taskId
                    ? {
                          ...t,
                          status: newStatus,
                          metadata: nextMeta
                              ? {
                                    ...(t.metadata || {}),
                                    escalated: false,
                                    escalatedAt: undefined,
                                    escalatedTo: undefined,
                                    markedOverdue: false,
                                }
                              : t.metadata,
                      }
                    : t,
            ),
        );

        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${CRM_API_URL}/crm/activities/${taskId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(patchBody),
            });
            if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
            toast.success(`Moved to ${newStatus}`);
        } catch (err) {
            console.error(err);
            setTasks((prev) =>
                prev.map((t) =>
                    t._id === taskId
                        ? {
                              ...t,
                              status: task.status,
                              metadata: task.metadata,
                          }
                        : t,
                ),
            );
            toast.error('Could not move task');
            await fetchTasks({ silent: true });
        }
    };

    return (
        <div className={cn(CRM_LIST_PAGE, "h-[calc(100vh-140px)] space-y-0")}>
            <CrmPageHeader
                bordered={false}
                title="Tasks"
                badge={<CrmCountBadge>{filteredTasks.length}</CrmCountBadge>}
                breadcrumbs={[
                    { label: 'Home', href: '/crm/workspace/summary' },
                    { label: 'Tasks' },
                ]}
                description="Create, assign, and track CRM + Property Management work — list, board, and calendar"
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <CrmViewToggle value={viewMode} onChange={setViewMode} modes={['list', 'kanban', 'calendar']} />
                        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
                            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
                            My tasks
                        </label>
                        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
                            <input type="checkbox" checked={teamScope} onChange={(e) => setTeamScope(e.target.checked)} />
                            Team view
                        </label>
                    <CrmButton
                        variant="primary"
                        onClick={() => { setDefaultColumnForNew('Open'); setIsCreating(true); }}
                        leftIcon={<Plus size={16} strokeWidth={2.5} />}
                    >
                        Create Task
                    </CrmButton>
                    </div>
                }
            />

            <CrmListToolbar
                filter={
                    <CRMFilterBar
                        module="activities"
                        filters={filters}
                        onChange={setFilters}
                        onClear={() => setFilters([])}
                        onPropertiesReady={setFilterProperties}
                    />
                }
                searchProps={{
                    placeholder: 'Search tasks…',
                    value: search,
                    onChange: (e) => setSearch(e.target.value),
                }}
            />

            <div className="flex flex-wrap items-center gap-2 shrink-0 px-0.5 pb-1">
                <span className="text-xs font-semibold text-[var(--text-muted)]">Show</span>
                {(
                    [
                        { id: 'all', label: 'All tasks' },
                        { id: 'overdue', label: 'Overdue' },
                        { id: 'escalated', label: 'Escalated' },
                    ] as const
                ).map((opt) => (
                    <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                            setLaneFilter(opt.id);
                            if (opt.id === 'all') setBulkStatus('Open');
                            else setBulkStatus(opt.id === 'overdue' ? 'Overdue' : 'Escalated');
                        }}
                        className={cn(
                            'rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors',
                            laneFilter === opt.id
                                ? opt.id === 'overdue'
                                    ? 'border-rose-300 bg-rose-50 text-rose-700'
                                    : opt.id === 'escalated'
                                        ? 'border-orange-300 bg-orange-50 text-orange-700'
                                        : 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                                : 'border-[var(--border-color)] bg-white text-[var(--text-main)] hover:bg-[var(--surface-dim)]',
                        )}
                    >
                        {opt.label}
                        {opt.id === 'overdue' ? ` (${tasks.filter(isTaskOverdue).length})` : ''}
                        {opt.id === 'escalated' ? ` (${tasks.filter(isTaskEscalated).length})` : ''}
                    </button>
                ))}
            </div>

            {isAdmin && (
                <div className="flex flex-wrap items-center gap-2 shrink-0 rounded-[var(--radius-md)] border border-border/60 bg-card px-3 py-2">
                    <span className="text-xs font-semibold text-text-muted">Bulk actions</span>
                    <button
                        type="button"
                        onClick={toggleSelectAllFiltered}
                        className="px-2.5 py-1.5 rounded-lg border border-border/60 text-xs font-semibold text-text-main hover:bg-surface-dim"
                    >
                        {filteredTaskIds.length > 0 && filteredTaskIds.every(id => selectedTaskIds.has(id))
                            ? 'Clear page'
                            : 'Select page'}
                    </button>
                    <span className="text-xs font-semibold text-primary">{selectedTaskIds.size} selected</span>
                    <select
                        value={bulkStatus}
                        onChange={(e) => setBulkStatus(e.target.value)}
                        className="h-8 rounded-lg border border-border/60 px-2.5 text-xs font-medium text-text-main bg-white"
                    >
                        {bulkSelectOptions.map((s) => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={handleBulkMove}
                        disabled={bulkApplying || selectedTaskIds.size === 0}
                        className="px-3 py-1.5 rounded-lg border border-border/60 text-xs font-semibold text-text-main hover:bg-surface-dim disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {bulkStatus === 'Overdue'
                            ? 'Mark overdue'
                            : bulkStatus === 'Escalated'
                                ? 'Mark escalated'
                                : 'Move selected'}
                    </button>
                    <button
                        type="button"
                        onClick={handleBulkDelete}
                        disabled={selectedTaskIds.size === 0 || bulkApplying}
                        className="px-3 py-1.5 rounded-lg border border-rose-200 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Delete selected
                    </button>
                </div>
            )}

            <div className="flex-1 min-h-0 relative overflow-auto">
                {loading ? (
                    <TaskBoardSkeleton />
                ) : viewMode === 'list' ? (
                    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white">
                        <table className="min-w-full text-sm">
                            <thead className="bg-[var(--surface-dim)] text-left text-xs font-semibold uppercase text-[var(--text-muted)]">
                                <tr>
                                    <th className="px-3 py-2">Title</th>
                                    <th className="px-3 py-2">Assignee</th>
                                    <th className="px-3 py-2">Status</th>
                                    <th className="px-3 py-2">Priority</th>
                                    <th className="px-3 py-2">Due</th>
                                    <th className="px-3 py-2">Related</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTasks.map((task) => (
                                    <tr
                                        key={task._id}
                                        className="cursor-pointer border-t border-[var(--border-color)] hover:bg-[var(--surface-dim)]/50"
                                        onClick={() => { setEditingTask(task); setIsEditingForm(false); }}
                                    >
                                        <td className="px-3 py-2 font-medium">{task.title}</td>
                                        <td className="px-3 py-2">{taskPersonLabel(task.assignee as TaskPerson) || '—'}</td>
                                        <td className="px-3 py-2">
                                            {isTaskEscalated(task)
                                                ? 'Escalated'
                                                : isTaskOverdue(task)
                                                    ? 'Overdue'
                                                    : normalizeTaskStatus(task.status)}
                                        </td>
                                        <td className="px-3 py-2">{task.metadata?.priority || '—'}</td>
                                        <td className="px-3 py-2">
                                            {task.metadata?.dueDate ? new Date(task.metadata.dueDate).toLocaleDateString() : '—'}
                                        </td>
                                        <td className="px-3 py-2 text-xs">
                                            {task.metadata?.relatedPropertyTitle || task.relatedType || '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredTasks.length === 0 ? (
                            <p className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">No tasks match these filters.</p>
                        ) : null}
                    </div>
                ) : viewMode === 'calendar' ? (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {filteredTasks
                            .filter((t) => t.metadata?.dueDate)
                            .sort((a, b) => new Date(a.metadata!.dueDate!).getTime() - new Date(b.metadata!.dueDate!).getTime())
                            .map((task) => (
                                <button
                                    key={task._id}
                                    type="button"
                                    onClick={() => { setEditingTask(task); setIsEditingForm(false); }}
                                    className={cn(
                                        'rounded-[var(--radius-md)] border p-3 text-left',
                                        isTaskEscalated(task)
                                            ? 'border-orange-200 bg-orange-50'
                                            : isTaskOverdue(task)
                                                ? 'border-rose-200 bg-rose-50'
                                                : 'border-[var(--border-color)] bg-white',
                                    )}
                                >
                                    <p className="text-[11px] font-semibold text-[var(--text-muted)]">
                                        {new Date(task.metadata!.dueDate!).toLocaleString()}
                                    </p>
                                    <p className="mt-1 text-sm font-semibold">{task.title}</p>
                                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                                        {taskPersonLabel(task.assignee as TaskPerson) || 'Unassigned'} · {task.metadata?.priority || 'Medium'}
                                    </p>
                                </button>
                            ))}
                        {filteredTasks.filter((t) => t.metadata?.dueDate).length === 0 ? (
                            <p className="text-sm text-[var(--text-muted)]">No dated tasks to show on the calendar.</p>
                        ) : null}
                    </div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={collisionDetection}
                        onDragEnd={handleDragEnd}
                    >
                        <CrmKanbanBoard className="!overflow-x-hidden gap-3 pr-1">
                            {TASK_COLUMNS.map((column) => (
                                <BoardColumn
                                    key={column.name}
                                    column={column}
                                    tasks={getTasksForColumn(column.name)}
                                    onTaskClick={(task) => { setEditingTask(task); setIsEditingForm(false); }}
                                    onAddClick={() => { setDefaultColumnForNew(column.name); setIsCreating(true); }}
                                    onDeleteTask={handleDeleteTask}
                                    onEditTask={(task) => { setEditingTask(task); setIsEditingForm(true); }}
                                    isAdmin={Boolean(isAdmin)}
                                    selectedIds={selectedTaskIds}
                                    onToggleSelect={toggleSelectTask}
                                />
                            ))}
                            <BoardColumn
                                column={{ name: 'Overdue' }}
                                tasks={overdueTasks}
                                onTaskClick={(task) => { setEditingTask(task); setIsEditingForm(false); }}
                                onAddClick={() => { setDefaultColumnForNew('Overdue'); setIsCreating(true); }}
                                onDeleteTask={handleDeleteTask}
                                onEditTask={(task) => { setEditingTask(task); setIsEditingForm(true); }}
                                isAdmin={Boolean(isAdmin)}
                                selectedIds={selectedTaskIds}
                                onToggleSelect={toggleSelectTask}
                            />
                            <BoardColumn
                                column={{ name: 'Escalated' }}
                                tasks={escalatedTasks}
                                onTaskClick={(task) => { setEditingTask(task); setIsEditingForm(false); }}
                                onAddClick={() => { setDefaultColumnForNew('Escalated'); setIsCreating(true); }}
                                onDeleteTask={handleDeleteTask}
                                onEditTask={(task) => { setEditingTask(task); setIsEditingForm(true); }}
                                isAdmin={Boolean(isAdmin)}
                                selectedIds={selectedTaskIds}
                                onToggleSelect={toggleSelectTask}
                            />
                        </CrmKanbanBoard>
                    </DndContext>
                )}
            </div>

            {isCreating && (
            <CrmJiraPortal>
                <CrmSlidePanelShell
                    isOpen={isCreating}
                    onClose={() => setIsCreating(false)}
                    title="New task"
                    subtitle="Create a new task and assign it to the board."
                >
                    <div className="mt-2 space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block text-xs font-semibold text-[var(--text-muted)]">
                                Related lead (optional)
                                <input
                                    value={relatedLeadId}
                                    onChange={(e) => setRelatedLeadId(e.target.value)}
                                    placeholder="Lead ObjectId"
                                    className="mt-1 h-9 w-full rounded-md border border-[var(--border-color)] px-2 text-sm font-normal text-[var(--text-main)]"
                                />
                            </label>
                            <label className="block text-xs font-semibold text-[var(--text-muted)]">
                                Related PM property (optional)
                                <select
                                    value={relatedListingId}
                                    onChange={(e) => setRelatedListingId(e.target.value)}
                                    className="mt-1 h-9 w-full rounded-md border border-[var(--border-color)] px-2 text-sm font-normal text-[var(--text-main)]"
                                >
                                    <option value="">None</option>
                                    {pmListings.map((p) => (
                                        <option key={p._id} value={p._id}>{p.title || p._id}</option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <ActivityLogger
                            onSave={handleSaveActivity}
                            fixedType="Task"
                            statuses={statusOptions}
                            initialData={{ status: defaultColumnForNew }}
                            submitLabel="Create task"
                            crmUsers={crmUsers}
                            defaultReporterId={defaultReporterId || undefined}
                            variant="hubspot"
                        />
                    </div>
                </CrmSlidePanelShell>
            </CrmJiraPortal>
            )}

            {editingTask && (
                <CrmCenterModalShell
                    isOpen={!!editingTask}
                    onClose={() => { setEditingTask(null); setIsEditingForm(false); }}
                    title={editingTask.title}
                    subtitle="Task"
                    maxWidthClass="max-w-2xl"
                    portal
                    zIndexClass="z-50"
                    footer={
                        <div className="flex w-full items-center justify-between gap-2">
                            <button
                                type="button"
                                onClick={() => handleDeleteTask(editingTask._id)}
                                className="text-sm font-medium text-[var(--error)] hover:underline"
                            >
                                Delete task
                            </button>
                            <div className="flex gap-2">
                                {!isEditingForm && (
                                    <button
                                        type="button"
                                        onClick={() => setIsEditingForm(true)}
                                        className="inline-flex h-8 items-center rounded-[var(--radius-md)] bg-[var(--primary)] px-4 text-sm font-medium text-white hover:bg-[var(--primary-dark)]"
                                    >
                                        Edit
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => { setEditingTask(null); setIsEditingForm(false); }}
                                    className="inline-flex h-8 items-center rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-4 text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--surface-dim)]"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    }
                >
                    {isEditingForm ? (
                        <ActivityLogger
                            key={editingTask._id}
                            onSave={handleUpdateActivity}
                            fixedType="Task"
                            initialData={{
                                ...editingTask,
                                status: isTaskEscalated(editingTask)
                                    ? 'Escalated'
                                    : isTaskOverdue(editingTask)
                                        ? 'Overdue'
                                        : normalizeTaskStatus(editingTask.status),
                            }}
                            statuses={statusOptions}
                            submitLabel="Save changes"
                            crmUsers={crmUsers}
                            variant="hubspot"
                        />
                    ) : (
                        <div className="min-w-0 max-w-full space-y-5">
                            <div className="grid min-w-0 grid-cols-2 gap-3">
                                {[
                                    ['Priority', editingTask.metadata?.priority || 'Medium'],
                                    ['Status', isTaskEscalated(editingTask)
                                        ? 'Escalated'
                                        : isTaskOverdue(editingTask)
                                            ? 'Overdue'
                                            : normalizeTaskStatus(editingTask.status)],
                                    ['Reporter', taskPersonLabel(editingTask.author as TaskPerson) || '—'],
                                    ['Assignee', taskPersonLabel(editingTask.assignee as TaskPerson) || 'Unassigned'],
                                ].map(([label, value]) => (
                                    <div key={label} className="min-w-0 space-y-1 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)] p-3">
                                        <p className="text-xs font-semibold text-[var(--text-muted)]">{label}</p>
                                        <p className="truncate text-sm font-medium text-[var(--text-main)]" title={String(value)}>{value}</p>
                                    </div>
                                ))}
                            </div>
                            <TaskDetailBody
                                task={editingTask}
                                crmUsers={crmUsers}
                                onPatch={handlePatchKeepOpen}
                                canManageTeam={Boolean(isAdmin || teamScope)}
                            />
                        </div>
                    )}
                </CrmCenterModalShell>
            )}
        </div>
    );
}
