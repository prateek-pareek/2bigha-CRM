import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CRMUser, CRMUserSchema } from '../../crm-users/schemas/user.schema';
import { Role, RoleSchema } from '../../crm-users/schemas/role.schema';
import { User, UserSchema } from '../../../users/schemas/user.schema';
import { HrmsOutboundService } from './hrms-outbound.service';

/** Global so CRM users/roles services in any module can notify HRMS of RBAC changes. */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    MongooseModule.forFeature(
      [
        { name: CRMUser.name, schema: CRMUserSchema },
        { name: Role.name, schema: RoleSchema },
      ],
      'crmConnection',
    ),
  ],
  providers: [HrmsOutboundService],
  exports: [HrmsOutboundService],
})
export class HrmsOutboundModule {}
