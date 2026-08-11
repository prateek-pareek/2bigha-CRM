import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsAppTemplateDto } from './create-whatsapp-template.dto';

/**
 * Editing is only permitted while a template is still `DRAFT` (or
 * `REJECTED`, to correct and resubmit) — enforced in
 * WhatsAppTemplatesService.update(), not here.
 */
export class UpdateWhatsAppTemplateDto extends PartialType(
  CreateWhatsAppTemplateDto,
) {}
