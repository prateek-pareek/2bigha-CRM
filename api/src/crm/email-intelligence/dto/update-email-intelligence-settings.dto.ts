import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { EmailProviderId } from '../email-intelligence.types';

export class EmailProviderCapabilitiesDto {
  @IsOptional()
  @IsBoolean()
  linkedinFinder?: boolean;

  @IsOptional()
  @IsBoolean()
  emailVerifier?: boolean;
}

export class UpdateEmailProviderDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  apiSecret?: string;

  @IsOptional()
  @IsString()
  webhookUrl?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => EmailProviderCapabilitiesDto)
  capabilities?: EmailProviderCapabilitiesDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  priority?: number;
}

export class UpdateEmailIntelligenceSettingsDto {
  @IsObject()
  @ValidateNested({ each: true })
  @Type(() => UpdateEmailProviderDto)
  providers: Partial<Record<EmailProviderId, UpdateEmailProviderDto>>;
}

const PROVIDER_IDS: EmailProviderId[] = [
  'tomba',
  'hunter',
  'prospeo',
  'clay',
  'clearout',
  'anymail',
];

export class UpdateSingleEmailProviderDto extends UpdateEmailProviderDto {
  @IsIn(PROVIDER_IDS)
  providerId: EmailProviderId;
}
