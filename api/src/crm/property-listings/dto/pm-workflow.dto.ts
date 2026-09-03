import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class PmLegalActionDto {
  @IsOptional()
  @IsString()
  summary?: string;
}

export class PmLegalChecklistItemDto {
  @IsString()
  id: string;

  @IsBoolean()
  checked: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}

export class PmLegalChecklistDto extends PmLegalActionDto {
  @IsArray()
  checklist: PmLegalChecklistItemDto[];
}

export class PmScheduleVisitDto {
  @IsString()
  agentId: string;

  @IsString()
  scheduledAt: string;

  @IsOptional()
  @IsString()
  visitCategory?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class PmVisitStatusDto {
  @IsIn(['Pending', 'Complete', 'Cancel'])
  status: 'Pending' | 'Complete' | 'Cancel';

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  fieldVisitId?: number;
}

export class PmReviewReportDto {
  @IsIn(['Approved', 'Rejected', 'Changes Requested'])
  decision: 'Approved' | 'Rejected' | 'Changes Requested';

  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  reportId?: number;

  @IsOptional()
  @IsArray()
  sections?: Array<{ id: string; label?: string; checked: boolean; note?: string }>;

  @IsOptional()
  @IsBoolean()
  reschedule?: boolean;

  @IsOptional()
  @IsString()
  agentId?: string;

  @IsOptional()
  @IsString()
  scheduledAt?: string;
}
