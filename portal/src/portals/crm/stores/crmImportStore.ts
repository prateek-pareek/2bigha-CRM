import { create } from 'zustand';

export type CrmImportEntityType =
  | 'leads'
  | 'deals'
  | 'contacts'
  | 'clients'
  | 'organizations';

export type CrmImportJobStatus = 'processing' | 'completed' | 'failed';

export interface TrackedCrmImport {
  jobId: string;
  type: CrmImportEntityType;
  total: number;
  processed: number;
  successCount: number;
  failedCount: number;
  status: CrmImportJobStatus;
  error?: string;
  onSuccess?: () => void;
  createdCount?: number;
  mergedCount?: number;
  replacedCount?: number;
  skippedCount?: number;
  /** Leads-only: rows whose Role/WhatsApp/Address matched an existing Client. */
  existingClientCount?: number;
  /** Leads-only: rows whose Role column wasn't OWNER/AGENT/USER (defaulted to USER). */
  invalidRoleCount?: number;
}

interface CrmImportStore {
  jobs: TrackedCrmImport[];
  trackImport: (payload: {
    jobId: string;
    type: CrmImportEntityType;
    total: number;
    onSuccess?: () => void;
  }) => void;
  updateJob: (jobId: string, patch: Partial<TrackedCrmImport>) => void;
  removeJob: (jobId: string) => void;
}

export const useCrmImportStore = create<CrmImportStore>((set) => ({
  jobs: [],
  trackImport: ({ jobId, type, total, onSuccess }) =>
    set((state) => ({
      jobs: [
        ...state.jobs.filter((j) => j.jobId !== jobId),
        {
          jobId,
          type,
          total,
          processed: 0,
          successCount: 0,
          failedCount: 0,
          status: 'processing',
          onSuccess,
        },
      ],
    })),
  updateJob: (jobId, patch) =>
    set((state) => ({
      jobs: state.jobs.map((j) => (j.jobId === jobId ? { ...j, ...patch } : j)),
    })),
  removeJob: (jobId) =>
    set((state) => ({
      jobs: state.jobs.filter((j) => j.jobId !== jobId),
    })),
}));
