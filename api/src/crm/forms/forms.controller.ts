import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { FormsService } from './forms.service';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';

/** Authenticated CRUD for building/managing forms — see FormsPublicController for the anonymous submit side. */
@Controller('crm/forms')
@UseGuards(JwtAuthGuard, RbacGuard)
export class FormsController {
  constructor(private readonly formsService: FormsService) {}

  @Get()
  @Permissions('forms:read')
  findAll() {
    return this.formsService.findAll();
  }

  @Get(':id')
  @Permissions('forms:read')
  findOne(@Param('id') id: string) {
    return this.formsService.findOne(id);
  }

  @Get(':id/submissions')
  @Permissions('forms:read')
  listSubmissions(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.formsService.listSubmissions(id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post()
  @Permissions('forms:write')
  create(@Body() dto: CreateFormDto, @Request() req: any) {
    return this.formsService.create(dto, req.user);
  }

  @Patch(':id')
  @Permissions('forms:write')
  update(@Param('id') id: string, @Body() dto: UpdateFormDto) {
    return this.formsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('forms:write')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.formsService.remove(id, req.user);
  }
}
