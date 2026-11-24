import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import authConfig from '@/config/auth.config';
import mailConfig from '@/config/mail.config';
import { MailModule } from '@/mail/mail.module';
import { UsersController } from './controllers/users.controller';
import { AccountToken } from './entities/account-token.entity';
import { User } from './entities/user.entity';
import { AccountEmailsService } from './services/account-emails.service';
import { AccountTokensService } from './services/account-tokens.service';
import { PasswordService } from './services/password.service';
import { UsersService } from './services/users.service';

/**
 * User accounts, their passwords (hashing), single-use account tokens
 * (password-reset and verification links), the emails about an account,
 * and the `/users/me` profile. Exports the services for AuthModule (login,
 * register, change-password, password reset, email verification); it never
 * imports AuthModule back. The auth decorators it uses are plain functions,
 * and the guards are global.
 */
@Module({
  imports: [
    ConfigModule.forFeature(authConfig),
    ConfigModule.forFeature(mailConfig),
    TypeOrmModule.forFeature([User, AccountToken]),
    MailModule,
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    PasswordService,
    AccountTokensService,
    AccountEmailsService,
  ],
  exports: [
    UsersService,
    PasswordService,
    AccountTokensService,
    AccountEmailsService,
  ],
})
export class UsersModule {}
