import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { StaffController } from './staff.controller';
import { RolesController } from './roles.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { UserRole, UserRoleSchema } from './schemas/user-role.schema';
import { RoleAuditLog, RoleAuditLogSchema } from './schemas/role-audit-log.schema';
import { CRMUser, CRMUserSchema } from '../crm-users/schemas/user.schema';
import { TrashModule } from '../trash/trash.module';
import { RolesService } from './roles.service';
import { RoleAuditLogService } from './role-audit-log.service';
import { CustomRolesGuard } from '../auth/custom-roles.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: UserRole.name, schema: UserRoleSchema },
      { name: RoleAuditLog.name, schema: RoleAuditLogSchema },
    ]),
    MongooseModule.forFeature(
      [{ name: CRMUser.name, schema: CRMUserSchema }],
      'crmConnection',
    ),
    TrashModule,
  ],
  controllers: [UsersController, StaffController, RolesController],
  providers: [UsersService, RolesService, RoleAuditLogService, CustomRolesGuard],
  exports: [UsersService, RolesService, RoleAuditLogService, MongooseModule],
})
export class UsersModule {}
