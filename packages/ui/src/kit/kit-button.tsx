"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../utils";
import {
  CRM_BTN_PRIMARY,
  CRM_BTN_SECONDARY,
  CRM_BTN_GHOST,
  CRM_BTN_ICON,
} from "./tokens";

export type KitButtonVariant = "primary" | "secondary" | "ghost" | "icon" | "danger";

const VARIANT: Record<KitButtonVariant, string> = {
  primary: CRM_BTN_PRIMARY,
  secondary: CRM_BTN_SECONDARY,
  ghost: CRM_BTN_GHOST,
  icon: CRM_BTN_ICON,
  danger:
    "inline-flex h-[38px] items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--error)] px-3.5 text-sm font-medium text-white shadow-sm transition-colors hover:opacity-90 disabled:opacity-50",
};

export type KitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: KitButtonVariant;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

/** Product kit button — primary / outline / ghost / icon / danger */
export const KitButton = forwardRef<HTMLButtonElement, KitButtonProps>(
  function KitButton(
    {
      variant = "primary",
      loading,
      leftIcon,
      rightIcon,
      className,
      children,
      disabled,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={cn(VARIANT[variant], className)}
        {...rest}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : leftIcon}
        {children}
        {!loading ? rightIcon : null}
      </button>
    );
  },
);

/** @deprecated Prefer `KitButton` — CRM alias for existing call sites */
export const CrmButton = KitButton;
export type CrmButtonProps = KitButtonProps;
export type CrmButtonVariant = KitButtonVariant;
