import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { isPlatformTechServicesAdmin } from './hrms-management-admin.util';

/** Platform operators only — excludes HR staff with employees:edit / hrms:admin. */
@Injectable()
export class PlatformTechAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (!req.user) {
      throw new ForbiddenException('Not authenticated');
    }
    if (!isPlatformTechServicesAdmin(req.user)) {
      throw new ForbiddenException(
        'Only platform administrators can view tech service status',
      );
    }
    return true;
  }
}
