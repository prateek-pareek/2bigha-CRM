import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { getEffectiveHrmsPermissions, userHasHrmsModuleAction } from './hrms-permissions.util';
import { hrmsModuleIdForApiUrl } from './permission-registry';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    try {
      const requiredRoles = this.reflector.getAllAndOverride<string[]>(
        ROLES_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (!requiredRoles) {
        return true;
      }
      const request = context.switchToHttp().getRequest();
      const { user, url } = request;

      if (!user || !user.role) {
        console.error('[RolesGuard] Access denied: User or role missing');
        return false;
      }

      const userDoc = user;
      const userRole = (userDoc.role || '').toString().toLowerCase();

      // Management roles always have access
      const managementRoles = [
        'admin',
        'administrator',
        'ceo',
        'cto',
        'manager',
        'executive',
        'senior member',
        'sub admin',
        'subadmin',
      ];
      if (managementRoles.includes(userRole)) return true;

      // Check if user has one of the required roles
      const hasRole = requiredRoles.some(
        (role) => userRole === role.toLowerCase(),
      );

      if (hasRole) return true;

      const path = hrmsModuleIdForApiUrl(url);
      const method = request.method;

      let requiredAction: 'read' | 'create' | 'edit' | 'delete' = 'read';
      if (method === 'DELETE') {
        requiredAction = 'delete';
      } else if (method === 'POST') {
        requiredAction = 'create';
      } else if (['PUT', 'PATCH'].includes(method)) {
        requiredAction = 'edit';
      }

      const effectivePerms = getEffectiveHrmsPermissions(userDoc);
      if (
        path &&
        userHasHrmsModuleAction(
          { ...userDoc, permissions: effectivePerms },
          path,
          requiredAction,
        )
      ) {
        return true;
      }

      if (effectivePerms && Array.isArray(effectivePerms)) {
        const perms: string[] = effectivePerms;
        const hasAccess = perms.some((p: string) => {
          if (!path) return false;
          if (p === path) return true;
          if (p === `${path}:write`) return true;
          if (
            requiredAction === 'read' &&
            (p === `${path}:read` || p === `${path}:write`)
          )
            return true;
          if (
            requiredAction === 'create' &&
            (p === `${path}:create` || p === `${path}:write`)
          )
            return true;
          if (
            requiredAction === 'edit' &&
            (p === `${path}:edit` || p === `${path}:write`)
          )
            return true;
          if (
            requiredAction === 'delete' &&
            (p === `${path}:delete` || p === `${path}:write`)
          )
            return true;
          return false;
        });

        if (hasAccess) return true;
      }

      console.warn(
        `[RolesGuard] Access denied for ${userDoc.email}. Role: ${userDoc.role}, Path: ${path}, Required Action: ${requiredAction}`,
      );
      return false;
    } catch (error) {
      console.error(
        `[RolesGuard] CRITICAL ERROR: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }
}
