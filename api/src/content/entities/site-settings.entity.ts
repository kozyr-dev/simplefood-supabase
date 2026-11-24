import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Seo } from '@/database/entities/seo.embedded';

/** The id of the one and only settings row. */
export const SITE_SETTINGS_ID = 1;

/**
 * Site-wide settings: exactly one row. The database enforces it: the id is
 * always 1 (default + CHECK), and a primary key can't repeat. That's why this
 * entity doesn't extend AppBaseEntity: it's the one table without a UUID.
 */
@Entity()
@Check('CHK_site_settings_single_row', `"id" = ${SITE_SETTINGS_ID}`)
export class SiteSettings {
  @PrimaryColumn({ type: 'smallint', default: SITE_SETTINGS_ID })
  id: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'varchar', length: 100 })
  siteName: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  /** Free text, e.g. "Mon–Sun 10:00–22:00". */
  @Column({ type: 'varchar', length: 255, nullable: true })
  workingHours: string | null;

  /** Free text, e.g. "until 21:30". */
  @Column({ type: 'varchar', length: 255, nullable: true })
  takingOrdersHours: string | null;

  /** Full URL of the Facebook page. */
  @Column({ type: 'text', nullable: true })
  facebook: string | null;

  /** Full URL of the Instagram profile. */
  @Column({ type: 'text', nullable: true })
  instagram: string | null;

  /** Default SEO for pages that don't set their own. */
  @Column(() => Seo)
  seo: Seo;
}
