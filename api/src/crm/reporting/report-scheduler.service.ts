import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MailerService } from '@nestjs-modules/mailer';
import { ReportSchedule, ReportScheduleDocument } from './schemas/report-schedule.schema';
import { ReportingService } from './reporting.service';
import * as exceljs from 'exceljs';

@Injectable()
export class ReportSchedulerService {
  private readonly logger = new Logger(ReportSchedulerService.name);

  constructor(
    @InjectModel(ReportSchedule.name, 'crmConnection')
    private reportScheduleModel: Model<ReportScheduleDocument>,
    private readonly reportingService: ReportingService,
    private readonly mailerService: MailerService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async handleScheduledReports() {
    this.logger.log('Checking for scheduled reports to send...');
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday
    const dateOfMonth = today.getDate();

    // Fetch active schedules
    const schedules = await this.reportScheduleModel.find({ isActive: true });

    for (const schedule of schedules) {
      try {
        // Determine if it should run today based on frequency
        if (schedule.frequency === 'weekly' && dayOfWeek !== 1) {
          continue; // Only run weekly reports on Mondays
        }
        if (schedule.frequency === 'monthly' && dateOfMonth !== 1) {
          continue; // Only run monthly reports on the 1st
        }

        this.logger.log(`Executing schedule ${schedule._id} for ${schedule.emailRecipients.join(', ')}`);

        // Generate Report Data
        let data: any[] = [];
        if (schedule.reportType === 'team') {
          // Use the reporting service to get team stats based on filters
          const result = await this.reportingService.getTeamPerformanceMetrics(schedule.filters?.dateRange || 'this_month');
          data = result.teams; // It returns { teams: ... }
        } else if (schedule.reportType === 'agent') {
          // Use reporting service for agent stats
          const result = await this.reportingService.getAgentPerformanceLeaderboard(schedule.filters?.dateRange || 'this_month');
          data = result.agents; // It returns { agents: ... }
        }

        if (!data || data.length === 0) {
          this.logger.log(`No data for schedule ${schedule._id}, skipping email.`);
          continue;
        }

        // Generate Excel Buffer
        const workbook = new exceljs.Workbook();
        const worksheet = workbook.addWorksheet('Report');

        if (data.length > 0) {
          // simple dynamic headers from the first row object keys
          const headers = Object.keys(data[0]);
          worksheet.addRow(headers);
          for (const row of data) {
            worksheet.addRow(headers.map(key => row[key]));
          }
        }
        
        const buffer = await workbook.xlsx.writeBuffer();

        // Send Email
        await this.mailerService.sendMail({
          to: schedule.emailRecipients,
          subject: `Automated CRM Report: ${schedule.reportType.toUpperCase()} - ${schedule.frequency}`,
          text: `Please find your scheduled ${schedule.frequency} ${schedule.reportType} report attached.`,
          attachments: [
            {
              filename: `${schedule.reportType}-report-${new Date().toISOString().split('T')[0]}.xlsx`,
              content: buffer as any,
            },
          ],
        });

        // Update lastSentAt
        schedule.lastSentAt = new Date();
        await schedule.save();

      } catch (error) {
        this.logger.error(`Failed to execute schedule ${schedule._id}: ${error.message}`, error.stack);
      }
    }
  }
}
