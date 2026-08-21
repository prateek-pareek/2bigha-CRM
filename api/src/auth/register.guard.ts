import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from '../users/users.service';
import { isStrictPlatformAdmin } from './platform-super-admin.util';

/**
 * POST /auth/register used to be wide open: anyone reaching the API could
 * create an account, and whoever claimed ceo@mathionix.com got full
 * super-admin (see platform-super-admin.util.ts). This guard keeps
 * registration open only until the very first account exists (so the
 * platform can be bootstrapped without a chicken-and-egg login step), then
 * requires an authenticated Admin/super-admin JWT for every signup after that.
 */
@Injectable()
export class RegisterGuard extends AuthGuard('jwt') {
  constructor(private usersService: UsersService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const count = await this.usersService.countAll();
    if (count === 0) {
      return true;
    }

    const authed = (await super.canActivate(context)) as boolean;
    if (!authed) {
      return false;
    }

    const req = context.switchToHttp().getRequest();
    if (!isStrictPlatformAdmin(req.user)) {
      throw new ForbiddenException(
        'Only an existing admin can create new accounts.',
      );
    }
    return true;
  }
}
