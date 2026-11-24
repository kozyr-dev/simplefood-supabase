import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { minutes, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { HealthModule } from '@/health/health.module';
import { MediaModule } from '@/media/media.module';
import { CatalogModule } from '@/catalog/catalog.module';
import { ContentModule } from '@/content/content.module';
import { BlogModule } from '@/blog/blog.module';
import { UsersModule } from '@/users/users.module';
import { AuthModule } from '@/auth/auth.module';
import { OrdersModule } from '@/orders/orders.module';
import { ContactModule } from '@/contact/contact.module';
import { DashboardModule } from '@/dashboard/dashboard.module';
import databaseConfig from '@/config/database.config';
import validationSchema from '@/config/env.validation';
import loggerConfig from '@/config/logger.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
      load: [databaseConfig, loggerConfig],
    }),
    TypeOrmModule.forRootAsync(databaseConfig.asProvider()),
    LoggerModule.forRootAsync(loggerConfig.asProvider()),
    // Limits only where AuthThrottlerGuard is applied, not globally;
    // routes without their own @Throttle() get this one.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: minutes(1), limit: 30 }],
      errorMessage: 'Too many requests, try again later',
    }),
    HealthModule,
    MediaModule,
    CatalogModule,
    ContentModule,
    BlogModule,
    UsersModule,
    AuthModule,
    OrdersModule,
    ContactModule,
    DashboardModule,
  ],
})
export class AppModule {}
