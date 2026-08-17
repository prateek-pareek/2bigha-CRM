"use client";

import { useState, useEffect, useMemo } from 'react';
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
    User,
} from 'lucide-react';
import CrmSlidePanelShell from '@/components/crm/shell/CrmSlidePanelShell';
import { CRM_API_URL } from '@/lib/crm/config';
import { getCrmAuthToken } from '@/lib/crm/api';
import ActivityLogger, { CrmPortalUserOption, formatCrmUserLabel } from '@/components/crm/inbox/ActivityLogger';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from "@/lib/utils";
import CRMFilterBar from '@/components/crm/segments/CRMFilterBar';
import { applyFilters, FilterCriteria, FilterProperty } from '@/lib/crm/filter-config';
import {
  CrmPageHeader,
  CrmButton,
  CrmCountBadge,
  CrmListToolbar,
  CrmKanbanBoard,
  CrmKanbanColumn,
  CrmKanbanCard,
  CrmKanbanCardHead,
  CrmKanbanMetaRow,
  CrmKanbanMetaList,
  CrmKanbanCardFooter,
  CrmKanbanAvatar,
  crmKanbanAvatarTone,
} from '@/components/crm/ui';
import { CRM_LIST_PAGE } from '@/lib/crm/ui';
import { crmStageAccent } from '@/lib/crm/stage-accent';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    useDroppable,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const TASK_COLUMNS = [
    { name: 'Backlog' },
    { name: 'To Do' },
    { name: 'In Progress' },
    { name: 'Done' },
];

type TaskPerson = CrmPortalUserOption & { fullName?: string; name?: string };

interface Task {
    _id: string;
    type: string;
    title: string;
    content: string;
    createdAt: string;
    status: string;
    metadata?: { priority?: string; dueDate?: string };
    author?: TaskPerson | string;
    assignee?: TaskPerson | string;
}

function taskPersonLabel(p: TaskPerson | string | undefined): string {
    if (!p) return '';
    if (typeof p === 'string') return '';
    return formatCrmUserLabel(p);
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

/** Due date has passed and the task isn't already in the terminal "Done" column. */
function isTaskOverdue(task: Task): boolean {
    const due = task.metadata?.dueDate;
    if (!due || task.status === 'Done') return false;
    const dueDate = new Date(due);
    if (Number.isNaN(dueDate.getTime())) return false;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return dueDate.getTime() < startOfToday.getTime();
}

function TaskCard({ task, onClick, onDelete, onEdit }: { task: Task; onClick: () => void; onDelete: () => void; onEdit: () => void }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({
        id: task._id,
        data: { type: 'Task', task }
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 100 : 1,
        ['--crm-stage-accent' as string]: crmStageAccent(task.status || 'Backlog'),
    };

    const overdue = isTaskOverdue(task);
    const assigneeLabel = taskPersonLabel(task.assignee as TaskPerson);

    return (
        <CrmKanbanCard
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={onClick}
            stageKey={task.status || 'Backlog'}
            className={cn(
                'cursor-grab active:cursor-grabbing transition-[transform,box-shadow,opacity] duration-150',
                isDragging
                    ? 'rotate-1 scale-[1.03] opacity-95 shadow-2xl ring-2 ring-[var(--primary)]/30'
                    : overdue && 'ring-1 ring-rose-200',
            )}
        >
            <CrmKanbanCardHead
                initials={(task.title?.[0] || 'T').toUpperCase()}
                title={<span className="line-clamp-2 whitespace-normal">{task.title || 'Untitled Task'}</span>}
                trailing={
                    <GripVertical
                        aria-label="Drag to move task"
                        className="h-3.5 w-3.5 text-[var(--text-muted)]/40 group-hover:text-[var(--text-muted)] transition-colors shrink-0"
                    />
                }
            />
            {task.content ? (
                <CrmKanbanMetaList>
                    <CrmKanbanMetaRow>
                        <span className="line-clamp-2 whitespace-normal text-[var(--text-muted)]">
                            {task.content?.replace(/<[^>]*>?/gm, '')}
                        </span>
                    </CrmKanbanMetaRow>
                </CrmKanbanMetaList>
            ) : null}
            <CrmKanbanCardFooter
                left={
                    <div className="flex items-center gap-2 min-w-0">
                        <span title={assigneeLabel || 'Unassigned'} className="shrink-0">
                            <CrmKanbanAvatar
                                size="sm"
                                tone={assigneeLabel ? crmKanbanAvatarTone(assigneeLabel) : undefined}
                                className={!assigneeLabel ? 'border-dashed text-[var(--text-muted)]/60' : undefined}
                            >
                                {taskPersonInitials(task.assignee as TaskPerson) || <User size={11} strokeWidth={2} />}
                            </CrmKanbanAvatar>
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                            {task.metadata?.priority && (
                                <span className={cn(
                                    "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                                    task.metadata.priority === 'High' ? "bg-rose-100 text-rose-600" :
                                        task.metadata.priority === 'Medium' ? "bg-amber-100 text-amber-600" :
                                            "bg-emerald-100 text-emerald-600"
                                )}>
                                    {task.metadata.priority}
                                </span>
                            )}
                            {task.metadata?.dueDate && (
                                <span className={cn(
                                    "text-[10px] font-semibold inline-flex items-center gap-1",
                                    overdue ? "text-rose-600" : "text-[var(--text-muted)]",
                                )}>
                                    {overdue ? <AlertTriangle size={11} strokeWidth={2.25} /> : <Calendar size={11} strokeWidth={2} />}
                                    {new Date(task.metadata.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </span>
                            )}
                        </div>
                    </div>
                }
                actions={
                    <div className="crm-kanban-card-actions" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} className="crm-kanban-card-action">
                            <Edit2 size={12} strokeWidth={2.25} />
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="crm-kanban-card-action hover:!text-rose-600">
                            <Trash2 size={12} strokeWidth={2.25} />
                        </button>
                    </div>
                }
            />
        </CrmKanbanCard>
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
        data: { type: 'Column', columnName: column.name }
    });

    const overdueCount = tasks.filter(isTaskOverdue).length;

    return (
        <CrmKanbanColumn
            title={column.name}
            stageKey={column.name}
            summary={
                <span className="inline-flex items-center gap-1.5">
                    <span>{tasks.length} task{tasks.length === 1 ? '' : 's'}</span>
                    {overdueCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">
                            <AlertTriangle size={10} strokeWidth={2.5} />
                            {overdueCount} overdue
                        </span>
                    )}
                </span>
            }
            onAdd={onAddClick}
            style={{ minHeight: 320 }}
            className={cn(isOver && 'ring-2 ring-primary/30')}
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
                        <Clock size={22} className="opacity-50 group-hover:opacity-100" strokeWidth={1.5} />
                        <p className="text-xs font-bold">No tasks yet</p>
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold opacity-0 transition-opacity group-hover:opacity-100">
                            <Plus size={12} strokeWidth={3} /> Add task
                        </span>
                    </button>
                ) : (
                    <SortableContext items={tasks.map(t => t._id)} strategy={verticalListSortingStrategy}>
                        {tasks.map((task) => (
                            <div key={task._id} className="relative">
                                {isAdmin && (
                                    <label
                                        className="absolute left-2 top-2 z-20 inline-flex items-center gap-1 rounded-md bg-white/95 px-1.5 py-1 border border-border/60 shadow-sm"
                                        onClick={(e) => e.stopPropagation()}
                                        onPointerDown={(e) => e.stopPropagation()}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(task._id)}
                                            onChange={() => onToggleSelect(task._id)}
                                            className="h-3.5 w-3.5 accent-primary cursor-pointer"
                                            aria-label={`Select task ${task.title || task._id}`}
                                        />
                                    </label>
                                )}
                                <TaskCard
                                    task={task}
                                    onClick={() => onTaskClick(task)}
                                    onDelete={() => onDeleteTask(task._id)}
                                    onEdit={() => onEditTask(task)}
                                />
                            </div>
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
        <div className="flex h-full items-start gap-4 overflow-x-auto pb-4">
            {TASK_COLUMNS.map((column) => (
                <div
                    key={column.name}
                    className="flex w-[300px] max-w-[300px] shrink-0 flex-col gap-3 rounded-[5px] border border-[var(--border-color)] p-2"
                >
                    <div className="h-14 animate-pulse rounded-[5px] bg-[var(--surface-dim)]" />
                    {[0, 1].map((i) => (
                        <div
                            key={i}
                            className="h-28 animate-pulse rounded-[5px] border border-[var(--border-color)] bg-[var(--surface-dim)]"
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
    const [defaultColumnForNew, setDefaultColumnForNew] = useState<string>('Backlog');
    const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
    const [bulkStatus, setBulkStatus] = useState<string>('Backlog');
    const [bulkApplying, setBulkApplying] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const fetchTasks = async () => {
        setLoading(true);
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${CRM_API_URL}/crm/activities?type=Task`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setTasks(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to fetch tasks', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTasks();
    }, []);

    useEffect(() => {
        const token = getCrmAuthToken();
        if (!token) return;
        void fetch(`${CRM_API_URL}/crm-users/list/crm-portal`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => r.json())
            .then((data) => {
                if (Array.isArray(data)) setCrmUsers(data);
            })
            .catch(() => {});
    }, []);

    const filteredTasks = applyFilters(tasks, filters, filterProperties).filter(t =>
        !search.trim() ||
        (t.title || '').toLowerCase().includes(search.toLowerCase()) ||
        (t.content || '').toLowerCase().includes(search.toLowerCase())
    );

    useEffect(() => {
        setSelectedTaskIds(prev => {
            if (prev.size === 0) return prev;
            const validIds = new Set(filteredTasks.map(t => t._id));
            const next = new Set<string>();
            prev.forEach((id) => {
                if (validIds.has(id)) next.add(id);
            });
            return next;
        });
    }, [filteredTasks]);

    const filteredTaskIds = useMemo(() => filteredTasks.map(t => t._id), [filteredTasks]);

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
        const validStatuses = TASK_COLUMNS.map(c => c.name);
        return filteredTasks.filter(t => {
            const s = t.status || 'Backlog';
            return validStatuses.includes(s) ? s === columnName : columnName === 'Backlog';
        });
    };

    const handleSaveActivity = async (payload: any) => {
        const token = localStorage.getItem('token');
        const body = {
            ...payload,
            type: 'Task',
            status: payload.status || defaultColumnForNew,
        };
        const res = await fetch(`${CRM_API_URL}/crm/activities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body)
        });
        if (res.ok) {
            fetchTasks();
            setIsCreating(false);
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

    const handleBulkMove = async () => {
        if (!isAdmin || selectedTaskIds.size === 0) return;
        const token = localStorage.getItem('token');
        setBulkApplying(true);
        try {
            const ids = Array.from(selectedTaskIds);
            await Promise.all(
                ids.map((id) =>
                    fetch(`${CRM_API_URL}/crm/activities/${id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ status: bulkStatus }),
                    }),
                ),
            );
            await fetchTasks();
            setSelectedTaskIds(new Set());
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

        let newStatus = task.status;
        const validStatuses = TASK_COLUMNS.map(c => c.name);
        const overData = over.data.current;

        if (overData?.type === 'Column' && overData.columnName) {
            newStatus = overData.columnName;
        } else if (overData?.type === 'Task' && overData.task) {
            newStatus = (overData.task as Task).status;
        } else if (validStatuses.includes(String(over.id))) {
            newStatus = over.id as string;
        }
        if (!validStatuses.includes(newStatus)) newStatus = 'Backlog';

        if (task.status !== newStatus) {
            const prevStatus = task.status;
            setTasks(prev => prev.map(t => t._id === taskId ? { ...t, status: newStatus } : t));
            const token = localStorage.getItem('token');
            try {
                const res = await fetch(`${CRM_API_URL}/crm/activities/${taskId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ status: newStatus })
                });
                if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
            } catch (err) {
                console.error(err);
                setTasks(prev => prev.map(t => t._id === taskId ? { ...t, status: prevStatus } : t));
                await fetchTasks();
            }
        }
    };

    const statusOptions = TASK_COLUMNS.map(c => c.name);

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
                description="Manage CRM tasks across Backlog, To Do, In Progress, and Done"
                actions={
                    <CrmButton
                        variant="primary"
                        onClick={() => { setDefaultColumnForNew('Backlog'); setIsCreating(true); }}
                        leftIcon={<Plus size={16} strokeWidth={2.5} />}
                    >
                        Create Task
                    </CrmButton>
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
                        {statusOptions.map((s) => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={handleBulkMove}
                        disabled={selectedTaskIds.size === 0 || bulkApplying}
                        className="px-3 py-1.5 rounded-lg border border-border/60 text-xs font-semibold text-text-main hover:bg-surface-dim disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Move selected
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

            <div className="flex-1 min-h-0 relative">
                {loading ? (
                    <TaskBoardSkeleton />
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <CrmKanbanBoard>
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
                    <div className="mt-2">
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
                    maxWidthClass="max-w-xl"
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
                            initialData={editingTask}
                            statuses={statusOptions}
                            submitLabel="Save changes"
                            crmUsers={crmUsers}
                            variant="hubspot"
                        />
                    ) : (
                        <div className="space-y-5">
                            <div className="space-y-2">
                                <h3 className="text-xs font-semibold text-[var(--text-muted)]">Description</h3>
                                <div className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)] p-4 text-sm leading-relaxed text-[var(--text-main)]">
                                    {editingTask.content?.replace(/<[^>]*>?/gm, '') || 'No description.'}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    ['Priority', editingTask.metadata?.priority || 'Medium'],
                                    ['Status', editingTask.status || 'Backlog'],
                                    ['Reporter', taskPersonLabel(editingTask.author as TaskPerson) || '—'],
                                    ['Assignee', taskPersonLabel(editingTask.assignee as TaskPerson) || 'Unassigned'],
                                ].map(([label, value]) => (
                                    <div key={label} className="space-y-1 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)] p-3">
                                        <p className="text-xs font-semibold text-[var(--text-muted)]">{label}</p>
                                        <p className="text-sm font-medium text-[var(--text-main)]">{value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CrmCenterModalShell>
            )}
        </div>
    );
}
