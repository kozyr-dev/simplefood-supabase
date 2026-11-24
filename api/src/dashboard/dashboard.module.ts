import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactSubmission } from '@/contact/entities/contact-submission.entity';
import { Order } from '@/orders/entities/order.entity';
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { DashboardService } from './services/dashboard.service';

/** The admin app's start page: /api/admin/dashboard (read-only counts). */
@Module({
  imports: [TypeOrmModule.forFeature([Order, ContactSubmission])],
  controllers: [AdminDashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
