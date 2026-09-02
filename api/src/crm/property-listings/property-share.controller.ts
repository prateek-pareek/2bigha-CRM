import { BadRequestException, Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { PropertyShareService, PropertyShareInput } from './property-share-pdf.service';
import { PropertyListingsService } from './property-listings.service';
import { WhatsAppService } from '../integrations/whatsapp.service';

/**
 * "Share Property" — generates a 2Bigha-branded property brochure PDF from
 * property listing or custom form input, and allows previewing or sending
 * straight to a WhatsApp contact as a document message.
 * Caches the generated Azure Blob URL on PropertyListing for instant 0ms reuse.
 */
@Controller('crm/property-share')
@UseGuards(JwtAuthGuard, RbacGuard)
export class PropertyShareController {
  constructor(
    private readonly propertyShareService: PropertyShareService,
    private readonly propertyListingsService: PropertyListingsService,
    private readonly whatsappService: WhatsAppService,
  ) {}

  @Post('generate')
  @Permissions('leads:write', 'contacts:write', 'inbox:write', 'property_listings:read')
  async generate(
    @Body()
    body: {
      propertyId?: string;
      fields?: Partial<PropertyShareInput>;
      forceRegenerate?: boolean;
    },
  ) {
    let input = body.fields as PropertyShareInput | undefined;
    let listingDoc: any = null;

    if (body.propertyId) {
      listingDoc = await this.propertyListingsService.findOne(body.propertyId).catch(() => null);
      if (listingDoc) {
        // Reuse stored brochure PDF URL if already generated and no forceRegenerate / custom override fields
        if (
          listingDoc.brochurePdfUrl &&
          !body.forceRegenerate &&
          (!body.fields || Object.keys(body.fields).length === 0)
        ) {
          return {
            url: listingDoc.brochurePdfUrl,
            filename: `${listingDoc.title || '2Bigha-Brochure'}.pdf`,
            cached: true,
          };
        }
        input = this.propertyShareService.mapListingToShareInput(listingDoc, body.fields);
      }
    }

    if (!input || !input.title) {
      throw new BadRequestException('Valid property details or fields are required');
    }
    const result = await this.propertyShareService.generateAndUpload(input);

    // Persist brochure PDF URL on the property listing for instant future reuse
    if (listingDoc && result.url) {
      try {
        listingDoc.brochurePdfUrl = result.url;
        listingDoc.brochurePdfGeneratedAt = new Date();
        await listingDoc.save();
      } catch {
        // ignore save error
      }
    }

    return result;
  }

  @Post('send')
  @Permissions('leads:write', 'contacts:write', 'inbox:write')
  async send(
    @Request() req: any,
    @Body()
    body: {
      waId: string;
      module?: string;
      entityId?: string;
      propertyId?: string;
      fields?: Partial<PropertyShareInput>;
      forceRegenerate?: boolean;
    },
  ) {
    let input = body.fields as PropertyShareInput | undefined;
    let listingDoc: any = null;
    let brochureUrl: string | undefined;
    let brochureFilename: string | undefined;

    if (body.propertyId) {
      listingDoc = await this.propertyListingsService.findOne(body.propertyId).catch(() => null);
      if (listingDoc) {
        if (
          listingDoc.brochurePdfUrl &&
          !body.forceRegenerate &&
          (!body.fields || Object.keys(body.fields).length === 0)
        ) {
          brochureUrl = listingDoc.brochurePdfUrl;
          brochureFilename = `${listingDoc.title || '2Bigha-Brochure'}.pdf`;
        } else {
          input = this.propertyShareService.mapListingToShareInput(listingDoc, body.fields);
        }
      }
    }

    if (!brochureUrl) {
      if (!input || !input.title) {
        throw new BadRequestException('Valid property details or fields are required');
      }
      const gen = await this.propertyShareService.generateAndUpload(input);
      brochureUrl = gen.url;
      brochureFilename = gen.filename;

      if (listingDoc && brochureUrl) {
        try {
          listingDoc.brochurePdfUrl = brochureUrl;
          listingDoc.brochurePdfGeneratedAt = new Date();
          await listingDoc.save();
        } catch {
          // ignore save error
        }
      }
    }

    return this.whatsappService.sendDocumentMessage(
      body.waId,
      brochureUrl || '',
      brochureFilename || '2Bigha-Brochure.pdf',
      input?.title || listingDoc?.title || '2Bigha Property Brochure',
      req.user?.userId,
      body.module,
      body.entityId,
    );
  }
}
