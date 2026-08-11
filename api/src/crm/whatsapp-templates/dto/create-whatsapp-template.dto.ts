import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class WhatsAppTemplateButtonDto {
  @IsIn(['QUICK_REPLY', 'URL', 'PHONE_NUMBER'])
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';

  @IsString()
  @MaxLength(25)
  text: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  phone_number?: string;

  @IsOptional()
  @IsArray()
  example?: string[];
}

export class WhatsAppTemplateComponentDto {
  @IsIn(['HEADER', 'BODY', 'FOOTER', 'BUTTONS'])
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';

  @IsOptional()
  @IsIn(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'])
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  text?: string;

  @IsOptional()
  @IsObject()
  example?: Record<string, any>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WhatsAppTemplateButtonDto)
  buttons?: WhatsAppTemplateButtonDto[];
}

export class CreateWhatsAppTemplateDto {
  @IsString()
  @Matches(/^[a-z0-9_]{1,512}$/, {
    message:
      'name must be lowercase letters, numbers and underscores only (Meta template naming rule)',
  })
  name: string;

  @IsString()
  @Matches(/^[a-z]{2}(_[A-Z]{2})?$/, {
    message: 'language must be a Meta-supported code, e.g. "en" or "en_US"',
  })
  language: string;

  @IsIn(['MARKETING', 'UTILITY', 'AUTHENTICATION'])
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WhatsAppTemplateComponentDto)
  components: WhatsAppTemplateComponentDto[];
}
