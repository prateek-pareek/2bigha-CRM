"use client";

import React, { useState, useEffect } from "react";
import { getCrmAuthToken } from "@/lib/crm/api";
import { CRM_API_URL } from "@/lib/crm/config";
import { DashboardShell } from "@/components/crm/dashboards/DashboardShell";
import { toast } from "sonner";
import { Trash2, Calendar, Mail, Clock, FileSpreadsheet } from "lucide-react";
import { format } from "date-fns";

type ReportSchedule = {
  _id: string;
  reportType: "agent" | "team";
  frequency: "daily" | "weekly" | "monthly";
  emailRecipients: string[];
  filters: Record<string, any>;
  lastSentAt?: string;
  createdAt: string;
};

export default function ScheduledReportsPage() {
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedules = () => {
    setLoading(true);
    const token = getCrmAuthToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(`${CRM_API_URL}/crm/reports/schedules`, { headers })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load schedules");
        return r.json();
      })
      .then((data) => {
        setSchedules(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
        console.error(err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  const handleDelete = async (scheduleId: string) => {
    if (!window.confirm("Are you sure you want to delete this scheduled report?")) return;

    const token = getCrmAuthToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      const res = await fetch(`${CRM_API_URL}/crm/reports/schedules/${scheduleId}`, {
        method: 'DELETE',
        headers
      });
      if (!res.ok) throw new Error("Failed to delete schedule");
      
      toast.success("Schedule deleted successfully");
      setSchedules(schedules.filter(s => s._id !== scheduleId));
    } catch (err: any) {
      toast.error(err.message || "Failed to delete schedule");
      console.error(err);
    }
  };

  const getFrequencyLabel = (freq: string) => {
    switch(freq) {
      case 'daily': return 'Daily (8:00 AM)';
      case 'weekly': return 'Weekly (Mondays 8:00 AM)';
      case 'monthly': return 'Monthly (1st at 8:00 AM)';
      default: return freq;
    }
  };

  return (
    <DashboardShell
      title="Scheduled Reports"
      description="Manage automated email deliveries for your performance reports."
    >
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] shadow-[var(--crm-shadow-raised)] overflow-hidden">
        
        {loading ? (
          <div className="p-8 text-center text-[var(--text-muted)] animate-pulse">
            Loading schedules...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-500">
            {error}
            <br />
            <button onClick={fetchSchedules} className="mt-4 text-sm underline hover:text-red-700">Try Again</button>
          </div>
        ) : schedules.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-dim)]">
              <Calendar className="h-8 w-8 text-[var(--text-muted)]" />
            </div>
            <h3 className="text-lg font-semibold text-[var(--text-main)]">No Scheduled Reports</h3>
            <p className="mt-2 text-sm text-[var(--text-muted)] max-w-md mx-auto">
              You haven't set up any automated email reports yet. Go to Agent Performance or Team & Organizations to schedule a report.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-[var(--text-main)]">
              <thead className="bg-[var(--surface-dim)] text-xs uppercase text-[var(--text-muted)] border-b border-[var(--border-color)]">
                <tr>
                  <th className="px-6 py-4 font-semibold">Report Details</th>
                  <th className="px-6 py-4 font-semibold">Frequency</th>
                  <th className="px-6 py-4 font-semibold">Recipients</th>
                  <th className="px-6 py-4 font-semibold">Last Sent</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {schedules.map((schedule) => (
                  <tr key={schedule._id} className="hover:bg-[var(--surface-dim)] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                          <FileSpreadsheet size={20} />
                        </div>
                        <div>
                          <div className="font-semibold text-[var(--text-main)]">
                            {schedule.reportType === 'agent' ? 'Agent Performance' : 'Team & Organizations'}
                          </div>
                          <div className="text-xs text-[var(--text-muted)] mt-0.5">
                            Created {format(new Date(schedule.createdAt), "MMM d, yyyy")}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Clock size={14} className="text-[var(--text-muted)]" />
                        <span className="font-medium">{getFrequencyLabel(schedule.frequency)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        {schedule.emailRecipients.map((email, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-[var(--text-muted)]">
                            <Mail size={12} />
                            <span>{email}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-[var(--text-muted)]">
                      {schedule.lastSentAt ? format(new Date(schedule.lastSentAt), "MMM d, yyyy h:mm a") : 'Never'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDelete(schedule._id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                        title="Delete Schedule"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
