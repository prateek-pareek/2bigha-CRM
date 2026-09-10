import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { FORM_FIELD_LEAD_TARGETS, FormFieldType } from '../schemas/form-definition.schema';

export class FormFieldDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]*$/, {
    message: 'key must start with a letter and contain only letters, numbers, and underscores',
  })
  key: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label: string;

  @IsEnum(FormFieldType)
  type: FormFieldType;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  placeholder?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  helpText?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsIn(FORM_FIELD_LEAD_TARGETS)
  mapsTo?: (typeof FORM_FIELD_LEAD_TARGETS)[number];

  @IsOptional()
  @IsInt()
  order?: number;
}

export class FormFieldListDto {
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => FormFieldDto)
  fields: FormFieldDto[];
}
