"use client";

import { Loader2 } from "lucide-react";

export function ReportChartSkeleton({ 
  type = "bar", 
  height = "300px" 
}: { 
  type?: "pie" | "bar" | "area" | "heatmap";
  height?: string;
}) {
  return (
    <div 
      className="flex flex-col items-center justify-center w-full rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6"
      style={{ minHeight: height }}
    >
      <div className="w-full flex justify-between items-start mb-6">
        <div className="space-y-2 w-1/3">
          <div className="h-4 bg-[var(--surface-dim)] rounded-md w-3/4 animate-pulse" />
          <div className="h-3 bg-[var(--surface-dim)] rounded-md w-1/2 animate-pulse" />
        </div>
        <div className="h-6 w-6 bg-[var(--surface-dim)] rounded-md animate-pulse" />
      </div>

      <div className="flex-1 w-full flex items-center justify-center">
        {type === "pie" && (
          <div className="w-48 h-48 rounded-full border-[24px] border-[var(--surface-dim)] animate-pulse" />
        )}
        
        {(type === "bar" || type === "area") && (
          <div className="w-full h-full flex items-end justify-between gap-2 md:gap-4 px-4 pb-4">
            {[40, 70, 45, 90, 60, 30, 80].map((h, i) => (
              <div 
                key={i} 
                className="w-full bg-[var(--surface-dim)] rounded-t-md animate-pulse" 
                style={{ height: `${h}%`, animationDelay: `${i * 100}ms` }} 
              />
            ))}
          </div>
        )}

        {type === "heatmap" && (
          <div className="w-full max-w-2xl flex flex-col gap-2">
            {[1, 2, 3].map((row) => (
              <div key={row} className="flex gap-2 w-full justify-center">
                <div className="w-24 md:w-32 h-8 bg-[var(--surface-dim)] rounded-md animate-pulse" />
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5, 6, 7].map((col, i) => (
                    <div 
                      key={col} 
                      className="w-8 h-8 md:w-10 md:h-10 bg-[var(--surface-dim)] rounded-md animate-pulse" 
                      style={{ animationDelay: `${(row * 7 + i) * 50}ms` }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
