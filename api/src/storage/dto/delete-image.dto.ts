import { IsOptional, IsString } from 'class-validator';

export class DeleteImageDto {
  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  publicId?: string;
}
