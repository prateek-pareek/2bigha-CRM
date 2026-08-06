"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/suite/api";
import { useAuthStore } from "@/store/pm/auth-store";
import {
  hasAnyHrmsModulePermission,
  hrmsPermissionListHasModuleAccess,
  hrmsPermissionListHasHrAdminAccess,
  hrmsPermissionListHasOverviewModuleAccess,
  hrmsPermissionListHasBenefitsAccess,
  isAdmin as userIsManagementAdmin,
  isUnrestrictedAdmin as userIsUnrestrictedAdmin,
  hasExecutiveDashboardAccess as userHasExecutiveDashboardAccess,
  isPlatformTechServicesAdmin,
  canViewCrmRevenue as userCanViewCrmRevenue,
  getEffectiveHrmsPermissions,
} from '@/lib/suite/auth';
import { checkRegistryPermissionAccess } from "@/lib/permissions/access";
import { permissionSuite } from "@/lib/permissions/registry";

export function usePermissions() {
    const [user, setUser] = useState<any>(null);
    const [localIsLoaded, setLocalIsLoaded] = useState(false);
    const [showRefreshPrompt, setShowRefreshPrompt] = useState(false);

    const hasToken = typeof window !== 'undefined' && !!(localStorage.getItem('token') || localStorage.getItem('pm_token'));
    const isLoaded = localIsLoaded && (!hasToken || user !== null);

    useEffect(() => {
        const checkUser = () => {
            const saved = localStorage.getItem('user');
            if (saved) {
                try {
                    setUser(JSON.parse(saved));
                } catch (e) {
                    console.error('Failed to parse user', e);
                }
            }
            setLocalIsLoaded(true);
        };

        checkUser();

        // Listen for storage changes in case role is updated from another tab
        window.addEventListener('storage', checkUser);
        return () => window.removeEventListener('storage', checkUser);
    }, []);

    // Use React Query for centralized, cached auth data
    const { data: serverUser, refetch: refreshQuery } = useQuery({
        queryKey: ['auth/me'],
        queryFn: async () => {
            const res = await api.get('/auth/me');
            return res.data;
        },
        enabled: hasToken,
        refetchInterval: 30000, // 30 seconds polling
        staleTime: 0, // Always revalidate — CRM button grants must not stay stale
        refetchOnWindowFocus: true,
    });

    // Synchronize query data with LocalStorage and PM Auth Store
    useEffect(() => {
        if (!serverUser || !localIsLoaded) return;

        const serverTools = (serverUser.permittedTools || []).map((t: string) =>
            String(t || "").toUpperCase(),
        );

        if (!user) {
            const normalizedUser = {
                ...serverUser,
                permittedTools: serverTools,
                access_version: serverUser.accessVersion || 0,
                version: serverUser.tokenVersion || 0,
            };
            localStorage.setItem('user', JSON.stringify(normalizedUser));
            const pmToken = localStorage.getItem('pm_token') || localStorage.getItem('token');
            useAuthStore.getState().setAuth(normalizedUser, pmToken || '');
            setUser(normalizedUser);
            return;
        }

        const currentAccessVersion = user.access_version || 0;
        const serverAccessVersion = serverUser.accessVersion || 0;
        const currentTokenVersion = user.version || 0;
        const serverTokenVersion = serverUser.tokenVersion || 0;

        const accessChanged = currentAccessVersion !== serverAccessVersion;
        const securityChanged = currentTokenVersion !== serverTokenVersion;

        // Always keep CRM button grants in sync — stale localStorage used to keep
        // showing Delete after the API had already stripped legacy keys.
        const localCrm = JSON.stringify(user.crmPermissions || []);
        const serverCrm = JSON.stringify(serverUser.crmPermissions || []);
        const crmPermsChanged = localCrm !== serverCrm;

        if (accessChanged || securityChanged || crmPermsChanged) {
            const existingTools = user.permittedTools || [];
            const mergedTools = Array.from(new Set([
                ...existingTools,
                ...serverTools,
            ]));

            const updatedUser = { 
                ...user, 
                ...serverUser,
                crmPermissions: serverUser.crmPermissions || [],
                permittedTools: mergedTools,
                version: serverTokenVersion, 
                access_version: serverAccessVersion 
            };

            localStorage.setItem('user', JSON.stringify(updatedUser));
            
            const pmToken = localStorage.getItem('pm_token') || localStorage.getItem('token');
            useAuthStore.getState().setAuth(updatedUser, pmToken || '');

            setUser(updatedUser);
            if (accessChanged || securityChanged) {
                setShowRefreshPrompt(true);
            }
        }
    }, [serverUser, localIsLoaded, user]);

    const refresh = useCallback(async () => {
        await refreshQuery();
    }, [refreshQuery]);

  const activeUser = serverUser || user;

  /** Matches `lib/suite/auth` (string or populated `{ name }` role from API). */
  const isAdmin = userIsManagementAdmin(activeUser);
  /** True Admin/CEO/etc. — bypasses permission keys. Sub Admin does NOT. */
  const isUnrestrictedAdmin = userIsUnrestrictedAdmin(activeUser);
  const hasExecutiveAccess = userHasExecutiveDashboardAccess(activeUser);
  const canViewCrmRevenue = userCanViewCrmRevenue(activeUser);
  const permittedTools: string[] = useMemo(() => {
    const tools = activeUser?.permittedTools || [];
    return tools.map((t: string) =>
      String(t || "")
        .trim()
        .toUpperCase(),
    );
  }, [activeUser]);

  const permissions = useMemo(() => {
    if (!activeUser) return [];
    let allPerms: string[] = [];

    const roleObj = activeUser.roleId;
    if (roleObj && typeof roleObj === "object") {
      allPerms =
        roleObj.permissions?.map((p: any) =>
          typeof p === "string" ? p : p.key || p.name,
        ) || [];
      if (Array.isArray(activeUser.permissions)) {
        allPerms = [...new Set([...allPerms, ...activeUser.permissions])];
      }
      if (Array.isArray(roleObj.crmPermissions)) {
        allPerms = [...allPerms, ...roleObj.crmPermissions];
      }
      if (Array.isArray(roleObj.pmPermissions)) {
        allPerms = [...allPerms, ...roleObj.pmPermissions];
      }
    } else if (Array.isArray(activeUser.permissions)) {
      allPerms = [...activeUser.permissions];
    } else {
      allPerms = getEffectiveHrmsPermissions(activeUser);
    }

    // Merge explicit CRM and PM permissions into the list
    if (Array.isArray(activeUser.crmPermissions)) {
      allPerms = [...allPerms, ...activeUser.crmPermissions];
    }
    if (Array.isArray(activeUser.pmPermissions)) {
      allPerms = [...allPerms, ...activeUser.pmPermissions];
    }
    return [...new Set(allPerms.filter(Boolean))];
  }, [activeUser]);

  const hasVaultHrmsAccess = useMemo(() => {
    if (isUnrestrictedAdmin) return true;
    // VAULT in permittedTools is the master switch (same pattern as CRM/PM/SOCIAL)
    if (permittedTools.includes("VAULT")) return true;
    if (hrmsPermissionListHasHrAdminAccess(permissions)) return true;
    return permissions.some((p) => p === "vault" || p.startsWith("vault:"));
  }, [isUnrestrictedAdmin, permittedTools, permissions]);

  const hasToolAccess = useCallback(
    (tool: string) => {
      if (!isLoaded) return false;
      if (isUnrestrictedAdmin) return true;
      const key = String(tool || "")
        .trim()
        .toUpperCase();
      if (permittedTools.includes(key)) return true;
      if (key === "VAULT") return hasVaultHrmsAccess;
      return false;
    },
    [isLoaded, isUnrestrictedAdmin, permittedTools, hasVaultHrmsAccess],
  );

  const hasAccess = useCallback(
    (permission: string) => {
      if (!isLoaded) return false;
      // Sub Admin / Manager / etc. must use explicit grants — only true admins bypass.
      if (isUnrestrictedAdmin) return true;

      const key = String(permission || "").trim();
      const suite = permissionSuite(key);
      const isVaultPerm = key.startsWith("vault:") || key === "vault";

      if (suite === "pm" && !hasToolAccess("PM")) return false;
      if (suite === "crm" && !hasToolAccess("CRM")) return false;
      if (suite === "social" && !hasToolAccess("SOCIAL")) return false;
      if (isVaultPerm && !hasToolAccess("VAULT")) return false;

      // Sensitive CRM buttons: deny by default for Sub Admin / employees.
      // Only an explicit key on crmPermissions (from Staff Management) unlocks.
      if (/:(delete|import|export)$/i.test(key)) {
        const crmPerms = Array.isArray(activeUser?.crmPermissions)
          ? activeUser.crmPermissions
          : [];
        return crmPerms.includes(key);
      }

      if (isVaultPerm) {
        return hasVaultHrmsAccess;
      }

      const registryResult = checkRegistryPermissionAccess(permissions, key);
      if (registryResult !== "not-gated") {
        return registryResult;
      }

      if (key === "tech-services:read") {
        return isPlatformTechServicesAdmin(activeUser);
      }

      if (key.startsWith("crm:")) {
        const tail = key.slice(4);
        return permissions.some(
          (p) => p === key || p === tail || p.startsWith(`${tail}:`),
        );
      }

      return false;
    },
    [isLoaded, isUnrestrictedAdmin, permissions, hasVaultHrmsAccess, hasToolAccess, activeUser],
  );

  // Helper to get default accessible module for redirection
  const getDefaultRoute = () => {
    if (!isLoaded) return "/";
    return "/crm/workspace";
  };

  /**
   * Resolves the target href for a given tool based on user permissions.
   * CRM-only repo: non-CRM tools fall back to CRM workspace.
   */
  const getToolLandingPage = useCallback(
    (toolId: string) => {
      if (!isLoaded) return "/";
      if (toolId === "client-portals") return "/client-portals";
      if (toolId === "crm" || isAdmin) return "/crm/workspace";

      const perms = permissions;
      if (
        perms.includes("dashboard") ||
        perms.includes("dashboard:read") ||
        perms.includes("crm:read")
      ) {
        return "/crm/workspace";
      }
      if (
        perms.includes("leads") ||
        perms.includes("leads:read") ||
        perms.includes("crm:leads")
      ) {
        return "/crm/leads";
      }
      if (
        perms.includes("deals") ||
        perms.includes("deals:read") ||
        perms.includes("crm:deals")
      ) {
        return "/crm/deals";
      }
      return "/crm/workspace";
    },
    [isLoaded, isAdmin, permissions],
  );

  return {
    hasAccess,
    isAdmin,
    hasExecutiveAccess,
    canViewCrmRevenue,
    user: activeUser,
    isLoaded,
    getDefaultRoute,
    getToolLandingPage,
    permissions,
    permittedTools,
    hasToolAccess,
    hasVaultHrmsAccess,
    refresh,
    showRefreshPrompt,
    hasHrmsAccess: hasAnyHrmsModulePermission(activeUser),
  };
}
