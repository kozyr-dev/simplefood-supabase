import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Admin grouping: lower-case letters, digits and hyphens, e.g. `products`. */
export const FOLDER = /^[a-z0-9][a-z0-9-]{0,49}$/;

/**
 * The editable fields of an image: sent with the upload, or changed later
 * with PATCH /media/:id, where `null` clears one.
 */
export class MediaFieldsDto {
  /**
   * Alternative text for screen readers and search engines; an empty
   * string is the same as none.
   * @example "Борщ зі сметаною"
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  alt?: string | null;

  /**
   * Groups images in the admin.
   * @example "products"
   */
  @IsOptional()
  @IsString()
  @Matches(FOLDER, {
    message:
      'folder must be up to 50 lower-case letters, digits and hyphens (e.g. "products")',
  })
  folder?: string | null;
}
