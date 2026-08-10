import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { isStrictPlatformAdmin } from './platform-super-admin.util';

@Injectable()
export class StrictAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }
    if (!isStrictPlatformAdmin(user)) {
      throw new ForbiddenException(
        'Only users with the Admin role may access platform data export or import',
      );
    }
    return true;
  }
}
