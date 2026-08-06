import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../audit.service';
import { Connection, Types } from 'mongoose';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private auditService: AuditService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, user, ip } = request;

    if (typeof url === 'string' && url.includes('/admin/platform-data')) {
      return next.handle();
    }

    // Only log mutation methods (POST, PATCH, DELETE)
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const urlPath = String(request.path || url || '');
    const pathParts = urlPath.split('/').filter(Boolean);
    const documentType = pathParts[0] || 'unknown';
    const documentIdRaw = request.params?.id || pathParts[pathParts.length - 1];
    const shouldFetchPrevious =
      ['PATCH', 'PUT', 'DELETE'].includes(method) &&
      typeof documentIdRaw === 'string' &&
      Types.ObjectId.isValid(documentIdRaw);
    const previousSnapshotPromise: Promise<Record<string, any> | null> =
      shouldFetchPrevious
        ? this.connection
            .collection(documentType)
            .findOne({ _id: new Types.ObjectId(documentIdRaw) })
            .catch(() => null)
        : Promise.resolve(null);

    return next.handle().pipe(
      tap(async (data) => {
        if (!user || !user.userId) return;

        const documentId = data?._id || documentIdRaw;
        if (!documentId) return;
        if (!Types.ObjectId.isValid(String(documentId))) return;

        let action = 'update';
        if (method === 'POST') action = 'create';
        if (method === 'DELETE') action = 'delete';

        const previousSnapshot = await previousSnapshotPromise;
        await this.auditService.log({
          userId: user.userId,
          action,
          documentType,
          documentId,
          changes: this.extractChanges(body, data, previousSnapshot, action),
          ipAddress: ip,
          userAgent: request.headers['user-agent'],
        });
      }),
    );
  }

  private extractChanges(
    body: any,
    data: any,
    previousSnapshot: Record<string, any> | null,
    action: string,
  ) {
    if (action === 'create' || action === 'delete') return [];

    const changes = [];
    for (const key in body) {
      if (body.hasOwnProperty(key)) {
        changes.push({
          field: key,
          oldValue: previousSnapshot ? previousSnapshot[key] : undefined,
          newValue: body[key],
        });
      }
    }
    return changes;
  }
}
