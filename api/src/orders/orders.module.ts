import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '@/catalog/entities/product.entity';
import mailConfig from '@/config/mail.config';
import { MailModule } from '@/mail/mail.module';
import { UsersModule } from '@/users/users.module';
import { AdminOrdersController } from './controllers/admin-orders.controller';
import { OrdersController } from './controllers/orders.controller';
import { OrderItem } from './entities/order-item.entity';
import { Order } from './entities/order.entity';
import { AdminOrdersService } from './services/admin-orders.service';
import { OrdersService } from './services/orders.service';

/**
 * Orders: POST /orders (guests too, priced on the server) and
 * GET /orders/me; the admin's /api/admin/orders. Reads products for their prices; emails the shop and the
 * customer through MailModule.
 */
@Module({
  imports: [
    ConfigModule.forFeature(mailConfig),
    TypeOrmModule.forFeature([Order, OrderItem, Product]),
    UsersModule,
    MailModule,
  ],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService, AdminOrdersService],
})
export class OrdersModule {}
