"use client";

import { useState, useEffect } from 'react';
import { CrmJiraPortal } from '@/components/crm/CrmJiraPortal';
import { Loader2, Save, Info } from 'lucide-react';
import { CRM_API_URL } from '@/lib/api/config';
import CrmSlidePanelShell from '@/components/crm/CrmSlidePanelShell';

const LBL = 'block text-sm font-semibold text-[var(--text-muted)] mb-1.5';
const INP =
  'w-full h-10 bg-white border border-[var(--border-color)] rounded-md px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--primary-muted)] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all';
const SEL =
  'w-full h-10 bg-white border border-[var(--border-color)] rounded-md px-3 text-sm text-[var(--text-main)] outline-none cursor-pointer focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all appearance-none';

interface CustomFieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  field?: any;
}

export default function CustomFieldModal({ isOpen, onClose, onSuccess, field }: CustomFieldModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    key: '',
    type: 'text',
    module: 'leads',
    required: false,
    description: '',
    options: '',
  });

  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: field?.name || '',
        key: field?.key || '',
        type: field?.type || 'text',
        module: field?.module || 'leads',
        required: field?.required || false,
        description: field?.description || '',
        options: field?.options?.join(', ') || '',
      });
    }
  }, [isOpen, field]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const token = localStorage.getItem('token');
    const payload = {
      ...formData,
      options: formData.options.split(',').map((o: string) => o.trim()).filter(Boolean),
      key: formData.key || formData.name.toLowerCase().replace(/\s+/g, '_'),
    };

    try {
      const url = field ? `${CRM_API_URL}/custom-fields/${field._id}` : `${CRM_API_URL}/custom-fields`;
      const res = await fetch(url, {
        method: field ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) { onSuccess(); onClose(); }
    } catch (err) {
      console.error('Failed to save custom field:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const panel = (
    <CrmSlidePanelShell
      isOpen={isOpen}
      onClose={onClose}
      title={field ? 'Edit property' : 'New property'}
      subtitle="Define how data is collected for your CRM records."
      headerTone="hubspot"
      footer={
        <button
          form="custom-field-form"
          type="submit"
          disabled={loading}
          className="w-full py-3.5 bg-[var(--hs-link)] text-white rounded-md text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[var(--hs-link-hover)] transition-colors shadow-sm disabled:opacity-50"
        >
          {loading ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
          {loading ? 'Saving…' : field ? 'Save changes' : 'Create property'}
        </button>
      }
    >
      <div className="flex flex-col justify-center h-full">
        <form id="custom-field-form" onSubmit={handleSubmit} className="space-y-6">

          {/* Object type + Field type */}
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className={LBL}>Object type</label>
              <select
                value={formData.module}
                onChange={(e) => setFormData({ ...formData, module: e.target.value })}
                className={SEL}
              >
                <option value="leads">Leads</option>
                <option value="deals">Deals</option>
                <option value="contacts">Contacts</option>
                <option value="organizations">Organizations</option>
              </select>
            </div>
            <div>
              <label className={LBL}>Field type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className={SEL}
              >
                <option value="text">Single line text</option>
                <option value="number">Number</option>
                <option value="date">Date picker</option>
                <option value="url">URL (opens as link)</option>
                <option value="select">Dropdown (single)</option>
                <option value="multiselect">Dropdown (multi-select)</option>
                <option value="checkbox">Checkbox</option>
              </select>
            </div>
          </div>

          {/* Field label */}
          <div>
            <label className={LBL}>Field label <span className="text-[#f2545b]">*</span></label>
            <input
              type="text"
              placeholder="e.g. Budget Amount"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={INP}
              required
            />
          </div>

          {/* Internal key */}
          <div>
            <label className={`${LBL} flex items-center gap-1.5`}>
              Internal key
              <div className="group relative inline-flex">
                <Info size={12} className="text-[var(--primary-muted)] cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-[var(--text-main)] text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity w-40 pointer-events-none text-center z-10">
                  Used for API and exports. Auto-generated if empty.
                </div>
              </div>
            </label>
            <input
              type="text"
              placeholder="e.g. budget_amount"
              value={formData.key}
              onChange={(e) => setFormData({ ...formData, key: e.target.value })}
              className={`${INP} font-mono`}
            />
          </div>

          {/* Options (select/multiselect only) */}
          {(formData.type === 'select' || formData.type === 'multiselect') && (
            <div className="animate-in slide-in-from-top-2">
              <label className={LBL}>Options <span className="font-normal text-[var(--primary-muted)]">(comma separated)</span></label>
              <input
                type="text"
                placeholder="Low, Medium, High"
                value={formData.options}
                onChange={(e) => setFormData({ ...formData, options: e.target.value })}
                className={INP}
                required
              />
            </div>
          )}

          {/* Required checkbox */}
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--border-color)] bg-white px-4 py-3 hover:bg-[var(--background)] transition-colors">
            <input
              type="checkbox"
              checked={formData.required}
              onChange={(e) => setFormData({ ...formData, required: e.target.checked })}
              className="mt-0.5 accent-[var(--hs-link)]"
            />
            <div>
              <span className="text-sm font-semibold text-[var(--text-main)]">Required property</span>
              <p className="mt-0.5 text-sm text-[var(--primary-muted)]">Forms must include a value for this field.</p>
            </div>
          </label>

        </form>
      </div>
    </CrmSlidePanelShell>
  );

  return <CrmJiraPortal>{panel}</CrmJiraPortal>;
}
