import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

export class VerifyEmailDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsBoolean()
  enrichMobile?: boolean;

  @IsOptional()
  @IsString()
  providerId?: string;
}
