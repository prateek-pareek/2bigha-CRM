import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateCrmOutreachAiSettingsDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  businessName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(8000)
  businessSummary?: string;

  @IsString()
  @IsOptional()
  @MaxLength(8000)
  servicesOffered?: string;

  @IsString()
  @IsOptional()
  @MaxLength(8000)
  idealClientProfile?: string;

  @IsIn(['consultative', 'direct', 'warm', 'formal'])
  @IsOptional()
  tonePreset?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  signatureOrClosing?: string;

  @IsString()
  @IsOptional()
  @MaxLength(4000)
  mustMention?: string;

  @IsString()
  @IsOptional()
  @MaxLength(4000)
  avoidSaying?: string;

  @IsString()
  @IsOptional()
  @MaxLength(8000)
  additionalSystemContext?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  anthropicModel?: string;

  @IsIn(['auto', 'anthropic', 'openai', 'google'])
  @IsOptional()
  llmProvider?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  llmModel?: string;
}
