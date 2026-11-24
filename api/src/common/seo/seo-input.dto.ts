import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * The SEO fields an admin form sends for settings, pages and posts; `null`
 * clears one (the site default applies), a missing one is left as it is.
 */
export class SeoInputDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;

  /** An image from the media library, for link previews. */
  @IsOptional()
  @IsUUID()
  shareImageId?: string | null;
}

/** The SEO fields as the admin app reads them. */
export class AdminSeoDto {
  title: string | null;
  description: string | null;
  shareImageId: string | null;
}
