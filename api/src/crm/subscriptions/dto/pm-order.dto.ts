import { IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class GstDetailsDto {
  @IsString()
  gstin: string;

  @IsString()
  businessName: string;

  @IsString()
  businessAddress: string;

  @IsString()
  pinCode: string;
}

export class CreatePmOrderDto {
  @IsString()
  leadId: string;

  @IsInt()
  @Min(1)
  planId: number;

  @IsInt()
  @Min(1)
  planVariantId: number;

  @IsOptional()
  @IsIn(['MONTHLY', 'YEARLY', 'QUARTERLY', 'HALF_YEARLY'])
  billingCycle?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GstDetailsDto)
  gstDetails?: GstDetailsDto;
}

export class VerifyPmPaymentDto {
  @IsString()
  leadId: string;

  @IsString()
  razorpayOrderId: string;

  @IsString()
  razorpayPaymentId: string;

  @IsString()
  razorpaySignature: string;

  @IsInt()
  @Min(1)
  planId: number;

  @IsOptional()
  @IsIn(['MONTHLY', 'YEARLY', 'QUARTERLY', 'HALF_YEARLY'])
  billingCycle?: string;
}

export class VerifyPmPaymentHandbookDto {
  @IsString()
  razorpayOrderId: string;

  @IsString()
  razorpayPaymentId: string;

  @IsString()
  razorpaySignature: string;
}
