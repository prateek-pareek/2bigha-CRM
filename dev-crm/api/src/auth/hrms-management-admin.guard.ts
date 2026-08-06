import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { isHrmsManagementAdmin } from './hrms-management-admin.util';

/** HRMS management roles (Admin, CEO, CTO, …) — same as portal `isAdmin`. */
@Injectable()
export class HrmsManagementAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (!req.user) {
      throw new ForbiddenException('Not authenticated');
    }
    if (!isHrmsManagementAdmin(req.user)) {
      throw new ForbiddenException(
        'Only HRMS administrators can view tech service status',
      );
    }
    return true;
  }
}
