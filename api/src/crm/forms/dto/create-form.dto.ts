import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CRM_WORKSPACE_MODULES, CrmWorkspaceModule } from '../../shared/crm-workspace-module.util';
import { FormFieldDto } from './form-field.dto';

export class FormLeadDefaultsDto {
  @IsOptional()
  @ValidateIf((_, v) => !!v)
  @IsMongoId()
  pipeline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  leadCategory?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  group?: string;
}

export class CreateFormDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsIn(CRM_WORKSPACE_MODULES)
  module?: CrmWorkspaceModule;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => FormFieldDto)
  fields?: FormFieldDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  submitButtonLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  successMessage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  redirectUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  accentColor?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => FormLeadDefaultsDto)
  leadDefaults?: FormLeadDefaultsDto;
}
