"use client";

export default function CrmRecordDetailSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-4 w-32 rounded bg-[var(--surface-dim)]" />
      <div className="h-28 rounded-[var(--crm-radius-ui)] bg-[var(--surface-dim)]" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="h-[28rem] rounded-[var(--crm-radius-ui)] bg-[var(--surface-dim)]" />
        </div>
        <div className="space-y-4">
          <div className="h-36 rounded-[var(--crm-radius-ui)] bg-[var(--surface-dim)]" />
          <div className="h-28 rounded-[var(--crm-radius-ui)] bg-[var(--surface-dim)]" />
        </div>
      </div>
    </div>
  );
}
