
import React from 'react';
import { X, TrendingUp, BarChart3, PieChart, Activity, Users, DollarSign, LayoutGrid } from 'lucide-react';
import { CrmJiraPortal } from '@/components/crm/shell/CrmJiraPortal';
import { crmModalChrome } from '@/lib/crm/chrome';
import { cn } from '@/lib/utils';

interface WidgetGalleryProps {
 isOpen: boolean;
 onClose: () => void;
 onAdd: (type: string, component: string, title: string) => void;
 context?: 'dashboard' | 'reports';
}

const DASHBOARD_WIDGETS = [
 { id: 'sales-trend', type: 'chart', component: 'SalesTrend', title: 'Sales Performance', icon: <TrendingUp size={18} strokeWidth={1.75} />, description: 'Visualizes revenue and lead growth over time.' },
 { id: 'deals-stage', type: 'chart', component: 'DealsByStage', title: 'Pipeline Stages', icon: <BarChart3 size={18} strokeWidth={1.75} />, description: 'Current value of deals across different pipeline stages.' },
 { id: 'revenue-forecast', type: 'chart', component: 'ForecastedRevenue', title: 'Revenue Forecast', icon: <DollarSign size={18} strokeWidth={1.75} />, description: 'Projected revenue based on active deals.' },
 { id: 'recent-activities', type: 'list', component: 'RecentActivities', title: 'Recent Activities', icon: <Activity size={18} strokeWidth={1.75} />, description: 'A live feed of recent interactions and tasks.' },
];

const REPORT_WIDGETS = [
 { id: 'leads-status', type: 'chart', component: 'LeadsByStatus', title: 'Leads by Status', icon: <PieChart size={18} strokeWidth={1.75} />, description: 'Breakdown of leads by their current lifecycle stage.' },
 { id: 'activity-mix', type: 'chart', component: 'ActivityMix', title: 'Activity Mix', icon: <Activity size={18} strokeWidth={1.75} />, description: 'Distribution of notes, tasks, and calls.' },
 { id: 'top-agents', type: 'table', component: 'TopPerformers', title: 'Top Performers', icon: <Users size={18} strokeWidth={1.75} />, description: 'Leaderboard of sales representative performance.' },
 { id: 'deal-distribution', type: 'chart', component: 'DealDistribution', title: 'Deal Distribution', icon: <BarChart3 size={18} strokeWidth={1.75} />, description: 'Total value split by deal category.' },
];

export default function WidgetGallery({ isOpen, onClose, onAdd, context = 'dashboard' }: WidgetGalleryProps) {
 if (!isOpen) return null;

 const options = context === 'dashboard' ? DASHBOARD_WIDGETS : REPORT_WIDGETS;

 const panel = (
 <div className={cn(crmModalChrome.overlay, 'z-[100] flex items-stretch justify-end')}>
 <div className={crmModalChrome.backdrop} onClick={onClose} />
 <div className={cn(crmModalChrome.slidePanel, 'max-w-md crm-modal')}>
 <div className={crmModalChrome.slideHeader}>
 <div className="min-w-0 flex-1">
 <h2 className={crmModalChrome.slideTitle}>Widget gallery</h2>
 <p className={crmModalChrome.slideSubtitle}>Add dynamic visuals to your {context}.</p>
 </div>
 <button type="button" onClick={onClose} className={crmModalChrome.closeBtn} aria-label="Close">
 <X size={16} strokeWidth={1.75} />
 </button>
 </div>

 <div className={cn(crmModalChrome.slideBody, 'space-y-2')}>
 {options.map((widget) => (
 <button
 type="button"
 key={widget.id}
 className="group w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white p-4 text-left transition-colors hover:border-[var(--primary)] hover:bg-[var(--surface-dim)]"
 onClick={() => onAdd(widget.type, widget.component, widget.title)}
 >
 <div className="flex items-start gap-3">
 <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)] text-[var(--primary)]">
 {widget.icon}
 </div>
 <div className="min-w-0 flex-1">
 <h3 className="text-sm font-medium text-[var(--text-main)]">{widget.title}</h3>
 <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">{widget.description}</p>
 </div>
 <LayoutGrid size={14} className="mt-1 shrink-0 text-[var(--text-muted)] group-hover:text-[var(--primary)]" />
 </div>
 </button>
 ))}
 </div>

 <div className={cn(crmModalChrome.slideFooter, 'justify-center')}>
 <p className="text-center text-xs text-[var(--text-muted)]">
 More widgets are periodically added by the Mathionix team.
 </p>
 </div>
 </div>
 </div>
 );

 return <CrmJiraPortal>{panel}</CrmJiraPortal>;
}
