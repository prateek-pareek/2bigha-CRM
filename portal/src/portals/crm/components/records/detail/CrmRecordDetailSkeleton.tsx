"use client";

export default function CrmRecordDetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1400px] animate-pulse space-y-4 pb-8">
      <div className="h-12 w-64 rounded bg-[var(--surface-dim)]" />
      <div className="h-4 w-28 rounded bg-[var(--surface-dim)]" />
      <div className="h-28 rounded-[var(--crm-radius-ui)] bg-[var(--surface-dim)]" />
      <div className="h-24 rounded-[var(--crm-radius-ui)] bg-[var(--surface-dim)]" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="h-[28rem] rounded-[var(--crm-radius-ui)] bg-[var(--surface-dim)]" />
        <div className="space-y-4">
          <div className="h-36 rounded-[var(--crm-radius-ui)] bg-[var(--surface-dim)]" />
          <div className="h-28 rounded-[var(--crm-radius-ui)] bg-[var(--surface-dim)]" />
        </div>
      </div>
    </div>
  );
}
