"use client";

/** Team & Organization export — same component as the agent report, team columns. */
import ExportButtons from "../agents/ExportButtons";
import type { TeamReportRow } from "../lib/performance-report";

export default function TeamExportButtons(props: {
  data: TeamReportRow[];
  fileName: string;
  subtitle?: string;
  disabled?: boolean;
}) {
  return <ExportButtons {...props} team />;
}
