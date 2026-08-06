import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CRMUsersService } from './crm-users.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserConfig, UserConfigDocument } from './schemas/user-config.schema';

@Controller('users/config')
@UseGuards(JwtAuthGuard)
export class UserConfigController {
  constructor(
    @InjectModel(UserConfig.name)
    private userConfigModel: Model<UserConfigDocument>,
  ) {}

  @Get()
  async getConfig(@Request() req: any) {
    const config = await this.userConfigModel
      .findOne({ userId: req.user.userId })
      .exec();
    if (!config) {
      // Return default configuration if none exists
      return {
        dashboardLayout: [
          {
            id: 'leads-status',
            type: 'chart',
            component: 'LeadsByStatus',
            title: 'Leads by Status',
            layout: { x: 0, y: 0, w: 6, h: 4 },
          },
          {
            id: 'sales-trend',
            type: 'chart',
            component: 'SalesTrend',
            title: 'Sales Trend',
            layout: { x: 6, y: 0, w: 6, h: 4 },
          },
          {
            id: 'deals-stage',
            type: 'chart',
            component: 'DealsByStage',
            title: 'Deals by Stage',
            layout: { x: 0, y: 4, w: 12, h: 4 },
          },
        ],
        savedReports: [],
      };
    }
    return config;
  }

  @Post()
  async updateConfig(@Request() req: any, @Body() configDto: any) {
    return this.userConfigModel
      .findOneAndUpdate(
        { userId: req.user.userId },
        { ...configDto, userId: req.user.userId },
        { upsert: true, new: true },
      )
      .exec();
  }
}
