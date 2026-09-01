import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CRMUsersModule } from '../crm-users/crm-users.module';
import { Lead, LeadSchema } from '../records/schemas/lead.schema';
import { Client, ClientSchema } from '../records/schemas/client.schema';
import { TwoBighaVisitsService } from './twobigha-visits.service';
import { VisitsController } from './visits.controller';

@Module({
  imports: [
    CRMUsersModule,
    MongooseModule.forFeature(
      [
        { name: Lead.name, schema: LeadSchema },
        { name: Client.name, schema: ClientSchema },
      ],
      'crmConnection',
    ),
  ],
  controllers: [VisitsController],
  providers: [TwoBighaVisitsService],
  exports: [TwoBighaVisitsService],
})
export class VisitsModule {}
