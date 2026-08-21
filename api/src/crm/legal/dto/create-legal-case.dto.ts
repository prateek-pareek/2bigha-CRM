import {
  IsArray,
  IsDateString,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const CASE_TYPES = ['contract_review', 'dispute', 'compliance', 'nda', 'other'] as const;
const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export class LegalCaseDocumentDto {
  @IsString()
  name: string;

  @IsString()
  url: string;

  @IsOptional()
  uploadedAt?: Date;
}

export class CreateLegalCaseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @IsOptional()
  @IsIn(CASE_TYPES as unknown as string[])
  caseType?: (typeof CASE_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  counterpartyName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  contractValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsIn(PRIORITIES as unknown as string[])
  priority?: (typeof PRIORITIES)[number];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  jurisdiction?: string;

  @IsOptional()
  @IsArray()
  documents?: { name: string; url: string; uploadedAt?: Date }[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  caseOwner?: string;

  @IsOptional()
  @IsMongoId()
  pipeline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  stage?: string;

  @IsOptional()
  @IsMongoId()
  clientId?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  associatedContacts?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  associatedLeads?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  associatedDeals?: string[];

  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  recordId?: string;
}
