import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

@Injectable()
export class InternalPortalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const clientKey = request.headers['x-internal-key'];
    const serverKey = process.env.INTERNAL_CLIENT_PORTAL_KEY;

    if (!serverKey || clientKey !== serverKey) {
      throw new ForbiddenException('Invalid or missing internal key.');
    }
    return true;
  }
}
