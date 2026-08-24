import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AssociationsService } from './associations.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';

@Controller('crm/associations')
@UseGuards(JwtAuthGuard, RbacGuard)
export class AssociationsController {
  constructor(private readonly associationsService: AssociationsService) {}

  @Get('types')
  @Permissions(
    'leads:read',
    'contacts:read',
    'organizations:read',
    'clients:read',
    'settings:read',
  )
  listTypes() {
    return this.associationsService.listAssociationTypes();
  }

  @Get()
  @Permissions(
    'leads:read',
    'contacts:read',
    'organizations:read',
    'clients:read',
    'settings:read',
  )
  listForRecord(
    @Query('objectType') objectType: string,
    @Query('objectId') objectId: string,
    @Query('associationType') associationType?: string,
    @Query('limit') limit?: string,
    @Query('afterId') afterId?: string,
  ) {
    return this.associationsService.listForRecord(objectType, objectId, {
      associationType,
      limit: limit ? Number(limit) : undefined,
      afterId,
    });
  }

  @Post()
  @Permissions(
    'leads:write',
    'contacts:write',
    'organizations:write',
    'clients:write',
    'settings:write',
  )
  create(@Request() req: any, @Body() body: any) {
    return this.associationsService.createEdge({
      ...body,
      createdBy: req.user?.userId || req.user?.id || req.user?._id,
      source: body?.source || 'api',
    });
  }

  @Delete()
  @Permissions(
    'leads:write',
    'contacts:write',
    'organizations:write',
    'clients:write',
    'settings:write',
  )
  remove(@Request() req: any, @Body() body: any) {
    return this.associationsService.removeEdge({
      ...body,
      userId: req.user?.userId || req.user?.id || req.user?._id,
    });
  }

  @Post('backfill')
  @Permissions('settings:write', 'admin:manage')
  backfill(
    @Body()
    body?: {
      modules?: string[];
      module?: string;
      afterId?: string;
      batchSize?: number;
      maxBatches?: number;
    },
  ) {
    return this.associationsService.backfillFromLegacyArrays(body);
  }
}
