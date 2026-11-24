import { Check, Column, Entity } from 'typeorm';
import { AppBaseEntity } from '@/database/entities/base.entity';

/**
 * A message from the site's contact form. Saved before the shop is emailed,
 * so a lost email loses no message; the admin lists them and marks
 * them handled. The checks repeat the DTO rules for writers that skip the
 * DTOs (the data migration).
 */
@Entity()
@Check('CHK_contact_submission_email', `position('@' in "email") > 1`)
@Check(
  'CHK_contact_submission_message_length',
  `char_length("message") BETWEEN 1 AND 5000`,
)
export class ContactSubmission extends AppBaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name: string;

  /** Where the shop's reply goes (the notification's Reply-To). */
  @Column({ type: 'varchar', length: 254 })
  email: string;

  /** Plain text, up to 5000 characters. */
  @Column({ type: 'text' })
  message: string;

  /** When the shop dealt with it; `null` while it's new. */
  @Column({ type: 'timestamptz', nullable: true })
  handledAt: Date | null;
}
