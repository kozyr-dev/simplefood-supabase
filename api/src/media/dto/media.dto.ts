import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
/*
 * How media appears in API responses (products, blog posts, page sections).
 * The @nestjs/swagger CLI plugin documents these properties from their types
 * and comments; only the nested optional objects need an explicit decorator.
 */

export class MediaFormatDto {
  url: string;
  width: number;
  height: number;
}

export class MediaFormatsDto {
  @ApiPropertyOptional({ type: MediaFormatDto })
  thumbnail?: MediaFormatDto;

  @ApiPropertyOptional({ type: MediaFormatDto })
  small?: MediaFormatDto;

  @ApiPropertyOptional({ type: MediaFormatDto })
  medium?: MediaFormatDto;

  @ApiPropertyOptional({ type: MediaFormatDto })
  large?: MediaFormatDto;
}

export class MediaDto {
  /** @example "01a1559c-a1ed-7641-ac0e-64612b99bb5a" */
  id: string;

  /**
   * Relative to the API origin.
   * @example "/uploads/borscht_3f9a.jpg"
   */
  url: string;

  /** Alternative text; null when not set. */
  alt: string | null;

  /** Pixel width; null for files that aren't images. */
  width: number | null;

  /** Pixel height; null for files that aren't images. */
  height: number | null;

  // Explicit: from `MediaFormatsDto | null` the plugin only infers `object`,
  // which would lose the variants' shape in the docs and generated clients.
  @ApiProperty({
    type: MediaFormatsDto,
    nullable: true,
    description: 'Responsive variants of an image; null for other files.',
  })
  formats: MediaFormatsDto | null;
}
