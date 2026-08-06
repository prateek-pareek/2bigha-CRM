"use client";

import { cn } from "@/lib/utils";

export type CrmTiIconProps = {
  /** Tabler icon slug without the `ti-` prefix (e.g. `filter`, `package-export`) */
  name: string;
  size?: number;
  className?: string;
  /** Accepted for Lucide API compatibility — webfont ignores stroke */
  strokeWidth?: number;
  title?: string;
  "aria-hidden"?: boolean | "true" | "false";
  "aria-label"?: string;
};

/**
 * Dreams CRMS Tabler Icons webfont glyph.
 * Reference: https://crms.dreamstechnologies.com/html/assets/plugins/tabler-icons/
 */
export function CrmTiIcon({
  name,
  size = 16,
  className,
  title,
  strokeWidth: _strokeWidth,
  ...rest
}: CrmTiIconProps) {
  return (
    <i
      className={cn("ti", `ti-${name}`, "crm-ti-icon inline-flex shrink-0 items-center justify-center", className)}
      style={{ fontSize: size, width: size, height: size, lineHeight: 1 }}
      title={title}
      {...rest}
    />
  );
}

/** Lucide-compatible Tabler icon component factory for sidebar / typed slots */
export function createCrmTiIcon(name: string) {
  function TiIcon({
    size = 16,
    className,
    strokeWidth,
    ...rest
  }: {
    size?: number;
    className?: string;
    strokeWidth?: number;
  } & Record<string, unknown>) {
    return (
      <CrmTiIcon
        name={name}
        size={typeof size === "number" ? size : 16}
        className={className}
        strokeWidth={strokeWidth}
        aria-hidden
        {...rest}
      />
    );
  }
  TiIcon.displayName = `CrmTi(${name})`;
  return TiIcon;
}
