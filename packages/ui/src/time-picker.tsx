"use client";

import { useState, useEffect, useRef } from "react";
import { Clock, X, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Button } from "./button";
import { cn } from "./utils";

interface TimePickerProps {
  value: string; // "HH:mm" in 24h format
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function TimePicker({ value, onChange, placeholder = "Select time", className }: TimePickerProps) {
  const [open, setOpen] = useState(false);

  // Parse stored "HH:mm" (24h) into display state
  const parsed = value?.match(/^(\d{1,2}):(\d{2})$/);
  const initH24 = parsed ? parseInt(parsed[1]) : -1;
  const [hour, setHour] = useState(initH24 >= 0 ? (initH24 > 12 ? initH24 - 12 : initH24 === 0 ? 12 : initH24) : 12);
  const [minute, setMinute] = useState(parsed ? parseInt(parsed[2]) : 0);
  const [period, setPeriod] = useState<"AM" | "PM">(initH24 >= 12 ? "PM" : "AM");

  const hourRef = useRef<HTMLDivElement>(null);
  const minRef = useRef<HTMLDivElement>(null);

  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  const commit = (h: number, m: number, p: "AM" | "PM") => {
    let h24 = h % 12;
    if (p === "PM") h24 += 12;
    onChange(`${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  };

  const displayLabel = value
    ? (() => {
        const parts = value.split(":");
        if (parts.length !== 2) return null;
        const h24 = parseInt(parts[0]);
        const m = parts[1];
        const p = h24 >= 12 ? "PM" : "AM";
        const dh = h24 % 12 === 0 ? 12 : h24 % 12;
        return `${String(dh).padStart(2, "0")}:${m} ${p}`;
      })()
    : null;

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        hourRef.current?.children[hour - 1]?.scrollIntoView({ block: "center", behavior: "smooth" });
        minRef.current?.children[minute]?.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 150);
    }
  }, [open, hour, minute]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-11 w-full flex items-center gap-3 rounded-xl border border-slate-200 bg-card px-4 text-sm font-medium text-text-main hover:bg-surface-dim transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 outline-none group",
            !value && "text-text-muted",
            className
          )}
        >
          <Clock className="h-4 w-4 text-text-muted group-hover:text-primary transition-colors shrink-0" />
          {displayLabel ? (
            <span className="tabular-nums text-sm">{displayLabel}</span>
          ) : (
            <span>{placeholder}</span>
          )}
          {value && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
                setOpen(false);
              }}
              className="ml-auto text-text-muted hover:text-error transition-colors p-1"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[260px] p-0 bg-popover border border-border shadow-[0_15px_40px_rgba(0,0,0,0.12)] rounded-xl overflow-hidden z-[99999] theme-crm-hubspot" 
        align="start"
        sideOffset={8}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border bg-gradient-to-b from-surface-dim/50 to-card flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--primary)] shadow-primary/50" />
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted">Time</span>
          </div>
          <div className="flex items-center gap-1.5">
             <span className="text-base font-black tabular-nums text-[var(--primary)]">
               {String(hour).padStart(2, "0")}:{String(minute).padStart(2, "0")}
             </span>
             <span className="text-[9px] font-bold text-[var(--primary)] bg-primary/10 px-1.5 py-0.5 rounded-md uppercase">
               {period}
             </span>
          </div>
        </div>

        {/* Picker Area */}
        <div className="flex h-60 bg-card relative">
          {/* Hour Picker */}
          <div 
            ref={hourRef} 
            className="flex-1 overflow-y-auto py-20 no-scrollbar custom-scrollbar" 
            style={{ scrollbarWidth: "none" }}
          >
            <div className="px-2 space-y-0.5">
              {hours.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => {
                    setHour(h);
                    commit(h, minute, period);
                  }}
                  className={cn(
                    "w-full py-2.5 rounded-lg text-sm tabular-nums transition-all flex items-center justify-center relative",
                    h === hour 
                      ? "bg-primary text-white font-black shadow-md shadow-primary/25 z-10 scale-105" 
                      : "text-text-main/40 hover:text-text-main hover:bg-surface-dim font-medium"
                  )}
                >
                  {String(h).padStart(2, "0")}
                </button>
              ))}
            </div>
          </div>

          {/* Minute Picker */}
          <div 
            ref={minRef} 
            className="flex-1 overflow-y-auto py-20 border-x border-border no-scrollbar custom-scrollbar" 
            style={{ scrollbarWidth: "none" }}
          >
            <div className="px-2 space-y-0.5">
              {minutes.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMinute(m);
                    commit(hour, m, period);
                  }}
                  className={cn(
                    "w-full py-2.5 rounded-lg text-sm tabular-nums transition-all flex items-center justify-center relative",
                    m === minute 
                      ? "bg-primary text-white font-black shadow-md shadow-primary/25 z-10 scale-105" 
                      : "text-text-main/40 hover:text-text-main hover:bg-surface-dim font-medium"
                  )}
                >
                  {String(m).padStart(2, "0")}
                </button>
              ))}
            </div>
          </div>

          {/* AM/PM Switcher */}
          <div className="w-16 flex flex-col items-center justify-center gap-3 bg-surface-dim/30 px-2">
            {(["AM", "PM"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setPeriod(p);
                  commit(hour, minute, p);
                }}
                className={cn(
                  "w-full py-3 rounded-lg text-xs font-black transition-all flex items-center justify-center border",
                  period === p 
                    ? "bg-card border-primary text-[var(--primary)] shadow-sm" 
                    : "bg-transparent border-transparent text-text-muted hover:text-text-main"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-3 border-t border-border bg-card flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="flex-1 h-9 text-xs font-bold uppercase tracking-widest text-text-muted hover:text-error hover:bg-error/5"
          >
            Clear
          </Button>
          <Button
            onClick={() => setOpen(false)}
            className="flex-[1.5] h-9 bg-primary hover:bg-primary-dark text-white text-xs font-bold uppercase tracking-widest rounded-lg shadow-sm shadow-primary/20"
          >
            <Check className="mr-1.5 h-3 w-3" />
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

