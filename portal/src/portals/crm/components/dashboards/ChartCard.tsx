"use client";

import React, { useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type ChartCardProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

export function ChartCard({
  title,
  description,
  children,
  className,
  contentClassName,
}: ChartCardProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <>
      <div
        className={cn(
          "group relative flex flex-col rounded-xl border border-border bg-card shadow-sm transition-all hover:shadow-md",
          className
        )}
      >
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 sm:px-6">
          <div>
            <h3 className="text-sm font-semibold text-card-foreground">{title}</h3>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
          <button
            onClick={() => setIsFullscreen(true)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100"
            title="View Full Screen"
            aria-label="View Full Screen"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
        <div className={cn("flex-1 p-4 sm:p-6", contentClassName)}>
          {children}
        </div>
      </div>

      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[95vw] w-full max-h-[95vh] h-full sm:max-w-[90vw] sm:max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && (
              <DialogDescription>{description}</DialogDescription>
            )}
          </DialogHeader>
          <div className="flex-1 w-full h-full min-h-0 relative mt-4">
            {children}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Reusable Tooltip for Recharts that matches the app's dark/light theme.
 * Usage: <Tooltip content={<CustomChartTooltip />} />
 */
export function CustomChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <div className="mb-2 border-b border-border/50 pb-1 font-medium">
        {label}
      </div>
      <div className="flex flex-col gap-1.5">
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}:</span>
            </div>
            <span className="font-semibold">
              {formatter ? formatter(entry.value, entry.name, entry, index, payload) : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
