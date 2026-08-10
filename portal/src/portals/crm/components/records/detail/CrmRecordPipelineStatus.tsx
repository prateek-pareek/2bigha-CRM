"use client";

import { cn } from "@/lib/utils";
import { crmRecordChrome } from "@/lib/crm/chrome";

type Props = {
  title?: string;
  stages: string[];
  currentStage?: string | null;
  onSelect?: (stage: string) => void;
  disabled?: boolean;
  className?: string;
};

/** CRMS “Lead Pipeline Status” stepper — ref: leads-details.html */
export default function CrmRecordPipelineStatus({
  title = "Lead Pipeline Status",
  stages,
  currentStage,
  onSelect,
  disabled,
  className,
}: Props) {
  if (!stages.length) return null;

  const currentIdx = Math.max(
    0,
    stages.findIndex((s) => s === currentStage),
  );
  const hasMatch = stages.includes(String(currentStage || ""));

  return (
    <div className={cn(crmRecordChrome.stageBar, className)}>
      <h3 className="crm-record-pipeline-title">{title}</h3>
      <div className="flex items-stretch overflow-x-auto custom-scrollbar">
        {stages.map((stage, idx) => {
          const isCurrent = hasMatch && currentStage === stage;
          const isCompleted = hasMatch && currentIdx >= idx;
          const clickable = Boolean(onSelect) && !disabled;
          return (
            <button
              key={stage}
              type="button"
              disabled={!clickable || isCurrent}
              onClick={() => onSelect?.(stage)}
              className={cn(
                crmRecordChrome.stageStep,
                clickable && !isCurrent && "cursor-pointer hover:opacity-90",
                (!clickable || isCurrent) && "cursor-default",
              )}
            >
              <div
                className={cn(
                  crmRecordChrome.stageDot,
                  isCurrent
                    ? crmRecordChrome.stageDotCurrent
                    : isCompleted
                      ? crmRecordChrome.stageDotComplete
                      : crmRecordChrome.stageDotIdle,
                )}
              >
                {idx + 1}
              </div>
              <span
                className={cn(
                  crmRecordChrome.stageLabel,
                  isCurrent && crmRecordChrome.stageLabelCurrent,
                )}
              >
                {stage}
              </span>
              {idx < stages.length - 1 ? (
                <div
                  className={cn(
                    "absolute left-1/2 top-4 z-0 h-px w-full -translate-y-1/2",
                    isCompleted ? "bg-[var(--primary)]/35" : "bg-[var(--border-color)]",
                  )}
                  aria-hidden
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
