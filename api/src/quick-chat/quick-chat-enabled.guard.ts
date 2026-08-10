import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Quick Chat REST + admin routes — off unless `QUICK_CHAT_ENABLED=true`. */
@Injectable()
export class QuickChatEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(_context: ExecutionContext): boolean {
    const raw = this.config.get<string>('QUICK_CHAT_ENABLED', '');
    if (String(raw).toLowerCase() === 'true') return true;
    throw new ForbiddenException(
      'Quick chat is disabled. Set QUICK_CHAT_ENABLED=true on the API to enable.',
    );
  }
}
