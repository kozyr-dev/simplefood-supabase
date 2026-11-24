import { SeoDto } from '@/common/seo/seo.dto';

export class SettingsDto {
  /** @example "SimpleFood" */
  siteName: string;

  /** @example "+380 44 123 45 67" */
  phone: string | null;

  /** @example "Kyiv, Khreshchatyk St, 1" */
  address: string | null;

  /** @example "Mon–Sun 10:00–22:00" */
  workingHours: string | null;

  /** @example "until 21:30" */
  takingOrdersHours: string | null;

  /** @example "https://facebook.com/simplefood" */
  facebook: string | null;

  /** @example "https://instagram.com/simplefood" */
  instagram: string | null;

  /** Default SEO, used by pages that don't set their own. */
  seo: SeoDto;
}
