import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { WorkflowsService } from './workflows.service';

@Controller('crm/workflows')
@UseGuards(JwtAuthGuard, RbacGuard)
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get('executions/list')
  @Permissions('workflows:read')
  listExecutions(
    @Query('workflowId') workflowId?: string,
    @Query('limit') limit?: string,
    @Query('days') days?: string,
  ) {
    const n = limit
      ? Math.min(500, Math.max(1, parseInt(limit, 10) || 100))
      : 100;
    const dRaw = days != null && days !== '' ? parseInt(days, 10) : NaN;
    const d =
      Number.isFinite(dRaw) && dRaw > 0 ? Math.min(366, dRaw) : undefined;
    return this.workflowsService.listExecutions(workflowId, n, d);
  }

  @Get('pending-jobs/list')
  @Permissions('workflows:read', 'leads:read', 'contacts:read')
  listPendingJobs(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    const et = String(entityType || '').trim();
    if (!['Lead', 'Contact', 'Deal', 'Organization'].includes(et)) {
      throw new BadRequestException(
        'entityType must be Lead, Contact, Deal, or Organization',
      );
    }
    const eid = String(entityId || '').trim();
    if (!eid) {
      throw new BadRequestException('entityId is required');
    }
    return this.workflowsService.listPendingJobsForEntity(
      et as 'Lead' | 'Contact' | 'Deal' | 'Organization',
      eid,
    );
  }

  @Get('follow-up-sequence/schedule')
  @Permissions('workflows:read', 'leads:read', 'contacts:read')
  followUpSchedule(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    const et = String(entityType || '').trim();
    if (et !== 'Lead' && et !== 'Contact') {
      throw new BadRequestException('entityType must be Lead or Contact');
    }
    const eid = String(entityId || '').trim();
    if (!eid) {
      throw new BadRequestException('entityId is required');
    }
    return this.workflowsService.getFollowUpScheduleForEntity(et, eid);
  }

  @Post('follow-up-sequence/cancel')
  @Permissions('workflows:write', 'leads:write', 'contacts:write')
  cancelFollowUpSequence(
    @Body() body: { entityType?: string; entityId?: string },
  ) {
    const et = String(body.entityType || '').trim();
    if (et !== 'Lead' && et !== 'Contact') {
      throw new BadRequestException('entityType must be Lead or Contact');
    }
    const eid = String(body.entityId || '').trim();
    if (!eid) {
      throw new BadRequestException('entityId is required');
    }
    return this.workflowsService
      .cancelPendingJobsForEntity(et, eid, 'Cancelled from record')
      .then((n) => ({ ok: true, cancelled: n }));
  }

  @Get('follow-up-sequence/mailbox-hint')
  @Permissions('workflows:read', 'leads:read', 'contacts:read')
  followUpMailboxHint(
    @Request() req: any,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    const et = String(entityType || '').trim();
    if (et !== 'Lead' && et !== 'Contact') {
      throw new BadRequestException('entityType must be Lead or Contact');
    }
    const eid = String(entityId || '').trim();
    if (!eid) {
      throw new BadRequestException('entityId is required');
    }
    const user = req.user;
    return this.workflowsService.getFollowUpMailboxHint(
      {
        userId: user?.userId || user?._id,
        _id: user?._id,
        firstName: user?.firstName,
        lastName: user?.lastName,
        email: user?.email,
      },
      et,
      eid,
    );
  }

  @Post('follow-up-sequence/start')
  @Permissions('workflows:write', 'leads:write', 'contacts:write')
  startFollowUpSequence(
    @Request() req: any,
    @Body()
    body: {
      entityType?: string;
      entityId?: string;
      inboxAccountId?: string;
      overrideMailbox?: boolean;
      cancelOnReply?: boolean;
      /** Latest tracked outreach token to bind open-wait jobs to. */
      trackingToken?: string;
      firstOutreachEngagement?: {
        firstWait?: {
          waitDays?: number;
          waitHours?: number;
          waitMinutes?: number;
          deadlineAt?: string;
        };
        alternateSteps?: Array<{
          waitDays?: number;
          waitHours?: number;
          waitMinutes?: number;
          deadlineAt?: string;
          sendMode?: 'template' | 'custom' | 'ai_draft';
          templateId?: string;
          subject?: string;
          body?: string;
          aiInstructions?: string;
          inboxAccountId?: string;
        }>;
      };
      firstOutreachIfNotOpened?: {
        waitDays?: number;
        waitHours?: number;
        waitMinutes?: number;
        deadlineAt?: string;
        sendMode?: 'template' | 'custom';
        templateId?: string;
        subject?: string;
        body?: string;
        inboxAccountId?: string;
      };
      steps?: {
        templateId?: string;
        delayDays?: number;
        delayHours?: number;
        delayMinutes?: number;
        scheduledAt?: string;
        inboxAccountId?: string;
        email?: {
          sendMode?: 'template' | 'custom';
          templateId?: string;
          subject?: string;
          body?: string;
          inboxAccountId?: string;
          ifNotOpened?: {
            waitDays?: number;
            waitHours?: number;
            waitMinutes?: number;
            deadlineAt?: string;
            sendMode?: 'template' | 'custom';
            templateId?: string;
            subject?: string;
            body?: string;
            inboxAccountId?: string;
          };
        };
        task?: { title: string; body?: string; dueInDays?: number };
      }[];
    },
  ) {
    const et = String(body.entityType || '').trim();
    if (et !== 'Lead' && et !== 'Contact') {
      throw new BadRequestException('entityType must be Lead or Contact');
    }
    const entityId = String(body.entityId || '').trim();
    if (!entityId) {
      throw new BadRequestException('entityId is required');
    }
    const user = req.user;
    return this.workflowsService.startFollowUpSequence(
      {
        entityType: et,
        entityId,
        inboxAccountId: body.inboxAccountId,
        overrideMailbox: body.overrideMailbox === true,
        cancelOnReply: body.cancelOnReply !== false,
        trackingToken: body.trackingToken?.trim() || undefined,
        firstOutreachEngagement: body.firstOutreachEngagement
          ? {
              firstWait: body.firstOutreachEngagement.firstWait,
              alternateSteps:
                body.firstOutreachEngagement.alternateSteps ?? [],
            }
          : undefined,
        firstOutreachIfNotOpened: body.firstOutreachIfNotOpened,
        steps: (body.steps || []).map((s) => {
          const email = s.email;
          let mappedEmail:
            | {
                sendMode?: 'template' | 'custom';
                templateId?: string;
                subject?: string;
                body?: string;
                inboxAccountId?: string;
              }
            | undefined;
          if (email) {
            mappedEmail = {
              sendMode: email.sendMode,
              templateId: email.templateId
                ? String(email.templateId)
                : undefined,
              subject: email.subject,
              body: email.body,
              inboxAccountId: email.inboxAccountId
                ? String(email.inboxAccountId)
                : s.inboxAccountId
                  ? String(s.inboxAccountId)
                  : undefined,
            };
          } else if (s.templateId) {
            mappedEmail = { sendMode: 'template', templateId: String(s.templateId) };
          }
          return {
            templateId: s.templateId ? String(s.templateId) : undefined,
            delayDays: s.delayDays,
            delayHours: s.delayHours,
            delayMinutes: s.delayMinutes,
            scheduledAt: s.scheduledAt ? String(s.scheduledAt) : undefined,
            inboxAccountId: s.inboxAccountId
              ? String(s.inboxAccountId)
              : undefined,
            email: mappedEmail,
            task: s.task?.title
              ? {
                  title: String(s.task.title),
                  body: s.task.body,
                  dueInDays: s.task.dueInDays,
                }
              : undefined,
          };
        }),
      },
      {
        userId: user?.userId || user?._id,
        _id: user?._id,
        firstName: user?.firstName,
        lastName: user?.lastName,
        email: user?.email,
      },
    );
  }

  @Post('follow-up-sequence/retry-alternates')
  @Permissions('workflows:write', 'leads:write', 'contacts:write')
  retryMissedAlternateSends(
    @Request() req: any,
    @Body() body: { entityType?: string; entityId?: string },
  ) {
    const et = String(body.entityType || '').trim();
    if (et !== 'Lead' && et !== 'Contact') {
      throw new BadRequestException('entityType must be Lead or Contact');
    }
    const entityId = String(body.entityId || '').trim();
    if (!entityId) {
      throw new BadRequestException('entityId is required');
    }
    return this.workflowsService.retryMissedAlternateSends(
      { entityType: et, entityId },
      {
        userId: req.user?.userId || req.user?._id,
        _id: req.user?._id,
        firstName: req.user?.firstName,
        lastName: req.user?.lastName,
        email: req.user?.email,
      },
    );
  }

  @Get()
  @Permissions('workflows:read')
  findAll() {
    return this.workflowsService.findAll();
  }

  @Get(':id/analytics')
  @Permissions('workflows:read')
  analytics(@Param('id') id: string) {
    return this.workflowsService.getAnalytics(id);
  }

  @Get(':id')
  @Permissions('workflows:read')
  async findOne(@Param('id') id: string) {
    const reserved = new Set([
      'lead-engagement-templates',
      'deal-engagement-templates',
    ]);
    if (reserved.has(id)) {
      throw new BadRequestException(
        'Use /crm/lead-engagement-templates or /crm/deal-engagement-templates',
      );
    }
    const w = await this.workflowsService.findOne(id);
    if (!w) return null;
    return w;
  }

  @Post()
  @Permissions('workflows:write')
  create(@Body() dto: any, @Request() req: any) {
    const uid = req.user?.userId || req.user?._id;
    return this.workflowsService.create(dto, uid ? String(uid) : undefined);
  }

  @Post(':id/enroll')
  @Permissions('workflows:write', 'leads:write', 'contacts:write')
  enrollWorkflow(
    @Request() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      entityType?: string;
      entityId?: string;
      force?: boolean;
    },
  ) {
    const et = String(body.entityType || '').trim();
    if (!['Lead', 'Contact', 'Deal', 'Organization'].includes(et)) {
      throw new BadRequestException(
        'entityType must be Lead, Contact, Deal, or Organization',
      );
    }
    const entityId = String(body.entityId || '').trim();
    if (!entityId) {
      throw new BadRequestException('entityId is required');
    }
    const user = req.user;
    return this.workflowsService.enrollInWorkflow(
      id,
      {
        entityType: et as 'Lead' | 'Contact' | 'Deal' | 'Organization',
        entityId,
        force: body.force === true,
      },
      {
        userId: user?.userId || user?._id,
        _id: user?._id,
        firstName: user?.firstName,
        lastName: user?.lastName,
        email: user?.email,
      },
    );
  }

  @Put(':id')
  @Permissions('workflows:write')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.workflowsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('workflows:delete')
  async remove(@Param('id') id: string, @Request() req: any) {
    const ok = await this.workflowsService.remove(id, req.user?.userId);
    return { ok };
  }
}
