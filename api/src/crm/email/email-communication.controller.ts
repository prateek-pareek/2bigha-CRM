import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Patch,
  Delete,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { EmailCommunicationService } from './email-communication.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per file
const MAX_ATTACHMENT_COUNT = 10;

@Controller('communications/emails')
@UseGuards(JwtAuthGuard, RbacGuard)
export class EmailCommunicationController {
  constructor(private readonly emailService: EmailCommunicationService) {}

  @Post('send')
  @Permissions('leads:write', 'contacts:write')
  @UseInterceptors(
    FilesInterceptor('attachments', MAX_ATTACHMENT_COUNT, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    }),
  )
  sendEmail(
    @Request() req: any,
    @Body() data: any,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const attachments = (files || []).map((f) => ({
      filename: f.originalname,
      content: f.buffer,
      contentType: f.mimetype,
    }));
    return this.emailService.sendEmail({
      ...data,
      sender: req.user.userId,
      attachments,
    });
  }

  @Post('draft')
  @Permissions('leads:write', 'contacts:write')
  saveDraft(@Request() req: any, @Body() data: any) {
    return this.emailService.saveDraft({
      ...data,
      sender: req.user.userId,
    });
  }

  @Get()
  @Permissions('leads:read', 'contacts:read')
  findAll() {
    return this.emailService.findAll();
  }

  @Patch(':id')
  @Permissions('leads:write', 'contacts:write')
  updateEmail(@Param('id') id: string, @Body() data: any) {
    return this.emailService.updateEmail(id, data);
  }

  @Delete(':id')
  @Permissions('leads:write', 'contacts:write')
  deleteEmail(@Param('id') id: string) {
    return this.emailService.deleteEmail(id);
  }

  @Get('entity/:id')
  @Permissions('leads:read', 'contacts:read')
  findByEntity(@Param('id') id: string) {
    return this.emailService.findByEntity(id);
  }
}
