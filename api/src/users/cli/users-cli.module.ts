import { Module, type INestApplicationContext } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import databaseConfig from '@/config/database.config';
import validationSchema from '@/config/env.validation';
import { UsersModule } from '../users.module';

/**
 * What the account commands (`admin:create`) need: the validated config,
 * the database and UsersModule. No HTTP server, no request logging.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule.forFeature(databaseConfig)],
      inject: [databaseConfig.KEY],
      // One try: a command should fail at once, not retry for half a minute.
      useFactory: (options: ReturnType<typeof databaseConfig>) => ({
        ...options,
        retryAttempts: 0,
      }),
    }),
    // Nothing is served, but UsersModule's controller is still built, and
    // its rate-limit guard needs the throttler's options (AppModule's).
    ThrottlerModule.forRoot([]),
    UsersModule,
  ],
})
export class UsersCliModule {}

/** Starts UsersCliModule for a command; close it when done. */
export function openUsersCliContext(): Promise<INestApplicationContext> {
  return NestFactory.createApplicationContext(UsersCliModule, {
    // The command prints its own result; Nest's and TypeORM's lines aren't.
    logger: false,
    // Throw instead of aborting the process, so the error is reported.
    abortOnError: false,
  });
}
