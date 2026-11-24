import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import mailConfig from '@/config/mail.config';
import { MailModule } from '@/mail/mail.module';
import { AdminContactMessagesController } from './controllers/admin-contact-messages.controller';
import { ContactController } from './controllers/contact.controller';
import { ContactSubmission } from './entities/contact-submission.entity';
import { AdminContactMessagesService } from './services/admin-contact-messages.service';
import { ContactService } from './services/contact.service';

/**
 * The site's contact form: POST /contact saves the message and emails the
 * shop; the admin lists them at /api/admin/contact-messages.
 */
@Module({
  imports: [
    ConfigModule.forFeature(mailConfig),
    TypeOrmModule.forFeature([ContactSubmission]),
    MailModule,
  ],
  controllers: [ContactController, AdminContactMessagesController],
  providers: [ContactService, AdminContactMessagesService],
})
export class ContactModule {}
