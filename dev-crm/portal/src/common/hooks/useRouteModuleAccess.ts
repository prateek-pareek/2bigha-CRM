'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  defaultReadPermission,
  hrmsModuleForPathname,
} from '@/lib/permissions/registry';
import { usePermissions } from '@/hooks/usePermissions';

/**
 * Deny-by-default gate for HRMS pages — resolves module from pathname via registry routes.
 * Add the route prefix to PERMISSION_MODULES when introducing a new HRMS module.
 */
export function useRequireHrmsRouteAccess(options?: { redirectTo?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoaded, isAdmin, hasAccess } = usePermissions();
  const redirectTo = options?.redirectTo ?? '/unauthorized';

  const module = hrmsModuleForPathname(pathname);
  const requiredPermission = module
    ? defaultReadPermission(module.id)
    : null;
  const allowed =
    !isLoaded ||
    isAdmin ||
    !requiredPermission ||
    hasAccess(requiredPermission) ||
    hasAccess(module?.id ?? '');

  useEffect(() => {
    if (!isLoaded) return;
    if (isAdmin) return;
    if (!requiredPermission) return;
    if (!allowed) {
      router.replace(redirectTo);
    }
  }, [isLoaded, isAdmin, requiredPermission, allowed, router, redirectTo]);

  return {
    isLoaded,
    allowed,
    requiredPermission,
    module,
  };
}
