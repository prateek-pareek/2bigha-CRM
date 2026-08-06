import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ColumnPreferencesService } from './column-preferences.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@Controller('column-preferences')
@UseGuards(JwtAuthGuard)
export class ColumnPreferencesController {
  constructor(
    private readonly columnPreferencesService: ColumnPreferencesService,
  ) {}

  @Get(':module')
  getPreference(@Request() req: any, @Param('module') module: string) {
    return this.columnPreferencesService.getPreference(req.user.userId, module);
  }

  @Post(':module')
  savePreference(
    @Request() req: any,
    @Param('module') module: string,
    @Body('columns') columns: string[],
  ) {
    return this.columnPreferencesService.savePreference(
      req.user.userId,
      module,
      columns,
    );
  }
}
