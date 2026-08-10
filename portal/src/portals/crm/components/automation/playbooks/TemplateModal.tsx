"use client";

import { useState, useEffect } from 'react';
import { CrmJiraPortal } from '@/components/crm/shell/CrmJiraPortal';
import { crmModalChrome } from '@/lib/crm/chrome';
import { X, Save, FileText, Info, Loader2, Plus, Trash2, Clock, Mail, Phone, CheckSquare } from 'lucide-react';
import { CRM_API_URL } from '@/lib/crm/config';

interface OutreachStep {
  id: string;
  day: number;
  type: 'Email' | 'Task' | 'Call';
  subject?: string;
  content: string;
}

interface TemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  template?: any;
  onSuccess: () => void;
}

export default function TemplateModal({ isOpen, onClose, template, onSuccess }: TemplateModalProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<OutreachStep[]>([]);

  useEffect(() => {
    if (isOpen && template) {
      setName(template.name || '');
      // Ensure steps have 'id' property by mapping from '_id' if necessary (from backend)
      if (template.steps && Array.isArray(template.steps) && template.steps.length > 0) {
        const normalizedSteps = template.steps.map((s: any) => ({
          ...s,
          id: s.id || s._id || Math.random().toString(36).substr(2, 9)
        }));
        setSteps(normalizedSteps);
      } else {
        setSteps([
          { id: Math.random().toString(36).substr(2, 9), day: 1, type: 'Email', subject: '', content: '' }
        ]);
      }
    } else {
      setName('');
      setSteps([
        { id: Math.random().toString(36).substr(2, 9), day: 1, type: 'Email', subject: '', content: '' }
      ]);
    }
  }, [isOpen, template]);

  const addStep = () => {
    const lastDay = steps.length > 0 ? steps[steps.length - 1].day : 0;
    setSteps([
      ...steps,
      { id: Math.random().toString(36).substr(2, 9), day: lastDay + 2, type: 'Email', subject: '', content: '' }
    ]);
  };

  const removeStep = (id: string) => {
    setSteps(steps.filter(s => s.id !== id));
  };

  const updateStep = (id: string, updates: Partial<OutreachStep>) => {
    setSteps(steps.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) return alert('Please provide a template name');
    if (steps.length === 0) return alert('Please add at least one step');
    
    setLoading(true);
    const token = localStorage.getItem('token');
    
    try {
      // Stored as email-templates with type multi_step
      const url = template?._id 
        ? `${CRM_API_URL}/email-templates/${template._id}`
        : `${CRM_API_URL}/email-templates`;
      
      const method = template?._id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          name, 
          steps, 
          type: 'multi_step',
          // Compatibility for listing:
          subject: `Multi-step: ${name}`,
          body: `${steps.length} steps defined`
        })
      });

      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        const err = await res.json();
        alert(err.message || 'Failed to save template');
      }
    } catch (err) {
      console.error('Failed to save template:', err);
      alert('An error occurred while saving the template');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className={crmModalChrome.overlay}>
      <div className={crmModalChrome.backdrop} onClick={onClose} />
      <div className={`${crmModalChrome.slidePanel} max-w-4xl crm-modal`}>
        <div className={crmModalChrome.slideHeader}>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--primary-light)] text-[var(--primary)]">
              <FileText size={18} strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h2 className={crmModalChrome.slideTitle}>
                {template ? 'Edit multi-step template' : 'New multi-step template'}
              </h2>
              <p className={crmModalChrome.slideSubtitle}>Plan staged outreach; automation runs in Workflows</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className={crmModalChrome.closeBtn} aria-label="Close">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className={`${crmModalChrome.slideBody} space-y-6`}>
             <div className="space-y-2">
              <label className="text-xs font-black text-text-muted uppercase tracking-[0.2em] px-1">Template name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. LinkedIn Outreach V1"
                className="block w-full rounded-[var(--radius-md)] border-border bg-surface-dim/30 text-sm font-bold text-text-main focus:bg-card focus:border-primary/30 focus:ring-4 focus:ring-primary/5 h-12 border px-5 transition-all outline-none"
                required
              />
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-black text-text-muted uppercase tracking-[0.2em]">Outreach Steps</h3>
                <button 
                  type="button"
                  onClick={addStep}
                  className="flex items-center gap-1.5 text-xs font-black text-primary hover:text-primary-dark uppercase"
                >
                  <Plus size={14} /> Add Step
                </button>
              </div>

              <div className="space-y-4">
                {steps.map((step, index) => (
                  <div key={step.id} className="group relative bg-card border border-[var(--border-color)] rounded-[var(--crm-radius-ui)] p-6 shadow-sm hover:shadow-md transition-all border-l-4 border-l-primary/20 hover:border-l-primary">
                    <div className="flex items-start gap-6">
                      <div className="flex flex-col items-center gap-2">
                          <div className="w-10 h-10 rounded-full bg-surface-dim flex items-center justify-center text-text-muted text-xs font-black">
                              {index + 1}
                          </div>
                          <div className="h-full w-px bg-slate-100 flex-1 min-h-[40px]" />
                      </div>

                      <div className="flex-1 space-y-4">
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="flex items-center gap-2 bg-surface-dim px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--border-color)]">
                            <Clock size={12} className="text-text-muted" />
                            <span className="text-xs font-bold text-text-muted">Day</span>
                            <input 
                              type="number" 
                              min="1"
                              value={step.day}
                              onChange={(e) => updateStep(step.id, { day: parseInt(e.target.value) || 1 })}
                              className="w-10 bg-transparent text-xs font-black text-text-main outline-none focus:text-primary"
                            />
                          </div>

                          <div className="flex items-center gap-2 bg-surface-dim px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--border-color)]">
                            {step.type === 'Email' ? <Mail size={12} className="text-blue-500" /> : 
                             step.type === 'Call' ? <Phone size={12} className="text-orange-500" /> : 
                             <CheckSquare size={12} className="text-emerald-500" />}
                            <select 
                              value={step.type}
                              onChange={(e) => updateStep(step.id, { type: e.target.value as any })}
                              className="bg-transparent text-xs font-black text-text-main outline-none appearance-none cursor-pointer pr-4"
                            >
                              <option value="Email">Email</option>
                              <option value="Call">Phone Call</option>
                              <option value="Task">Task</option>
                            </select>
                          </div>

                          <button 
                            type="button"
                            onClick={() => removeStep(step.id)}
                            className="ml-auto p-2 opacity-0 group-hover:opacity-100 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-[var(--radius-md)] transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

                        {step.type === 'Email' && (
                          <input
                            type="text"
                            value={step.subject}
                            onChange={(e) => updateStep(step.id, { subject: e.target.value })}
                            placeholder="Email Subject"
                            className="block w-full rounded-[var(--radius-md)] border-border bg-surface-dim/30 text-xs font-bold text-text-main focus:bg-card focus:border-primary/30 h-10 border px-4 transition-all outline-none"
                          />
                        )}

                        <textarea
                          value={step.content}
                          onChange={(e) => updateStep(step.id, { content: e.target.value })}
                          placeholder={step.type === 'Email' ? "Email content..." : "Instructions / Script..."}
                          className="block w-full rounded-[var(--radius-md)] border-border bg-surface-dim/30 text-xs font-medium text-text-main focus:bg-card focus:border-primary/30 min-h-[80px] border px-4 py-3 transition-all outline-none leading-relaxed resize-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                
                {steps.length === 0 && (
                  <div className="py-12 border-2 border-dashed border-[var(--border-color)] rounded-[var(--crm-radius-ui)] flex flex-col items-center justify-center opacity-40">
                      <Plus size={32} className="text-text-muted mb-2" />
                      <p className="text-xs font-bold text-text-muted">No steps added yet</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-primary/5 rounded-[var(--crm-radius-ui)] p-5 flex items-start gap-4 border border-primary/10">
              <Info size={20} className="text-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-bold text-primary/80 leading-relaxed tracking-tight">
                  Multi-step templates outline your follow-ups. Use tags like <code className="bg-card px-1.5 py-0.5 rounded-md border border-primary/20 shadow-sm">{"{{firstName}}"}</code>. For automation, use CRM Workflows.
                </p>
              </div>
            </div>
          </div>

          <div className={crmModalChrome.slideFooter}>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--primary)] px-4 text-sm font-medium text-white hover:bg-[var(--primary-dark)] disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} strokeWidth={1.75} />}
              {template ? 'Update template' : 'Create template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return <CrmJiraPortal>{modalContent}</CrmJiraPortal>;
}
