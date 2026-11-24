import { ApiProperty } from '@nestjs/swagger';
import { MediaDto } from '@/media/dto/media.dto';

/** Search-engine metadata (settings hold the site-wide defaults). */
export class SeoDto {
  /**
   * `<title>`; null to fall back to the site default.
   * @example "SimpleFood: food delivery in Kyiv"
   */
  title: string | null;

  /**
   * `<meta name="description">`; null to fall back to the site default.
   * @example "Home-style meals delivered hot."
   */
  description: string | null;

  // Explicit: from `MediaDto | null` the plugin only infers `object`.
  @ApiProperty({
    type: MediaDto,
    nullable: true,
    description:
      'Open Graph image for link previews; null to fall back to the site default.',
  })
  shareImage: MediaDto | null;
}
