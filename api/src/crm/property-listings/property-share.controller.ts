import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { PropertyShareService, PropertyShareInput } from './property-share-pdf.service';
import { WhatsAppService } from '../integrations/whatsapp.service';

/**
 * "Share Property" — generates a 2Bigha-branded property brochure PDF from
 * form input (not a saved PropertyListing; see the feature plan) and sends
 * it straight to a WhatsApp contact as a document message.
 */
@Controller('crm/property-share')
@UseGuards(JwtAuthGuard, RbacGuard)
export class PropertyShareController {
  constructor(
    private readonly propertyShareService: PropertyShareService,
    private readonly whatsappService: WhatsAppService,
  ) {}

  @Post('send')
  @Permissions('leads:write', 'contacts:write', 'inbox:write')
  async send(
    @Request() req: any,
    @Body()
    body: {
      waId: string;
      module?: string;
      entityId?: string;
      fields: PropertyShareInput;
    },
  ) {
    const { url, filename } = await this.propertyShareService.generateAndUpload(body.fields);
    return this.whatsappService.sendDocumentMessage(
      body.waId,
      url,
      filename,
      body.fields?.title,
      req.user?.userId,
      body.module,
      body.entityId,
    );
  }
}
