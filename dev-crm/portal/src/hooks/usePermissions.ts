"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/hrms/api";
import { useAuthStore } from "@/store/pm/auth-store";
import {
  hasAnyHrmsModulePermission,
  hrmsPermissionListHasModuleAccess,
  hrmsPermissionListHasHrAdminAccess,
  hrmsPermissionListHasOverviewModuleAccess,
  hrmsPermissionListHasBenefitsAccess,
  isAdmin as userIsManagementAdmin,
  hasExecutiveDashboardAccess as userHasExecutiveDashboardAccess,
  isPlatformTechServicesAdmin,
  canViewCrmRevenue as userCanViewCrmRevenue,
  getEffectiveHrmsPermissions,
} from "@/lib/hrms/auth";
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
        staleTime: 60000,      // Consider it fresh for 60 seconds
    });

    // Synchronize query data with LocalStorage and PM Auth Store
    useEffect(() => {
        if (!serverUser || !localIsLoaded) return;

        if (!user) {
            const serverTools = serverUser.permittedTools || [];
            const normalizedUser = {
                ...serverUser,
                permittedTools: serverTools.map((t: string) => (t || '').toUpperCase()),
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

        if (accessChanged || securityChanged) {
            const existingTools = user.permittedTools || [];
            const serverTools = serverUser.permittedTools || [];
            const mergedTools = Array.from(new Set([
                ...existingTools,
                ...serverTools.map((t: string) => (t || '').toUpperCase())
            ]));

            const updatedUser = { 
                ...user, 
                ...serverUser,
                permittedTools: mergedTools,
                version: serverTokenVersion, 
                access_version: serverAccessVersion 
            };

            localStorage.setItem('user', JSON.stringify(updatedUser));
            
            const pmToken = localStorage.getItem('pm_token') || localStorage.getItem('token');
            useAuthStore.getState().setAuth(updatedUser, pmToken || '');

            setUser(updatedUser);
            setShowRefreshPrompt(true);
        }
    }, [serverUser, localIsLoaded, user]);

    const refresh = useCallback(async () => {
        await refreshQuery();
    }, [refreshQuery]);

  const activeUser = serverUser || user;

  /** Matches `lib/hrms/auth` (string or populated `{ name }` role from API). */
  const isAdmin = userIsManagementAdmin(activeUser);
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
    if (isAdmin) return true;
    // VAULT in permittedTools is the master switch (same pattern as CRM/PM/SOCIAL)
    if (permittedTools.includes("VAULT")) return true;
    if (hrmsPermissionListHasHrAdminAccess(permissions)) return true;
    return permissions.some((p) => p === "vault" || p.startsWith("vault:"));
  }, [isAdmin, permittedTools, permissions]);

  const hasToolAccess = useCallback(
    (tool: string) => {
      if (!isLoaded) return false;
      if (isAdmin) return true;
      const key = String(tool || "")
        .trim()
        .toUpperCase();
      if (permittedTools.includes(key)) return true;
      if (key === "VAULT") return hasVaultHrmsAccess;
      return false;
    },
    [isLoaded, isAdmin, permittedTools, hasVaultHrmsAccess],
  );

  const hasAccess = useCallback(
    (permission: string) => {
      if (!isLoaded) return false;
      if (isAdmin) return true;

      const key = String(permission || "").trim();
      const suite = permissionSuite(key);
      const isVaultPerm = key.startsWith("vault:") || key === "vault";

      if (suite === "pm" && !hasToolAccess("PM")) return false;
      if (suite === "crm" && !hasToolAccess("CRM")) return false;
      if (suite === "social" && !hasToolAccess("SOCIAL")) return false;
      if (isVaultPerm && !hasToolAccess("VAULT")) return false;

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
    [isLoaded, isAdmin, permissions, hasVaultHrmsAccess, hasToolAccess, activeUser],
  );

  // Helper to get default accessible module for redirection
  const getDefaultRoute = () => {
    if (!isLoaded) return "/";
    if (isAdmin || permittedTools.includes("CRM")) return "/crm/workspace";
    if (hasAccess("clients:read")) return "/client-portals";
    return "/unauthorized";
  };

  /**
   * Resolves the target href for a given tool based on user permissions.
   * This prevents non-admin employees (who lack access to default dashboards like /hrms/dashboard)
   * from hitting unauthorized layout gates by routing them to the first module
   * they actually have permission to view (e.g. /hrms/announcements or /crm/leads).
   */
  const getToolLandingPage = useCallback(
    (toolId: string) => {
      if (!isLoaded) return "/";
      if (isAdmin) {
        if (toolId === "hrms") return "/hrms/dashboard";
        if (toolId === "crm") return "/crm/workspace";
        if (toolId === "pm") return "/pm/boards";
        if (toolId === "executive") return "/executive";
        if (toolId === "vault") return "/vault";
        if (toolId === "client-portals") return "/client-portals";
        if (toolId === "social") return "/social";
        return "/";
      }

      const perms = permissions;

      if (toolId === "hrms") {
        if (perms.includes("dashboard") || perms.includes("dashboard:read")) {
          return "/hrms/dashboard";
        }
        if (perms.includes("announcements") || perms.includes("announcements:read")) {
          return "/hrms/announcements";
        }
        if (perms.includes("leaves") || perms.includes("leaves:read")) {
          return "/hrms/leaves";
        }
        if (perms.includes("timesheets") || perms.includes("timesheets:read")) {
          return "/hrms/timesheets";
        }
        return "/hrms/announcements"; // Fallback
      }

      if (toolId === "crm") {
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
      }

      if (toolId === "pm") {
        if (
          perms.includes("boards") ||
          perms.includes("boards:read") ||
          perms.includes("pm:read")
        ) {
          return "/pm/boards";
        }
        return "/pm/for-you";
      }

      if (toolId === "vault") return "/vault";
      if (toolId === "social") return "/social";
      if (toolId === "client-portals") return "/client-portals";

      return "/";
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
