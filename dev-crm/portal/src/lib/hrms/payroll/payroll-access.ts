/**
 * HRMS payroll / salary access helpers.
 * - `employees-salary:*` → see/edit salary on employee profiles
 * - `payroll` / `payroll:create|edit|…` → run payroll (master admin)
 * - `payroll-slips|structures|advances|settlements:*` → per-area admin
 * - `payroll-self:*` → own payslips only (safe default for employees)
 */

export type HrmsPayrollAccessItem = {
  slug: string;
  label: string;
  href: string;
  requiredPermission: string;
};

export const HRMS_PAYROLL_ACCESS_ITEMS: HrmsPayrollAccessItem[] = [
  {
    slug: "hub",
    label: "Payroll hub",
    href: "/hrms/payroll",
    requiredPermission: "payroll:read",
  },
  {
    slug: "slips",
    label: "Payslips",
    href: "/hrms/payroll/slips",
    requiredPermission: "payroll-slips:read",
  },
  {
    slug: "structures",
    label: "Structures",
    href: "/hrms/payroll/structures",
    requiredPermission: "payroll-structures:read",
  },
  {
    slug: "components",
    label: "Components",
    href: "/hrms/payroll/components",
    requiredPermission: "payroll-structures:read",
  },
  {
    slug: "advances",
    label: "Advances",
    href: "/hrms/payroll/advances",
    requiredPermission: "payroll-advances:read",
  },
  {
    slug: "fnf",
    label: "Full & final",
    href: "/hrms/payroll/fnf",
    requiredPermission: "payroll-settlements:read",
  },
  {
    slug: "gratuity",
    label: "Gratuity",
    href: "/hrms/payroll/gratuity",
    requiredPermission: "payroll-settlements:read",
  },
];

function normalizePerms(perms: unknown): string[] {
  if (!Array.isArray(perms)) return [];
  return perms.map((p) => String(p || "").trim().toLowerCase()).filter(Boolean);
}

/** True if user may view salary/stipend on employee records. */
export function userCanViewEmployeeSalary(permsRaw: unknown): boolean {
  const perms = normalizePerms(permsRaw);
  if (
    perms.some(
      (p) =>
        p === "employees-salary" ||
        p.startsWith("employees-salary:"),
    )
  ) {
    return true;
  }
  // Payroll ops (not self-service) may also see compensation.
  if (perms.includes("payroll") || perms.includes("payroll:write")) return true;
  if (
    perms.some((p) =>
      ["payroll:create", "payroll:edit", "payroll:delete", "payroll:approve"].includes(
        p,
      ),
    )
  ) {
    return true;
  }
  // Master payroll:read (admin) — not payroll-self:read
  if (perms.includes("payroll:read")) return true;
  return false;
}

/** True if user may administer company payroll (not merely view own slips). */
export function userCanAccessPayrollAdmin(permsRaw: unknown): boolean {
  const perms = normalizePerms(permsRaw);
  if (perms.includes("payroll") || perms.includes("payroll:write")) return true;
  if (
    perms.some((p) =>
      [
        "payroll:read",
        "payroll:create",
        "payroll:edit",
        "payroll:delete",
        "payroll:approve",
      ].includes(p),
    )
  ) {
    return true;
  }
  return perms.some(
    (p) =>
      p === "payroll-slips" ||
      p.startsWith("payroll-slips:") ||
      p === "payroll-structures" ||
      p.startsWith("payroll-structures:") ||
      p === "payroll-advances" ||
      p.startsWith("payroll-advances:") ||
      p === "payroll-settlements" ||
      p.startsWith("payroll-settlements:"),
  );
}

export function userCanAccessPayrollSelf(permsRaw: unknown): boolean {
  const perms = normalizePerms(permsRaw);
  return (
    userCanAccessPayrollAdmin(permsRaw) ||
    perms.includes("payroll-self") ||
    perms.some((p) => p.startsWith("payroll-self:"))
  );
}

export function canAccessHrmsPayrollPage(
  hasAccess: (permission: string) => boolean,
  requiredPermission: string,
): boolean {
  // Master payroll:read unlocks all payroll admin pages.
  if (hasAccess("payroll:read") || hasAccess("payroll") || hasAccess("payroll:write")) {
    return true;
  }
  if (requiredPermission.startsWith("payroll-")) {
    return hasAccess(requiredPermission) || hasAccess(requiredPermission.split(":")[0]);
  }
  return hasAccess(requiredPermission);
}

export function firstAccessiblePayrollHref(
  hasAccess: (permission: string) => boolean,
): string | null {
  // Self-only users land on slips (my payslips UX).
  if (
    !canAccessHrmsPayrollPage(hasAccess, "payroll:read") &&
    (hasAccess("payroll-self:read") || hasAccess("payroll-self"))
  ) {
    return "/hrms/payroll/slips";
  }
  const hit = HRMS_PAYROLL_ACCESS_ITEMS.find((i) =>
    canAccessHrmsPayrollPage(hasAccess, i.requiredPermission),
  );
  return hit?.href ?? null;
}

export function canAccessAnyPayrollAdminPage(
  hasAccess: (permission: string) => boolean,
): boolean {
  return (
    firstAccessiblePayrollHref(hasAccess) != null &&
    (hasAccess("payroll:read") ||
      hasAccess("payroll") ||
      hasAccess("payroll-slips:read") ||
      hasAccess("payroll-structures:read") ||
      hasAccess("payroll-advances:read") ||
      hasAccess("payroll-settlements:read") ||
      hasAccess("payroll-self:read") ||
      hasAccess("payroll-self"))
  );
}
