import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CRMUsersService } from './crm-users.service';
import { CRMUsersController } from './crm-users.controller';
import { TwoBighaAgentService } from './twobigha-agent.service';
import { CRMUser, CRMUserSchema } from './schemas/user.schema';
import { Role, RoleSchema } from './schemas/role.schema';
import { Permission, PermissionSchema } from './schemas/permission.schema';
import { UserConfig, UserConfigSchema } from './schemas/user-config.schema';
import { TrashModule } from '../trash/trash.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature(
      [
        { name: CRMUser.name, schema: CRMUserSchema },
        { name: Role.name, schema: RoleSchema },
        { name: Permission.name, schema: PermissionSchema },
        { name: UserConfig.name, schema: UserConfigSchema },
      ],
      'crmConnection',
    ),
    TrashModule,
  ],
  controllers: [CRMUsersController],
  providers: [CRMUsersService, TwoBighaAgentService],
  exports: [CRMUsersService, MongooseModule],
})
export class CRMUsersModule {}
