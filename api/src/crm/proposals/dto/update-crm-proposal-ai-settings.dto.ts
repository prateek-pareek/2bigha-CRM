import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateCrmProposalAiSettingsDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsIn(['agency', 'freelancer'])
  @IsOptional()
  defaultIssuerProfile?: string;

  @IsBoolean()
  @IsOptional()
  useSharedOutreachContext?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  agencyName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(8000)
  agencyIntro?: string;

  @IsString()
  @IsOptional()
  @MaxLength(8000)
  agencyServices?: string;

  @IsString()
  @IsOptional()
  @MaxLength(8000)
  agencyDifferentiators?: string;

  @IsString()
  @IsOptional()
  @MaxLength(8000)
  agencyPaymentTerms?: string;

  @IsString()
  @IsOptional()
  @MaxLength(8000)
  agencyTechStack?: string;

  @IsString()
  @IsOptional()
  @MaxLength(8000)
  agencyPortfolio?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  freelancerName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(8000)
  freelancerIntro?: string;

  @IsString()
  @IsOptional()
  @MaxLength(8000)
  freelancerServices?: string;

  @IsString()
  @IsOptional()
  @MaxLength(8000)
  freelancerDifferentiators?: string;

  @IsString()
  @IsOptional()
  @MaxLength(8000)
  freelancerPaymentTerms?: string;

  @IsString()
  @IsOptional()
  @MaxLength(8000)
  freelancerTechStack?: string;

  @IsString()
  @IsOptional()
  @MaxLength(8000)
  freelancerPortfolio?: string;

  @IsIn(['consultative', 'direct', 'warm', 'formal'])
  @IsOptional()
  tonePreset?: string;

  @IsString()
  @IsOptional()
  @MaxLength(4000)
  sectionOutline?: string;

  @IsString()
  @IsOptional()
  @MaxLength(4000)
  mustInclude?: string;

  @IsString()
  @IsOptional()
  @MaxLength(4000)
  mustAvoid?: string;

  @IsString()
  @IsOptional()
  @MaxLength(8000)
  additionalContext?: string;
}
