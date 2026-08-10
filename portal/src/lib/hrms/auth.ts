import { HRMS_MODULE_IDS, hrmsModuleForPathname } from '@/lib/permissions/registry';

/** Built-in platform owner — always full super-admin access regardless of stored role. */
export const PLATFORM_SUPER_ADMIN_EMAIL = 'ceo@mathionix.com';

export function isPlatformSuperAdminEmail(email: unknown): boolean {
    return String(email || '').trim().toLowerCase() === PLATFORM_SUPER_ADMIN_EMAIL;
}

export function isPlatformSuperAdminUser(user: User | null | undefined): boolean {
    return isPlatformSuperAdminEmail(user?.email);
}

export interface User {
    _id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    roleId?: { permissions?: string[]; name?: string } | string | null;
    useRoleOverrides?: boolean;
    /** Used by SOP step conditions when present on the profile. */
    department?: string;
    permissions?: string[];
    permittedTools?: string[];
}

/** Per-checkbox actions in Staff Management (stored as `module:action`). */
export const HRMS_GRANULAR_MODULE_ACTIONS = [
    'read',
    'create',
    'edit',
    'delete',
    'export',
    'import',
    'approve',
] as const;

/** All HRMS actions including legacy `write` (full mutate on module). */
export const HRMS_MODULE_ACTIONS = [...HRMS_GRANULAR_MODULE_ACTIONS, 'write'] as const;

export type HrmsModuleAction = (typeof HRMS_MODULE_ACTIONS)[number];

export { HRMS_MODULE_IDS };

/** Map sidebar href → permission module id (uses central registry routes). */
export function hrmsModuleKeyFromHref(href: string): string | null {
    const mod = hrmsModuleForPathname(href);
    if (mod) return mod.id;
    if (href.startsWith('/hrms/')) {
        const seg = href.replace(/^\/hrms\//, '').split('/').filter(Boolean)[0];
        return seg || null;
    }
    return null;
}

export const isAdmin = (user: User | null): boolean => {
    if (!user) return false;
    if (isPlatformSuperAdminUser(user)) return true;
    const adminRoles = [
        'ADMIN',
        'CEO',
        'CTO',
        'MANAGER',
        'EXECUTIVE',
        'SENIOR_MEMBER',
        'SENIOR MEMBER',
        'ADMINISTRATOR',
        'ADMINISTRATION',
        'SUPERADMIN',
        'SUPER_ADMIN',
        'SUPERADMINISTRATOR',
        'SUPER_ADMINISTRATOR',
        'OWNER',
        'SUBADMIN',
        'SUB_ADMIN',
        'DIRECTOR',
        'CRMADMIN',
        'CRM_ADMIN',
    ];
    const role = typeof user.role === 'object' ? (user.role as any).name : user.role;
    const normalizedRole = String(role || '')
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_');
    const compactRole = String(role || '')
        .trim()
        .toUpperCase()
        .replace(/[\s\-_]+/g, '');
    return adminRoles.includes(normalizedRole) || adminRoles.includes(compactRole);
};

/** Platform infrastructure (Tech Services / Redis health) — not HR staff with employees:edit. */
export const isPlatformTechServicesAdmin = (user: User | null | undefined): boolean => {
    if (!user) return false;
    if (isPlatformSuperAdminUser(user)) return true;
    const role = typeof user.role === 'object' ? (user.role as { name?: string }).name : user.role;
    const key = String(role ?? '')
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_');
    return ['ADMIN', 'ADMINISTRATOR', 'SUPERADMIN', 'SUPER_ADMIN', 'OWNER', 'CEO', 'CTO'].includes(key);
};

/** Executive-only CRM analytics (e.g. revenue forecast). */
export const isCrmTopAdmin = (user: User | null | undefined): boolean => {
    if (!user) return false;
    if (isPlatformSuperAdminUser(user)) return true;
    if (isPlatformTechServicesAdmin(user)) return true;
    const roleDoc = user.roleId;
    const roleFromDoc =
        roleDoc && typeof roleDoc === 'object' && 'name' in roleDoc
            ? String((roleDoc as { name?: string }).name ?? '')
            : '';
    const role =
        roleFromDoc ||
        (typeof user.role === 'object' ? (user.role as { name?: string }).name : user.role);
    const compact = String(role ?? '')
        .trim()
        .toUpperCase()
        .replace(/[\s\-_]+/g, '');
    return ['ADMIN', 'ADMINISTRATOR', 'SUPERADMIN', 'SUPERADMINISTRATOR', 'OWNER', 'CEO', 'CTO'].includes(
        compact,
    );
};

/** Matches API StrictAdminGuard: Admin role or built-in super-admin email. */
export const isPlatformBackupAdmin = (user: User | null | undefined): boolean => {
    if (!user) return false;
    if (isPlatformSuperAdminUser(user)) return true;
    const role = typeof user.role === 'object' ? (user.role as any).name : user.role;
    return String(role || '').trim().toUpperCase() === 'ADMIN';
};

/**
 * Same role allow-list as API `SocialPmLinkAdminGuard`: link a marketing PM board to Social desk.
 * Social-tool-only users (no admin role) cannot change this.
 */
export function canConfigureSocialDeskPmLink(user: User | null | undefined): boolean {
    if (!user) return false;
    if (isAdmin(user)) return true;
    const perms = [...(user.permissions || []), ...((user as { crmPermissions?: string[] }).crmPermissions || [])];
    return perms.includes('admin:manage');
}

export const hasPermission = (user: User | null, permission: string): boolean => {
    if (!user) return false;
    if (isAdmin(user)) return true;

    const perms = getEffectiveHrmsPermissions(user);
    if (perms.includes(permission)) return true;

    // Broad module key → any `module:*` grants access (full granular control)
    if (!permission.includes(':')) {
        return perms.some((p) => p === permission || p.startsWith(`${permission}:`));
    }

    return false;
};

/** Effective HRMS permissions from user record + assigned custom role template. */
export function getEffectiveHrmsPermissions(user: User | null | undefined): string[] {
    if (!user) return [];
    const direct = Array.isArray(user.permissions) ? [...user.permissions] : [];
    const roleDoc = user.roleId;
    const fromRole =
        roleDoc && typeof roleDoc === 'object' && Array.isArray(roleDoc.permissions)
            ? roleDoc.permissions.filter((p): p is string => typeof p === 'string')
            : [];

    if (!fromRole.length) return direct;
    if (user.useRoleOverrides === false) return [...new Set(fromRole)];
    return [...new Set([...fromRole, ...direct])];
}

/** Who can create, edit, and delete custom roles in Role Manager. */
export function canManageCustomRoles(user: User | null | undefined): boolean {
    if (!user) return false;
    if (isAdmin(user)) return true;
    const roleRaw =
        typeof user.role === 'object' && user.role != null
            ? (user.role as { name?: string }).name
            : user.role;
    const roleKey = String(roleRaw ?? '')
        .trim()
        .toLowerCase();
    if (roleKey === 'hr manager' || roleKey === 'hr') return true;

    const perms = getEffectiveHrmsPermissions(user);
    if (perms.includes('hrms:admin')) return true;
    return (
        perms.includes('hr-settings:edit') ||
        perms.includes('hr-settings:create') ||
        perms.includes('hr-settings:write') ||
        perms.includes('employees:edit') ||
        perms.includes('employees:write')
    );
}

function hasModuleActionForKey(
    perms: string[],
    moduleKey: string,
    action: HrmsModuleAction,
): boolean {
    if (perms.includes(`${moduleKey}:write`)) return true;
    if (action === 'read') {
        return perms.some((p) => p === moduleKey || p.startsWith(`${moduleKey}:`));
    }
    return perms.includes(`${moduleKey}:${action}`);
}

/** Check a specific action for gated UI and APIs. */
export function hasModuleAction(user: User | null, moduleKey: string, action: HrmsModuleAction): boolean {
    if (!user) return false;
    if (isAdmin(user)) return true;
    const perms = getEffectiveHrmsPermissions(user);
    if (hasModuleActionForKey(perms, moduleKey, action)) return true;
    if (moduleKey === 'benefits' && hasModuleActionForKey(perms, 'hr-settings', action)) {
        return true;
    }
    return false;
}

export function hrmsPermissionListHasModuleAccess(permissions: string[] | undefined): boolean {
    if (!permissions?.length) return false;
    return permissions.some((p) => {
        const [mod] = p.split(':');
        return HRMS_MODULE_IDS.includes(mod);
    });
}

export function hasAnyHrmsModulePermission(user: User | null): boolean {
    if (!user) return false;
    if (isAdmin(user)) return true;
    return hrmsPermissionListHasModuleAccess(getEffectiveHrmsPermissions(user));
}

const HRMS_OVERVIEW_MODULE_IDS = ['analytics', 'reports', 'notifications'] as const;

/** Sidebar items that map to dedicated module keys; falls back to any HRMS module for legacy users. */
export function hrmsPermissionListHasOverviewModuleAccess(
    permissions: string[] | undefined,
    moduleId: (typeof HRMS_OVERVIEW_MODULE_IDS)[number],
): boolean {
    if (!permissions?.length) return false;
    if (permissions.some((p) => p === moduleId || p.startsWith(`${moduleId}:`))) return true;
    return hrmsPermissionListHasModuleAccess(permissions);
}

/** Benefits page: own module or legacy hr-settings access. */
export function hrmsPermissionListHasBenefitsAccess(permissions: string[] | undefined): boolean {
    if (!permissions?.length) return false;
    if (permissions.some((p) => p === 'benefits' || p.startsWith('benefits:'))) return true;
    return permissions.some((p) => p.startsWith('hr-settings:'));
}

/**
 * Suite sidebar "HR Admin" /hrms/hr-settings — settings, platform staff access, or explicit flag.
 * Aligns with who can open Staff Management (hr-settings or employees edit).
 */
export function hrmsPermissionListHasHrAdminAccess(permissions: string[] | undefined): boolean {
    if (!permissions?.length) return false;
    if (permissions.includes('hrms:admin')) return true;
    if (permissions.some((p) => p.startsWith('hr-settings:'))) return true;
    return permissions.some(
        (p) => p === 'employees:edit' || p === 'employees:write',
    );
}

export const isHR = (user: User | null): boolean => {
    if (!user) return false;
    const role = typeof user.role === 'object' ? (user.role as any).name : user.role;
    return role === 'HR' || role === 'HR Manager';
};

export const isHRManager = (user: User | null): boolean => {
    if (!user) return false;
    const role = typeof user.role === 'object' ? (user.role as any).name : user.role;
    return role === 'HR Manager';
};

/** Admin or HR — can delete leave application history (matches API leaves DELETE). */
export const canDeleteLeaveRecords = (user: User | null): boolean => {
    if (!user) return false;
    if (isAdmin(user)) return true;
    return isHR(user) || isHRManager(user);
};

export const isCEO = (user: User | null): boolean => {
    if (!user) return false;
    const role = typeof user.role === 'object' ? (user.role as any).name : user.role;
    return role === 'CEO';
};

/** CEO / Executive dashboard — requires Executive tool or CEO role (not all managers). */
export const hasExecutiveDashboardAccess = (user: User | null): boolean => {
    if (!user) return false;
    if (isPlatformSuperAdminUser(user)) return true;
    if (isCEO(user)) return true;
    const tools = (user.permittedTools || []).map((t) =>
        String(t || '').trim().toUpperCase(),
    );
    return tools.includes('EXECUTIVE');
};

export const isEmployee = (user: User | null): boolean => {
    if (!user) return false;
    const role = typeof user.role === 'object' ? (user.role as any).name : user.role;
    return role === 'Employee';
};

/** Payroll/salary visibility: strict admin or explicit payroll permission. */
export const canViewPayrollSensitive = (user: User | null): boolean => {
    if (!user) return false;
    if (isPlatformBackupAdmin(user)) return true;
    const perms = user.permissions || [];
    return perms.some((p) => {
        const key = String(p || "").trim().toLowerCase();
        return key === "payroll" || key.startsWith("payroll:");
    });
};

/**
 * CRM deal amounts, annual revenue, and pipeline/revenue analytics.
 * Restricted to the platform super-admin (ceo@mathionix.com) only.
 */
export const canViewCrmRevenue = (user: User | null | undefined): boolean => {
    return isPlatformSuperAdminUser(user);
};

export const getStoredUser = (): User | null => {
    if (typeof window === 'undefined') return null;
    // Prefer 'user' as it's the primary storage for the suite-wide login
    const stored = localStorage.getItem('user') || localStorage.getItem('hrms_user');
    if (!stored) return null;
    try {
        return JSON.parse(stored);
    } catch (e) {
        return null;
    }
};
