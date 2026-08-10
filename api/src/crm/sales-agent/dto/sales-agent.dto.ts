import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class TriggerSalesAgentDto {
  @IsString()
  recordType: 'Lead' | 'Deal' | 'Contact';

  @IsString()
  recordId: string;

  @IsOptional()
  @IsString()
  agentRole?: 'sales' | 'sdr' | 'qualification' | 'ae' | 'renewal';

  @IsOptional()
  @IsString()
  instructions?: string;
}

export class UpdateSalesAgentSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  cronEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxRunsPerCronTick?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  cooldownHours?: number;

  @IsOptional()
  @IsArray()
  enabledLeadPipelineIds?: string[];

  @IsOptional()
  @IsArray()
  enabledDealPipelineIds?: string[];

  @IsOptional()
  @IsBoolean()
  triggerOnLeadCreated?: boolean;

  @IsOptional()
  @IsBoolean()
  triggerOnEmailReply?: boolean;

  @IsOptional()
  @IsBoolean()
  triggerOnNeverContacted?: boolean;

  @IsOptional()
  @IsBoolean()
  triggerOnReplyAwaiting?: boolean;

  @IsOptional()
  @IsBoolean()
  triggerOnWebsiteInbound?: boolean;

  @IsOptional()
  @IsBoolean()
  triggerOnStaleLeads?: boolean;

  @IsOptional()
  @IsBoolean()
  triggerOnChatInbound?: boolean;

  @IsOptional()
  @IsString()
  defaultAgentRole?: 'sales' | 'sdr' | 'qualification' | 'ae' | 'renewal';

  @IsOptional()
  @IsBoolean()
  resumeAfterApproval?: boolean;

  @IsOptional()
  @IsArray()
  autoApproveStageNames?: string[];

  @IsOptional()
  @IsArray()
  autoApproveActions?: string[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxEmailsPerDay?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxEmailsPerRun?: number;

  @IsOptional()
  @IsNumber()
  @Min(4)
  maxToolRounds?: number;
}

export class RejectSalesAgentApprovalDto {
  @IsOptional()
  @IsString()
  reviewNote?: string;
}
