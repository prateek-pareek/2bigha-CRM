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
import { WhatsAppTemplatesService } from './whatsapp-templates.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { CreateWhatsAppTemplateDto } from './dto/create-whatsapp-template.dto';
import { UpdateWhatsAppTemplateDto } from './dto/update-whatsapp-template.dto';

@Controller('crm/whatsapp-templates')
@UseGuards(JwtAuthGuard, RbacGuard)
export class WhatsAppTemplatesController {
  constructor(private readonly templatesService: WhatsAppTemplatesService) {}

  @Get()
  @Permissions('inbox:read')
  findAll(@Query('status') status?: string) {
    return this.templatesService.findAll({ status });
  }

  @Get(':id')
  @Permissions('inbox:read')
  findOne(@Param('id') id: string) {
    return this.templatesService.findOne(id);
  }

  @Post()
  @Permissions('settings:write')
  create(@Request() req: any, @Body() dto: CreateWhatsAppTemplateDto) {
    return this.templatesService.create(dto, req.user?.userId);
  }

  @Put(':id')
  @Permissions('settings:write')
  update(@Param('id') id: string, @Body() dto: UpdateWhatsAppTemplateDto) {
    return this.templatesService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('settings:write')
  remove(@Param('id') id: string) {
    return this.templatesService.remove(id);
  }

  @Post(':id/submit')
  @Permissions('settings:write')
  submit(@Param('id') id: string) {
    return this.templatesService.submit(id);
  }

  @Post('sync')
  @Permissions('settings:write')
  sync() {
    return this.templatesService.syncStatuses();
  }
}
