import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SubmitWebsiteContactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  subject?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(8000)
  message: string;

  @IsOptional()
  @IsIn(['freelancer', 'agency', 'both'])
  audience?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  formType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  websiteHost?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmMedium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmCampaign?: string;

  /** Honeypot — leave empty; non-empty values are rejected */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;
}
