import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  userCanMutateCustomRoles,
  userCanReadCustomRoles,
} from './hrms-permissions.util';

@Injectable()
export class CustomRolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (!req.user) {
      throw new ForbiddenException('Not authenticated');
    }

    const method = String(req.method || 'GET').toUpperCase();
    const allowed =
      method === 'GET' || method === 'HEAD'
        ? userCanReadCustomRoles(req.user)
        : userCanMutateCustomRoles(req.user);

    if (!allowed) {
      throw new ForbiddenException('Not authorized to manage custom roles');
    }
    return true;
  }
}
