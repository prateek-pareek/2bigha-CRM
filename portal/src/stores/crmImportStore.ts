import { create } from 'zustand';

export type CrmImportEntityType =
  | 'leads'
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
  createdCount?: number;
  mergedCount?: number;
  replacedCount?: number;
  skippedCount?: number;
  invalidCount?: number;
  existingClientCount?: number;
  invalidRoleCount?: number;
  failedRows?: { rowNumber: number; rowData?: any; reason: string }[];
  skippedRows?: { rowNumber: number; rowData?: any; reason: string }[];
  invalidRows?: { rowNumber: number; rowData?: any; errors: string[] }[];
  status: CrmImportJobStatus;
  error?: string;
  onSuccess?: () => void;
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
