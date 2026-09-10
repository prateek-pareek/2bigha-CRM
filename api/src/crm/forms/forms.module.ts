import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FormDefinition, FormDefinitionSchema } from './schemas/form-definition.schema';
import { FormSubmission, FormSubmissionSchema } from './schemas/form-submission.schema';
import { FormsService } from './forms.service';
import { FormSubmissionsService } from './form-submissions.service';
import { FormsController } from './forms.controller';
import { FormsPublicController } from './forms-public.controller';
import { CRMModule } from '../crm.module';

@Module({
  imports: [
    // CRMModule re-exports MongooseModule so RbacGuard's CRMUsersService chain
    // is available, and exports CRMService so FormSubmissionsService can
    // create Leads through the same path every other lead source uses.
    CRMModule,
    MongooseModule.forFeature(
      [
        { name: FormDefinition.name, schema: FormDefinitionSchema },
        { name: FormSubmission.name, schema: FormSubmissionSchema },
      ],
      'crmConnection',
    ),
  ],
  controllers: [FormsController, FormsPublicController],
  providers: [FormsService, FormSubmissionsService],
  exports: [FormsService],
})
export class FormsModule {}
