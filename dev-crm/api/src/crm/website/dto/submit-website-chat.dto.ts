import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SubmitWebsiteChatDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionKey?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  visitorName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  visitorEmail?: string;

  @IsOptional()
  @IsIn(['freelancer', 'agency', 'both'])
  audience?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  websiteHost?: string;

  /** Honeypot — leave empty; non-empty values are rejected */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;
}
