"use client";

import { useState, useEffect, useMemo } from 'react';
import { History } from 'lucide-react';
import { toast } from 'sonner';
import { CRM_API_URL } from '@/lib/crm/config';
import ActivityTimeline from '@/components/crm/inbox/ActivityTimeline';
import { useAuthStore } from '@/store/pm/auth-store';
import { isAdmin } from '@/lib/suite/auth';
import ActivityLogger from '@/components/crm/inbox/ActivityLogger';
import CRMFilterBar from '@/components/crm/segments/CRMFilterBar';
import { applyFilters, FilterCriteria, FilterProperty } from '@/lib/crm/filter-config';
import { cn } from '@/lib/utils';
import { CRM_LIST_PAGE, CRM_PANEL } from '@/lib/crm/ui';
import { CrmPageHeader, CrmCountBadge } from '@/components/crm/ui';

interface Call {
 _id: string;
 type: string;
 title: string;
 content: string;
 createdAt: string;
 metadata?: {
 type?: string; // Inbound, Outbound
 duration?: number; // Seconds
 status?: string; // Completed, Missed, etc.
 from?: string;
 to?: string;
 };
 author?: {
 name: string;
 };
}

export default function CallsPage() {
 const { user } = useAuthStore();
 const allowActivityDelete = isAdmin(user as any);
 const [calls, setCalls] = useState<Call[]>([]);
 const [loading, setLoading] = useState(true);
 const [filters, setFilters] = useState<FilterCriteria[]>([]);
 const [filterProperties, setFilterProperties] = useState<FilterProperty[]>([]);

 const fetchCalls = async () => {
 setLoading(true);
 const token = localStorage.getItem('token');
 try {
 const res = await fetch(`${CRM_API_URL}/crm/activities?type=Call`, {
 headers: { 'Authorization': `Bearer ${token}` }
 });
 const data = await res.json();
 const callList = Array.isArray(data) ? data : data.data || [];
 setCalls(callList);
 } catch (err) {
 console.error('Failed to fetch calls', err);
 } finally {
 setLoading(false);
 }
 };

 useEffect(() => { fetchCalls(); }, []);

 const handleSaveActivity = async (payload: any) => {
 const token = localStorage.getItem('token');
 const res = await fetch(`${CRM_API_URL}/crm/activities`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
 body: JSON.stringify(payload)
 });
 if (res.ok) fetchCalls();
 };

 const handleDelete = async (id: string) => {
 if (!confirm('Permanently remove this call log?')) return;
 const token = localStorage.getItem('token');
 const res = await fetch(`${CRM_API_URL}/crm/activities/${id}`, {
 method: 'DELETE',
 headers: { Authorization: `Bearer ${token}` }
 });
 if (res.status === 403) {
 toast.error('Only administrators can delete activities');
 return;
 }
 if (!res.ok) {
 toast.error('Could not delete this activity');
 return;
 }
 setCalls(calls.filter(c => c._id !== id));
 };

 const filteredCalls = useMemo(() => {
 return applyFilters(calls, filters, filterProperties);
 }, [calls, filters, filterProperties]);

 return (
 <div className={cn(CRM_LIST_PAGE, 'overflow-auto')}>
 <CrmPageHeader
 bordered={false}
 title="Comms Center"
 badge={<CrmCountBadge>{filteredCalls.length}</CrmCountBadge>}
 description="Review communication velocity and stakeholder engagement levels."
 breadcrumbs={[
 { label: 'Home', href: '/crm/workspace/summary' },
 { label: 'Calls' },
 ]}
 actions={
 <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-2 text-xs font-medium text-[var(--text-muted)]">
 <History size={14} className="text-[var(--primary)]" />
 Engagement Feed
 </div>
 }
 />

 <div className="mb-4 shrink-0">
 <ActivityLogger onSave={handleSaveActivity} relatedType="General" fixedType="Call" />
 </div>

 <div className="mb-4 flex min-h-0 flex-1 flex-col gap-4">
 <div className="flex items-center gap-4">
 <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-100 to-transparent" />
 <span className="text-xs font-semibold text-text-muted uppercase tracking-[0.2em]">Timeline History</span>
 <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-100 to-transparent" />
 </div>

 <div className={cn(CRM_PANEL, 'p-4')}>
 <CRMFilterBar
 module="activities"
 filters={filters}
 onChange={setFilters}
 onClear={() => setFilters([])}
 onPropertiesReady={setFilterProperties}
 />
 </div>

 <ActivityTimeline
 activities={filteredCalls}
 loading={loading}
 onDelete={handleDelete}
 allowDelete={allowActivityDelete}
 />
 </div>
 </div>
 );
}
