import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CancelPmPlanDto {
  @IsString()
  leadId: string;

  @IsString()
  userPropertyId: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreatePmUpgradeOrderDto {
  @IsString()
  leadId: string;

  @IsString()
  userPropertyId: string;

  @IsInt()
  @Min(1)
  targetVariantId: number;
}
