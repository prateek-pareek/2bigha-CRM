import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MailerService } from '@nestjs-modules/mailer';
import { ReportSchedule, ReportScheduleDocument } from './schemas/report-schedule.schema';
import { PerformanceReportsService } from './performance-reports.service';
import * as exceljs from 'exceljs';

type Column = { header: string; key: string; width?: number };

const AGENT_COLUMNS: Column[] = [
  { header: 'Agent', key: 'name', width: 26 },
  { header: 'Team', key: 'teamName', width: 22 },
  { header: 'Calls', key: 'calls' },
  { header: 'Connected calls', key: 'connectedCalls' },
  { header: 'Connect rate %', key: 'connectRate' },
  { header: 'Leads created', key: 'leadsCreated' },
  { header: 'Leads converted', key: 'leadsConverted' },
  { header: 'Conversion rate %', key: 'conversionRate' },
  { header: 'Follow-ups due', key: 'followUpsDue' },
  { header: 'Follow-ups done', key: 'followUpsDone' },
  { header: 'Follow-up adherence %', key: 'followUpAdherence' },
  { header: 'Avg first response (min)', key: 'avgResponseMins' },
  { header: 'Activities', key: 'activities' },
  { header: 'Properties listed', key: 'properties' },
  { header: 'Farms listed', key: 'farms' },
  { header: 'WhatsApp sent', key: 'whatsappSent' },
  { header: 'WhatsApp read', key: 'whatsappRead' },
  { header: 'Subscription sales', key: 'subscriptionSales' },
  { header: 'Revenue (INR)', key: 'revenue' },
];

const TEAM_COLUMNS: Column[] = [
  { header: 'Team', key: 'teamName', width: 26 },
  { header: 'Members', key: 'teamSize' },
  { header: 'Calls', key: 'calls' },
  { header: 'Connected calls', key: 'connectedCalls' },
  { header: 'Incoming calls', key: 'incomingCalls' },
  { header: 'Missed calls', key: 'missedCalls' },
  { header: 'Leads created', key: 'leadsCreated' },
  { header: 'Leads converted', key: 'leadsConverted' },
  { header: 'Conversion rate %', key: 'conversionRate' },
  { header: 'Follow-up adherence %', key: 'followUpAdherence' },
  { header: 'Listings', key: 'listingsTotal' },
  { header: 'WhatsApp sent', key: 'whatsappSent' },
  { header: 'WhatsApp read', key: 'whatsappRead' },
  { header: 'WhatsApp read rate %', key: 'whatsappReadRate' },
  { header: 'Subscription sales', key: 'subscriptionSales' },
  { header: 'Revenue (INR)', key: 'revenue' },
];

@Injectable()
export class ReportSchedulerService {
  private readonly logger = new Logger(ReportSchedulerService.name);

  constructor(
    @InjectModel(ReportSchedule.name, 'crmConnection')
    private reportScheduleModel: Model<ReportScheduleDocument>,
    private readonly performanceReports: PerformanceReportsService,
    private readonly mailerService: MailerService,
  ) {}

  /** Report period for the cadence: daily → yesterday, weekly → last 7 days, monthly → last month. */
  private windowFor(frequency: string, now = new Date()): string {
    const ymd = (d: Date) => d.toISOString().slice(0, 10);
    if (frequency === 'daily') return 'yesterday';
    if (frequency === 'weekly') {
      const end = new Date(now.getTime() - 24 * 3600 * 1000);
      const start = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      return `${ymd(start)},${ymd(end)}`;
    }
    const start = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
    const end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 0));
    return `${ymd(start)},${ymd(end)}`;
  }

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async handleScheduledReports() {
    this.logger.log('Checking for scheduled reports to send...');
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday
    const dateOfMonth = today.getDate();

    const schedules = await this.reportScheduleModel.find({ isActive: true });

    for (const schedule of schedules) {
      try {
        if (schedule.frequency === 'weekly' && dayOfWeek !== 1) continue; // Mondays
        if (schedule.frequency === 'monthly' && dateOfMonth !== 1) continue; // 1st of month

        const filters = schedule.filters || {};
        const scope = this.performanceReports.scopeFromSchedule(filters, schedule.userId);
        const window = this.windowFor(schedule.frequency, today);
        const report = await this.performanceReports.getPerformance(window, scope, {
          agents: Array.isArray(filters.selectedAgents) ? filters.selectedAgents.map(String) : [],
          teams: Array.isArray(filters.selectedTeams) ? filters.selectedTeams.map(String) : [],
        });

        const isTeam = schedule.reportType === 'team';
        const columns = isTeam ? TEAM_COLUMNS : AGENT_COLUMNS;
        const rows: any[] = isTeam ? report.teams : report.agents;

        const workbook = new exceljs.Workbook();
        const sheet = workbook.addWorksheet(isTeam ? 'Teams' : 'Agents');
        sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 16 }));
        sheet.getRow(1).font = { bold: true };
        for (const row of rows) {
          sheet.addRow(Object.fromEntries(columns.map((c) => [c.key, row[c.key] ?? '—'])));
        }

        const summary = workbook.addWorksheet('Summary');
        summary.columns = [
          { header: 'Metric', key: 'k', width: 28 },
          { header: 'Value', key: 'v', width: 18 },
        ];
        summary.getRow(1).font = { bold: true };
        const t = report.totals;
        const e = report.engagement;
        [
          ['Period', `${report.range.from} → ${report.range.to}`],
          ['Leads created', t.leadsCreated],
          ['Leads converted', t.leadsConverted],
          ['Conversion rate %', t.conversionRate],
          ['Calls', t.calls],
          ['Connected calls', t.connectedCalls],
          ['Missed calls', t.missedCalls],
          ['Follow-up adherence %', t.followUpAdherence ?? '—'],
          ['Avg first response (min)', t.avgResponseMins ?? '—'],
          ['Listings', t.listingsTotal],
          ['WhatsApp sent', e.whatsapp.sent],
          ['WhatsApp read', e.whatsapp.read],
          ['WhatsApp inbound', e.whatsapp.inbound],
          ['Subscription sales', t.subscriptionSales],
          ['Revenue (INR)', t.revenue],
        ].forEach(([k, v]) => summary.addRow({ k, v }));

        const buffer = await workbook.xlsx.writeBuffer();
        const label = `${report.range.from}${report.range.to !== report.range.from ? `_to_${report.range.to}` : ''}`;

        await this.mailerService.sendMail({
          to: schedule.emailRecipients,
          subject: `CRM ${isTeam ? 'Team & Organization' : 'Agent Performance'} report (${schedule.frequency}) — ${report.range.from} to ${report.range.to}`,
          text:
            `Your scheduled ${schedule.frequency} ${isTeam ? 'team' : 'agent'} report is attached.\n\n` +
            `Period: ${report.range.from} to ${report.range.to}\n` +
            `Leads created: ${t.leadsCreated} · Converted: ${t.leadsConverted} (${t.conversionRate}%)\n` +
            `Calls: ${t.calls} · Connected: ${t.connectedCalls} · Missed: ${t.missedCalls}\n` +
            `WhatsApp sent: ${e.whatsapp.sent} · Read: ${e.whatsapp.read}\n` +
            `Subscription sales: ${t.subscriptionSales} · Revenue: INR ${t.revenue}\n`,
          attachments: [
            {
              filename: `${schedule.reportType}-report-${label}.xlsx`,
              content: buffer as any,
            },
          ],
        });

        schedule.lastSentAt = new Date();
        await schedule.save();
      } catch (error: any) {
        this.logger.error(`Failed to execute schedule ${schedule._id}: ${error?.message}`, error?.stack);
      }
    }
  }
}
