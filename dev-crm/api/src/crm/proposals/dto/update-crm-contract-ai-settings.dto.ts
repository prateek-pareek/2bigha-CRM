import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateCrmContractAiSettingsDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsIn(['agency', 'freelancer'])
  @IsOptional()
  defaultIssuerProfile?: string;

  @IsBoolean()
  @IsOptional()
  useSharedProposalContext?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  agencyLegalName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  agencyRegisteredAddress?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  agencySignatoryName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  agencySignatoryTitle?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  agencyGstOrReg?: string;

  @IsString()
  @IsOptional()
  @MaxLength(12000)
  agencyStandardClauses?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  freelancerLegalName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  freelancerAddress?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  freelancerIdDocument?: string;

  @IsString()
  @IsOptional()
  @MaxLength(12000)
  freelancerStandardClauses?: string;

  @IsString()
  @IsOptional()
  @MaxLength(4000)
  governingLaw?: string;

  @IsString()
  @IsOptional()
  @MaxLength(4000)
  contractSectionOutline?: string;

  @IsIn(['consultative', 'direct', 'warm', 'formal'])
  @IsOptional()
  tonePreset?: string;

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
