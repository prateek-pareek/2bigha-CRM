import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class WebsiteEmailExtractorDto {
  @IsString()
  @MaxLength(2000)
  url: string;

  /** When true, also fetches same-origin contact/about/team pages. */
  @IsOptional()
  @IsBoolean()
  crawlContactPages?: boolean;
}
