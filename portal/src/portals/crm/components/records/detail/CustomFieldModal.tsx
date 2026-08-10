"use client";

import { useState, useEffect } from 'react';
import { CrmJiraPortal } from '@/components/crm/shell/CrmJiraPortal';
import { Save, Info } from 'lucide-react';
import { CRM_API_URL } from '@/lib/crm/config';
import CrmSlidePanelShell from '@/components/crm/shell/CrmSlidePanelShell';
import {
  CrmFormSection,
  CrmFormGrid,
  CRM_HS_CONTROL_CLASS,
  CRM_HS_LABEL_CLASS,
  CRM_HS_SELECT_CLASS,
} from '@/components/crm/records/forms/crm-form-primitives';
import { CrmButton } from '@/components/crm/ui';

const LBL = CRM_HS_LABEL_CLASS;
const INP = CRM_HS_CONTROL_CLASS;
const SEL = CRM_HS_SELECT_CLASS;

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
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <CrmButton variant="secondary" onClick={onClose}>
            Cancel
          </CrmButton>
          <CrmButton
            form="custom-field-form"
            type="submit"
            disabled={loading}
            loading={loading}
            leftIcon={!loading ? <Save size={15} /> : undefined}
          >
            {loading ? 'Saving…' : field ? 'Save Changes' : 'Create Property'}
          </CrmButton>
        </div>
      }
    >
      <form id="custom-field-form" onSubmit={handleSubmit} className="space-y-3">
        <CrmFormSection title="Property Details" defaultOpen>
          <CrmFormGrid>
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
            <div className="sm:col-span-2">
              <label className={LBL}>Field label<span className="text-[var(--primary)]">*</span></label>
              <input
                type="text"
                placeholder="e.g. Budget Amount"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={INP}
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className={`${LBL} flex items-center gap-1.5`}>
                Internal key
                <div className="group relative inline-flex">
                  <Info size={12} className="text-[var(--text-muted)] cursor-help" />
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
            {(formData.type === 'select' || formData.type === 'multiselect') && (
              <div className="sm:col-span-2">
                <label className={LBL}>Options <span className="font-normal text-[var(--text-muted)]">(comma separated)</span></label>
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
            <div className="sm:col-span-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-4 py-3 hover:bg-[var(--background)] transition-colors shadow-[var(--crm-shadow-input)]">
                <input
                  type="checkbox"
                  checked={formData.required}
                  onChange={(e) => setFormData({ ...formData, required: e.target.checked })}
                  className="mt-0.5 accent-[var(--primary)]"
                />
                <div>
                  <span className="text-sm font-medium text-[var(--text-main)]">Required property</span>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">Forms must include a value for this field.</p>
                </div>
              </label>
            </div>
          </CrmFormGrid>
        </CrmFormSection>
      </form>
    </CrmSlidePanelShell>
  );

  return <CrmJiraPortal>{panel}</CrmJiraPortal>;
}
