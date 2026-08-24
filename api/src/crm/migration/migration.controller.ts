import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { CrmMigrationService } from './migration.service';
import {
  CrmMigrationDuplicateStrategy,
  CrmMigrationEntityType,
  CrmMigrationPlatform,
} from './migration.types';

@Controller('crm/migration')
@UseGuards(JwtAuthGuard, RbacGuard)
export class CrmMigrationController {
  constructor(private readonly migration: CrmMigrationService) {}

  @Get('platforms')
  @Permissions(
    'leads:write',
    'contacts:write',
    'organizations:write',
  )
  listPlatforms() {
    return this.migration.listPlatforms();
  }

  @Get('entities/:entityType/fields')
  @Permissions(
    'leads:write',
    'contacts:write',
    'organizations:write',
  )
  entityFields(@Param('entityType') entityType: string) {
    return this.migration.getEntityTargets(
      entityType as CrmMigrationEntityType,
    );
  }

  @Post('preview')
  @Permissions(
    'leads:write',
    'contacts:write',
    'organizations:write',
  )
  @UseInterceptors(FileInterceptor('file'))
  preview(
    @UploadedFile() file: Express.Multer.File,
    @Body('platform') platform?: string,
    @Body('entityType') entityType?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('file is required');
    }
    return this.migration.previewFile(
      file.buffer,
      (platform || 'custom') as CrmMigrationPlatform,
      (entityType || 'contacts') as CrmMigrationEntityType,
    );
  }

  /** Create an empty job for streamed JSON batches (custom CRM / crore-scale). */
  @Post('jobs')
  @Permissions(
    'leads:write',
    'contacts:write',
    'organizations:write',
  )
  createJob(
    @Request() req: any,
    @Body()
    body: {
      platform?: string;
      entityType?: string;
      mapping?: Record<string, string>;
      duplicateStrategy?: CrmMigrationDuplicateStrategy;
      totalHint?: number;
      sourceFileName?: string;
    },
  ) {
    if (!body?.entityType) {
      throw new BadRequestException('entityType is required');
    }
    return this.migration.createJob({
      platform: (body.platform || 'custom') as CrmMigrationPlatform,
      entityType: body.entityType as CrmMigrationEntityType,
      mapping: body.mapping,
      duplicateStrategy: body.duplicateStrategy,
      user: req.user,
      sourceFileName: body.sourceFileName,
      totalHint: body.totalHint,
    });
  }

  /** Upload Excel/CSV and start async batched import. */
  @Post('jobs/file')
  @Permissions(
    'leads:write',
    'contacts:write',
    'organizations:write',
  )
  @UseInterceptors(FileInterceptor('file'))
  startFileJob(
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body('platform') platform?: string,
    @Body('entityType') entityType?: string,
    @Body('mapping') mappingRaw?: string,
    @Body('duplicateStrategy') duplicateStrategy?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('file is required');
    }
    if (!entityType) {
      throw new BadRequestException('entityType is required');
    }
    let mapping: Record<string, string> | undefined;
    if (mappingRaw) {
      try {
        mapping =
          typeof mappingRaw === 'string'
            ? JSON.parse(mappingRaw)
            : (mappingRaw as any);
      } catch {
        throw new BadRequestException('mapping must be valid JSON');
      }
    }
    return this.migration.startFileJob({
      platform: (platform || 'custom') as CrmMigrationPlatform,
      entityType: entityType as CrmMigrationEntityType,
      buffer: file.buffer,
      mapping,
      duplicateStrategy: duplicateStrategy as CrmMigrationDuplicateStrategy,
      user: req.user,
      sourceFileName: file.originalname,
    });
  }

  /** Stream a JSON batch into an existing job (custom CRM API / ETL). */
  @Post('jobs/:jobId/batches')
  @Permissions(
    'leads:write',
    'contacts:write',
    'organizations:write',
  )
  ingestBatch(
    @Param('jobId') jobId: string,
    @Body()
    body: {
      rows?: Record<string, unknown>[];
      alreadyCanonical?: boolean;
    },
  ) {
    return this.migration.ingestBatch(jobId, body?.rows || [], {
      alreadyCanonical: !!body?.alreadyCanonical,
    });
  }

  @Get('jobs')
  @Permissions(
    'leads:write',
    'contacts:write',
    'organizations:write',
    'leads:read',
  )
  listRecent(@Query('limit') limit?: string) {
    return this.migration.listJobs(limit ? Number(limit) : 25);
  }

  @Post('jobs/:jobId/revert')
  @Permissions(
    'leads:write',
    'contacts:write',
    'organizations:write',
  )
  revertJob(@Param('jobId') jobId: string) {
    return this.migration.revertJob(jobId);
  }

  @Get('jobs/:jobId')
  @Permissions(
    'leads:write',
    'contacts:write',
    'organizations:write',
    'leads:read',
  )
  getJob(@Param('jobId') jobId: string) {
    return this.migration.getJob(jobId);
  }

  @Post('jobs/:jobId/complete')
  @Permissions(
    'leads:write',
    'contacts:write',
    'organizations:write',
  )
  completeJob(@Param('jobId') jobId: string) {
    return this.migration.completeJob(jobId);
  }
}
