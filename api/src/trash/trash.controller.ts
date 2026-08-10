import {
  Controller,
  Get,
  Delete,
  Param,
  Post,
  UseGuards,
  Request,
} from '@nestjs/common';
import { TrashService } from './trash.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('trash')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin', 'Administrator')
export class TrashController {
  constructor(private readonly trashService: TrashService) {}

  @Get()
  findAll() {
    return this.trashService.findAll();
  }

  @Delete('empty')
  emptyTrash() {
    return this.trashService.emptyTrash();
  }

  @Delete(':id')
  deletePermanently(@Param('id') id: string) {
    return this.trashService.deletePermanently(id);
  }
}
