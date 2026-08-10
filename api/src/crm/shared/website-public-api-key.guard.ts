import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

/** Same key as blog CMS — `SITE_CMS_PUBLIC_API_KEY` on the marketing site server. */
@Injectable()
export class WebsitePublicApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.SITE_CMS_PUBLIC_API_KEY?.trim();
    if (!expected) {
      throw new ServiceUnavailableException(
        'Website public API is disabled (SITE_CMS_PUBLIC_API_KEY is not set)',
      );
    }
    const req = context.switchToHttp().getRequest<{
      headers?: { authorization?: string; 'x-api-key'?: string };
    }>();
    const auth = String(req.headers?.authorization || '');
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const headerKey = String(req.headers?.['x-api-key'] || '').trim();
    if (bearer !== expected && headerKey !== expected) {
      throw new UnauthorizedException('Invalid or missing website API key');
    }
    return true;
  }
}
