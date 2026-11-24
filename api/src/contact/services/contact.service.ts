import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import mailConfig, { type MailConfig } from '@/config/mail.config';
import { MailService } from '@/mail/services/mail.service';
import type { CreateContactDto } from '../dto/create-contact.dto';
import { ContactSubmission } from '../entities/contact-submission.entity';
import { contactNotification } from '../templates/contact-emails';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    @InjectRepository(ContactSubmission)
    private readonly submissions: Repository<ContactSubmission>,
    private readonly mail: MailService,
    @Inject(mailConfig.KEY) private readonly mailSettings: MailConfig,
  ) {}

  /**
   * Saves the message, then emails the shop in the background. A filled-in
   * honeypot (`website`) means a bot: nothing is saved or sent, and the
   * caller can't tell, so the bot learns nothing.
   */
  async submit({ website, ...message }: CreateContactDto): Promise<void> {
    if (website) {
      // No values: the "message" is a bot's, but it may quote real people.
      this.logger.log('Contact form honeypot filled in: message dropped');
      return;
    }

    const submission = await this.submissions.save(
      this.submissions.create({ ...message, handledAt: null }),
    );
    this.mail.send('contact-shop', {
      to: this.mailSettings.notifyTo,
      replyTo: submission.email,
      ...contactNotification(submission),
    });
  }
}
