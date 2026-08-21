import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditLogService } from './audit-log.service';
import { buildAuditLogDescription } from './audit-log.util';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly auditLogService: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, user, ip } = request;

    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(async (response) => {
        const module = this.getModuleFromUrl(url);
        const action = this.getActionFromMethod(method, url);

        const blocklist = [
          'system',
          'session',
          'token',
          'auth',
          'health',
          'metrics',
          'logs',
          'sync-tokens',
          'sync-meta',
          'inbox-accounts',
          'search',
          'reporting',
          'notifications',
        ];
        if (blocklist.includes(module)) return;

        if (!user || !module) return;

        try {
          const userName =
            `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
            user.email ||
            'A user';

          const entityId = this.extractEntityId(response, request, body);
          const entityName = this.extractEntityName(response, module);
          const changes = ['PUT', 'PATCH'].includes(method)
            ? this.sanitizeChanges(body)
            : undefined;

          const description = buildAuditLogDescription({
            userName,
            action,
            module,
            entityName,
            entityId: entityId || undefined,
            changes,
          });

          await this.auditLogService.logAction({
            user: user.userId || user._id,
            action,
            module,
            entityId: entityId || undefined,
            description,
            ipAddress: ip,
            userAgent: request.headers['user-agent'],
            changes,
          });
        } catch (err) {
          console.error('AuditLogInterceptor Error:', err);
        }
      }),
    );
  }

  private extractEntityId(
    response: unknown,
    request: { params?: Record<string, string> },
    body: Record<string, unknown> | undefined,
  ): string | null {
    const candidates = [
      (response as { _id?: unknown })?._id,
      request.params?.id,
      body?._id,
      body?.id,
      (response as { data?: { _id?: unknown } })?.data?._id,
    ];
    for (const c of candidates) {
      if (c == null) continue;
      const id = String(c).trim();
      if (/^[a-f0-9]{24}$/i.test(id)) return id;
    }
    return null;
  }

  private extractEntityName(
    response: unknown,
    module: string,
  ): string {
    if (!response || typeof response !== 'object') return '';
    const r = response as Record<string, unknown>;
    const m = module.toLowerCase();

    if (m === 'leads' || m === 'contacts') {
      const first = String(r.firstName || '').trim();
      const last = String(r.lastName || '').trim();
      const name = `${first} ${last}`.trim();
      if (name) return name;
      if (r.email) return String(r.email);
    }
    if (r.name) return String(r.name);
    if (r.title) return String(r.title);
    if (r.email) return String(r.email);
    if (r.subject) return String(r.subject);
    return '';
  }

  private sanitizeChanges(
    body: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return undefined;
    }
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(body)) {
      if (
        ['password', 'token', 'refreshToken', 'accessToken', 'secret'].includes(
          key,
        )
      ) {
        out[key] = '[redacted]';
      } else {
        out[key] = val;
      }
    }
    return Object.keys(out).length ? out : undefined;
  }

  private getModuleFromUrl(url: string): string {
    const urlWithoutQuery = url.split('?')[0];

    const crmMatch = urlWithoutQuery.match(/\/crm\/([a-zA-Z0-9_-]+)/);
    if (crmMatch?.[1]) {
      const segment = crmMatch[1];
      if (segment === 'follow-up-sequence') return 'workflows';
      return segment;
    }

    if (urlWithoutQuery.includes('/audit-logs')) return 'audit-logs';
    if (urlWithoutQuery.includes('/crm-users')) return 'crm-users';
    if (urlWithoutQuery.includes('/custom-fields')) return 'custom-fields';
    if (urlWithoutQuery.includes('/email-templates')) return 'email-templates';

    const usersMatch = urlWithoutQuery.match(/\/users\/([a-zA-Z0-9_-]+)/);
    if (usersMatch?.[1] === 'roles') return 'roles';
    if (urlWithoutQuery.includes('/users')) return 'users';

    return 'system';
  }

  private getActionFromMethod(method: string, url: string): string {
    const path = url.toLowerCase();
    if (path.includes('bulk-delete')) return 'bulk-delete';
    if (path.includes('convert')) return 'convert';
    if (path.includes('enroll')) return 'enroll';
    if (path.includes('cancel')) return 'cancel';
    if (path.includes('/start')) return 'start';
    if (path.includes('transfer-lead')) return 'transfer';

    switch (method) {
      case 'POST':
        return 'create';
      case 'PUT':
      case 'PATCH':
        return 'update';
      case 'DELETE':
        return 'delete';
      default:
        return 'action';
    }
  }
}
