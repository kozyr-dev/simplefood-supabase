import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import authConfig, { type AuthConfig } from '@/config/auth.config';
import { MailModule } from '@/mail/mail.module';
import { User } from '@/users/entities/user.entity';
import { UsersModule } from '@/users/users.module';
import { AdminAuthController } from './controllers/admin-auth.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AuthController } from './controllers/auth.controller';
import { RefreshToken } from './entities/refresh-token.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import {
  AccessTokensService,
  jwtModuleOptions,
} from './services/access-tokens.service';
import { AdminUsersService } from './services/admin-users.service';
import { AuthService } from './services/auth.service';
import { RefreshTokensService } from './services/refresh-tokens.service';

/**
 * Sessions, tokens and the global guards: every route needs a login unless
 * it's `@Public()`. Accounts, password hashing and account tokens come from
 * UsersModule. Serves /auth (register, login, refresh, logout,
 * change-password, forgot-password, reset-password, verify-email,
 * resend-verification), /admin/auth (the admin app's staff sessions) and
 * /admin/users (accounts: roles, blocking).
 */
@Module({
  imports: [
    ConfigModule.forFeature(authConfig),
    JwtModule.registerAsync({
      imports: [ConfigModule.forFeature(authConfig)],
      inject: [authConfig.KEY],
      useFactory: (auth: AuthConfig) => jwtModuleOptions(auth),
    }),
    TypeOrmModule.forFeature([RefreshToken, User]),
    UsersModule,
    MailModule,
  ],
  controllers: [AuthController, AdminAuthController, AdminUsersController],
  providers: [
    AuthService,
    AdminUsersService,
    AccessTokensService,
    RefreshTokensService,
    // Global guards run in the order they're registered: authenticate first,
    // so RolesGuard sees request.user.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
