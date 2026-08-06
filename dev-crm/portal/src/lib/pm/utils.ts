export { cn } from "@/lib/utils";

/** CRM-only stub — PM admin checks are not used in this repo. */
export function isPmAdminUser(_user?: { role?: string } | null): boolean {
  return false;
}
