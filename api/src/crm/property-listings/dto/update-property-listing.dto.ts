import { PartialType } from '@nestjs/mapped-types';
import { CreatePropertyListingDto } from './create-property-listing.dto';

export class UpdatePropertyListingDto extends PartialType(
  CreatePropertyListingDto,
) {}
