"use client";

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { Search } from "lucide-react";
import { cn } from "../utils";
import { CRM_INPUT, CRM_LABEL, CRM_SELECT } from "./tokens";

export function FieldLabel({
  children,
  required,
  className,
  htmlFor,
}: {
  children: ReactNode;
  required?: boolean;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn(CRM_LABEL, className)}>
      {children}
      {required ? <span className="ml-0.5 text-[var(--primary)]">*</span> : null}
    </label>
  );
}

export function FieldInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CRM_INPUT, className)} {...props} />;
}

export function FieldSelect({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CRM_SELECT, className)} {...props}>
      {children}
    </select>
  );
}

export function FieldTextarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(CRM_INPUT, "h-auto min-h-[100px] py-2.5 resize-y", className)}
      {...props}
    />
  );
}

/** Toolbar search field with leading search icon */
export function SearchInput({
  className,
  wrapperClassName,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { wrapperClassName?: string }) {
  return (
    <div className={cn("relative w-[220px] max-w-full shrink-0", wrapperClassName)}>
      <Search
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        aria-hidden
      />
      <input type="search" className={cn(CRM_INPUT, "w-full min-w-0 pl-9", className)} {...props} />
    </div>
  );
}

/** @deprecated Prefer Field* / SearchInput names */
export const CrmLabel = FieldLabel;
export const CrmInput = FieldInput;
export const CrmSelect = FieldSelect;
export const CrmTextarea = FieldTextarea;
export const CrmSearchInput = SearchInput;
