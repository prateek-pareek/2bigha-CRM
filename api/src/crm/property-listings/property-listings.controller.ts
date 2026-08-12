import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { PropertyListingsService } from './property-listings.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { CreatePropertyListingDto } from './dto/create-property-listing.dto';
import { UpdatePropertyListingDto } from './dto/update-property-listing.dto';

@Controller('crm/property-listings')
@UseGuards(JwtAuthGuard, RbacGuard)
export class PropertyListingsController {
  constructor(private readonly listingsService: PropertyListingsService) {}

  @Get()
  @Permissions('property_listings:read')
  findAll(@Query() query: Record<string, string>) {
    return this.listingsService.findAll(query);
  }

  @Get('stats')
  @Permissions('property_listings:read')
  stats() {
    return this.listingsService.stats();
  }

  @Get(':id')
  @Permissions('property_listings:read')
  findOne(@Param('id') id: string) {
    return this.listingsService.findOne(id);
  }

  @Post()
  @Permissions('property_listings:write')
  create(@Request() req: any, @Body() dto: CreatePropertyListingDto) {
    return this.listingsService.create(dto, req.user?.userId);
  }

  @Put(':id')
  @Permissions('property_listings:write')
  update(@Param('id') id: string, @Body() dto: UpdatePropertyListingDto) {
    return this.listingsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('property_listings:delete')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.listingsService.remove(id, req.user?.userId);
  }
}
