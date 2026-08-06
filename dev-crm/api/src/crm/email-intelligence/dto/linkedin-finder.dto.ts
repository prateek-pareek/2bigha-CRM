import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class LinkedinFinderDto {
  @IsString()
  url: string;

  @IsOptional()
  @IsBoolean()
  enrichMobile?: boolean;

  @IsOptional()
  @IsBoolean()
  full?: boolean;

  /** Prefer a specific provider when multiple are enabled. */
  @IsOptional()
  @IsString()
  providerId?: string;
}
