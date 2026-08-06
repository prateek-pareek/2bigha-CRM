"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** Parse `yyyy-MM-dd` as a local calendar date (avoids UTC off-by-one). */
export function parseDateOnly(value: string): Date | undefined {
  if (!value?.trim()) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d
  ) {
    return undefined;
  }
  return dt;
}

export function formatDateOnly(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function normalizeDefault(defaultValue: string | number | undefined): string {
  if (defaultValue === undefined || defaultValue === null) return "";
  const s = String(defaultValue);
  if (s.includes("T")) return s.split("T")[0];
  return s;
}

export interface DatePickerFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  /** When set, a hidden input is rendered for native form posts. */
  name?: string;
  /** Trigger layout: full width for form fields. */
  fullWidth?: boolean;
  buttonClassName?: string;
  disableFuture?: boolean;
  disablePast?: boolean;
}

export function DatePickerField({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  className,
  id,
  name,
  fullWidth = true,
  buttonClassName,
  disableFuture,
  disablePast,
}: DatePickerFieldProps) {
  const selected = parseDateOnly(value);
  const [open, setOpen] = React.useState(false);

  return (
    <div className={cn(fullWidth && "w-full", "relative", className)}>
      {name != null ? (
        <input type="hidden" name={name} value={value} readOnly aria-hidden />
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              fullWidth && "w-full",
              "justify-start rounded-xl border-slate-200 bg-card px-4 text-left text-sm font-medium text-text-main hover:bg-surface-dim",
              !value && "text-text-muted",
              buttonClassName
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0 text-text-muted" />
            {selected ? (
              format(selected, "MMM d, yyyy")
            ) : (
              <span>{placeholder}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto border-border bg-popover p-4 shadow-xl rounded-xl z-[99999] theme-crm-hubspot"
          align="start"
        >
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(d) => {
              onChange(d ? formatDateOnly(d) : "");
              setOpen(false);
            }}
            defaultMonth={selected}
            autoFocus
            disabled={[
              ...(disableFuture ? [{ after: new Date() }] : []),
              ...(disablePast ? [{ before: new Date(new Date().setHours(0, 0, 0, 0)) }] : []),
            ]}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function FormDatePicker({
  name,
  defaultValue = "",
  disabled,
  className,
  visualVariant = "default",
}: {
  name: string;
  defaultValue?: string | number;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  visualVariant?: "default" | "hubspot";
}) {
  const [value, setValue] = React.useState(() =>
    normalizeDefault(defaultValue)
  );

  React.useEffect(() => {
    setValue(normalizeDefault(defaultValue));
  }, [defaultValue]);

  const hubspotBtn =
    visualVariant === "hubspot"
      ? "h-10 rounded-md border-[var(--border-color)] bg-card px-3 text-sm font-normal text-[var(--text-main)] hover:bg-surface-hover"
      : "h-11";

  return (
    <DatePickerField
      name={name}
      value={value}
      onChange={setValue}
      disabled={disabled}
      className={className}
      placeholder="Select date"
      buttonClassName={hubspotBtn}
    />
  );
}
