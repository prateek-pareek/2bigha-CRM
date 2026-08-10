import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CustomRolesGuard } from '../auth/custom-roles.guard';
import { RolesService } from './roles.service';

@Controller('roles')
@UseGuards(JwtAuthGuard, CustomRolesGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  findAll() {
    return this.rolesService.findAllRoles();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rolesService.findRoleById(id);
  }

  @Post()
  create(@Body() dto: any, @Request() req: any) {
    return this.rolesService.createRole(dto, req?.user?.userId || req?.user?._id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.rolesService.updateRole(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rolesService.deleteRole(id);
  }
}

