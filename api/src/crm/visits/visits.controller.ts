import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { TwoBighaVisitsService } from './twobigha-visits.service';

function qInt(value?: string): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function qStr(value?: string): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

/**
 * REST proxy for 2bigha Visit Tracking & History (handbook §4).
 * Frontend never talks to 2bigha GraphQL directly — same boundary as
 * legal-verification-queue and property-listings twobigha routes.
 *
 * Any of leads:read / property_listings:read / clients:read is enough:
 * PM calling agents need this on a lead call, property staff need the
 * admin listing, client detail needs the same history.
 */
@Controller('crm/visits')
@UseGuards(JwtAuthGuard, RbacGuard)
@Permissions('leads:read', 'property_listings:read', 'clients:read')
export class VisitsController {
  constructor(private readonly visits: TwoBighaVisitsService) {}

  @Get('context/lead/:leadId')
  contextForLead(
    @Param('leadId') leadId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.visits.getContextForLead(leadId, {
      page: qInt(page),
      limit: qInt(limit),
    });
  }

  @Get('context/client/:clientId')
  contextForClient(
    @Param('clientId') clientId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.visits.getContextForClient(clientId, {
      page: qInt(page),
      limit: qInt(limit),
    });
  }

  @Get('field-visits')
  listAllFieldVisits(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('agentId') agentId?: string,
    @Query('userPropertyId') userPropertyId?: string,
    @Query('visitCategory') visitCategory?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.visits.getAllFieldVisits({
      page: qInt(page),
      limit: qInt(limit),
      status: qStr(status),
      agentId: qStr(agentId),
      userPropertyId: qStr(userPropertyId),
      visitCategory: qStr(visitCategory),
      startDate: qStr(startDate),
      endDate: qStr(endDate),
    });
  }

  @Get('field-visits/by-user/:userId')
  fieldVisitsByUser(
    @Param('userId') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!userId?.trim()) throw new BadRequestException('userId is required');
    return this.visits.getFieldVisitByUserId(userId.trim(), {
      page: qInt(page),
      limit: qInt(limit),
    });
  }

  @Get('field-visits/by-property/:managePropertyId')
  fieldVisitsByProperty(
    @Param('managePropertyId') managePropertyId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!managePropertyId?.trim()) {
      throw new BadRequestException('managePropertyId is required');
    }
    return this.visits.getFieldVisitByPropertyId(managePropertyId.trim(), {
      page: qInt(page),
      limit: qInt(limit),
    });
  }

  @Get('field-visits/:fieldVisitId')
  fieldVisitDetailed(@Param('fieldVisitId', ParseIntPipe) fieldVisitId: number) {
    return this.visits.getFieldVisitsDetailed(fieldVisitId);
  }

  @Get('reports')
  visitReports(
    @Query('userPropertyId') userPropertyId?: string,
    @Query('reportStatus') reportStatus?: string,
    @Query('purpose') purpose?: string,
  ) {
    return this.visits.getVisitReports({
      userPropertyId: qStr(userPropertyId),
      reportStatus: qStr(reportStatus),
      purpose: qStr(purpose),
    });
  }

  @Get('reports/by-property/:propertyId')
  reportsByProperty(
    @Param('propertyId') propertyId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!propertyId?.trim()) throw new BadRequestException('propertyId is required');
    return this.visits.getAllVisitReportsByPropertyId(propertyId.trim(), {
      page: qInt(page),
      limit: qInt(limit),
    });
  }

  @Get('reports/:reportId')
  reportDetails(@Param('reportId', ParseIntPipe) reportId: number) {
    return this.visits.getVisitReportDetailsByReportId(reportId);
  }

  @Get('requests')
  listVisitRequests(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('subscriptionStatus') subscriptionStatus?: string,
    @Query('status') status?: string,
    @Query('purpose') purpose?: string,
    @Query('propertyId') propertyId?: string,
    @Query('searchTerm') searchTerm?: string,
    @Query('managerId') managerId?: string,
    @Query('agentId') agentId?: string,
    @Query('userId') userId?: string,
  ) {
    return this.visits.getAllVisitRequests({
      page: qInt(page),
      limit: qInt(limit),
      subscriptionStatus: qStr(subscriptionStatus),
      status: qStr(status),
      purpose: qStr(purpose),
      propertyId: qStr(propertyId),
      searchTerm: qStr(searchTerm),
      managerId: qStr(managerId),
      agentId: qStr(agentId),
      userId: qStr(userId),
    });
  }

  @Get('requests/by-property/:managePropertyId')
  requestsByProperty(
    @Param('managePropertyId') managePropertyId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!managePropertyId?.trim()) {
      throw new BadRequestException('managePropertyId is required');
    }
    return this.visits.getVisitRequestByPropertyId(managePropertyId.trim(), {
      page: qInt(page),
      limit: qInt(limit),
    });
  }

  @Get('requests/:visitRequestId')
  visitRequestById(@Param('visitRequestId') visitRequestId: string) {
    if (!visitRequestId?.trim()) {
      throw new BadRequestException('visitRequestId is required');
    }
    return this.visits.getVisitRequestById(visitRequestId.trim());
  }
}
