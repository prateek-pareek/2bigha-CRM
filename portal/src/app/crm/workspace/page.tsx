"use client";

/** Index redirects are handled by `layout.tsx` to the first permitted dashboard. */
export default function WorkspaceIndexPage() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--text-muted)]">
      Loading dashboard…
    </div>
  );
}
