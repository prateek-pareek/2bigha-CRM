import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { hasExecutiveDashboardAccess } from './executive-access.util';

@Injectable()
export class ExecutiveAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (hasExecutiveDashboardAccess(user)) return true;
    throw new ForbiddenException(
      'CEO dashboard access is restricted. Ask an admin to grant the Executive tool.',
    );
  }
}
