"use client";

import React, { useState, useEffect } from 'react';
import { CrmJiraPortal } from '@/components/crm/shell/CrmJiraPortal';
import { X, Calendar, Clock, Video, MapPin, Loader2, Save } from 'lucide-react';
import Draggable from 'react-draggable';
import { CRM_API_URL } from '@/lib/crm/config';
import { toast } from 'sonner';
import { DatePickerField, formatDateOnly } from '@/components/ui/date-picker';

function relatedTypeFromModule(module: string): string {
  const m = (module || "").toLowerCase();
  if (m === "leads" || m === "lead") return "Lead";
  if (m === "deals" || m === "deal") return "Deal";
  if (m === "contacts" || m === "contact") return "Contact";
  if (m === "clients" || m === "client") return "Client";
  if (m === "organizations" || m === "organization") return "Organization";
  if (m === "platform-opportunities" || m === "platform_opportunities")
    return "PlatformOpportunity";
  return "Contact";
}

interface ScheduleMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityId: string;
  module: string;
  recipientName?: string;
  onSuccess?: () => void;
}

export default function ScheduleMeetingModal({
  isOpen,
  onClose,
  entityId,
  module,
  recipientName,
  onSuccess
}: ScheduleMeetingModalProps) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(formatDateOnly(new Date()));
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState('30');
  const [location, setLocation] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const nodeRef = React.useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(`Meeting with ${recipientName || 'Contact'}`);
      setDate(formatDateOnly(new Date()));
    }
  }, [isOpen, recipientName]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const fieldClass = 'w-full h-10 bg-white border border-[var(--border-color)] rounded-md py-1.5 px-3 text-sm font-normal text-[var(--text-main)] outline-none transition-all placeholder:text-[var(--primary-muted)] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30';
  const labelClass = 'text-sm font-semibold text-[var(--text-main)] mb-1.5 block';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const token = localStorage.getItem('token');
    const scheduledAt = new Date(`${date}T${time}`);

    try {
      if (Number.isNaN(scheduledAt.getTime())) {
        throw new Error('Please select a valid meeting date and time');
      }
      const res = await fetch(`${CRM_API_URL}/crm/activities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          relatedTo: entityId,
          relatedType: relatedTypeFromModule(module),
          type: 'Meeting',
          title: title,
          content: description || title,
          metadata: {
            title,
            date,
            time,
            duration,
            location,
            meetingLink,
            dueDate: scheduledAt.toISOString(),
            isCalendarEvent: true,
            eventCategory: 'meeting',
          }
        })
      });

      if (res.ok) {
        toast.success('Meeting scheduled and added to your calendar');
        onSuccess?.();
        onClose();
      } else {
        const err = await res.json();
        throw new Error(err.message || 'Failed to schedule meeting');
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to schedule meeting');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-text-main/45 px-4 py-6 animate-in fade-in duration-200"
      role="presentation"
      onClick={onClose}
    >
      <Draggable nodeRef={nodeRef} handle=".drag-handle" cancel="input,textarea,button,select,[role='combobox']">
        <div
          ref={nodeRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="schedule-meeting-title"
          className="relative my-[4vh] w-full max-w-2xl max-h-[min(90vh,920px)] rounded-md border border-[var(--border-color)] bg-white shadow-lg overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-3 duration-300 flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="drag-handle shrink-0 cursor-grab active:cursor-grabbing border-b border-[var(--border-color)] bg-[var(--background)] px-6 py-5 sm:px-8 sm:py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white border border-[var(--border-color)] text-[var(--text-main)] shadow-sm">
                  <Calendar size={18} />
                </div>
                <div className="min-w-0">
                  <h2
                    id="schedule-meeting-title"
                    className="text-[16px] font-bold tracking-tight text-[var(--text-main)]"
                  >
                    Schedule a meeting
                  </h2>
                  <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                    Set time, place, and link for {recipientName || 'this contact'}.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-md p-2 text-[var(--primary-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)] transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 sm:px-8 sm:py-7 custom-scrollbar">
            <form id="meeting-form" onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className={labelClass}>Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Discovery call, demo walkthrough…"
                  className={fieldClass}
                  required
                />
              </div>

              <div className="p-5 rounded-md border border-[var(--border-color)] bg-[var(--background)] space-y-4">
                <p className="text-sm font-bold text-[var(--text-main)]">When</p>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Date</label>
                    <DatePickerField
                      value={date}
                      onChange={setDate}
                      placeholder="Pick a date"
                      buttonClassName={`flex justify-start items-center ${fieldClass}`}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Start time</label>
                    <div className="relative">
                      <Clock size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--primary-muted)]" />
                      <input
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        className={`${fieldClass} pl-9`}
                        required
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Duration</label>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className={`${fieldClass} cursor-pointer`}
                  >
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="45">45 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="90">1.5 hours</option>
                    <option value="120">2 hours</option>
                  </select>
                </div>
              </div>

              <div className="p-5 rounded-md border border-[var(--border-color)] bg-[var(--background)] space-y-4">
                <p className="text-sm font-bold text-[var(--text-main)]">Where and link</p>
                <div>
                  <label className={labelClass}>Location or room</label>
                  <div className="relative">
                    <MapPin size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--primary-muted)]" />
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Office, address, or room name…"
                      className={`${fieldClass} pl-9`}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Video link</label>
                  <div className="relative">
                    <Video size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--hs-link)]" />
                    <input
                      type="url"
                      value={meetingLink}
                      onChange={(e) => setMeetingLink(e.target.value)}
                      placeholder="https://meet.google.com/… or Teams / Zoom URL"
                      className={`${fieldClass} pl-9 border-[var(--hs-link)]/30`}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className={labelClass}>Notes or agenda</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Context, agenda bullets, or outcomes you want logged…"
                  className={`${fieldClass} min-h-[140px] resize-y py-2.5`}
                />
              </div>
            </form>
          </div>

          <div className="shrink-0 flex items-center justify-end gap-3 border-t border-[var(--border-color)] bg-[var(--background)] px-6 py-4 sm:px-8">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-md border border-[var(--border-color)] bg-white text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--surface-dim)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="meeting-form"
              disabled={saving}
              className="px-4 py-2 rounded-md bg-[var(--hs-link)] text-white text-sm font-semibold hover:bg-[var(--hs-link-hover)] transition-colors flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  Save to timeline
                </>
              )}
            </button>
          </div>
        </div>
      </Draggable>
    </div>
  );

  return <CrmJiraPortal>{modalContent}</CrmJiraPortal>;
}
