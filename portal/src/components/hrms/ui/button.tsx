import * as React from "react";
import {
  Button as UIButton,
  type ButtonProps as ShadcnButtonProps,
} from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Legacy HRMS names; also accepts full shadcn variants (default, secondary, destructive, …). */
export type ButtonProps = Omit<ShadcnButtonProps, "variant" | "size"> & {
  variant?: ShadcnButtonProps["variant"] | "primary" | "danger";
  size?: ShadcnButtonProps["size"] | "md";
};

function mapVariant(
  variant: ButtonProps["variant"],
): NonNullable<ShadcnButtonProps["variant"]> {
  if (variant === "primary") return "default";
  if (variant === "danger") return "destructive";
  return (variant ?? "default") as NonNullable<ShadcnButtonProps["variant"]>;
}

function mapSize(
  size: ButtonProps["size"],
): NonNullable<ShadcnButtonProps["size"]> {
  if (size === "md") return "default";
  return (size ?? "default") as NonNullable<ShadcnButtonProps["size"]>;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <UIButton
      ref={ref}
      variant={mapVariant(variant)}
      size={mapSize(size)}
      className={cn(className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
