import type { OrderDto } from '../dto/order.dto';
import { OrderStatus, ShippingMethod } from '../entities/order.entity';
import { orderConfirmation, orderShopNotification } from './order-emails';

const NBSP = ' ';

const order = {
  id: 'order-1',
  number: 42,
  status: OrderStatus.New,
  shippingMethod: ShippingMethod.Delivery,
  name: 'Іван <b>Петренко</b>',
  email: 'ivan@example.com',
  phone: '+380 67 123 45 67',
  address: 'Київ, Хрещатик 1 & кв. 5',
  comments: 'Дзвоніть двічі\n<script>alert(1)</script>',
  subtotal: 42300,
  items: [
    {
      productId: 'a',
      title: 'Борщ',
      unitPrice: 18900,
      quantity: 2,
      lineTotal: 37800,
    },
    {
      productId: 'b',
      title: 'Компот "домашній"',
      unitPrice: 4500,
      quantity: 1,
      lineTotal: 4500,
    },
  ],
  legacyItemsText: null,
  createdAt: new Date('2026-11-06T10:00:00Z'),
} satisfies OrderDto;

describe('order emails', () => {
  describe('orderShopNotification', () => {
    const mail = orderShopNotification(order, { registered: false });

    it('has a fixed subject with the number only', () => {
      expect(mail.subject).toBe('Нове замовлення №42');
    });

    it('lists everything needed to call the customer back', () => {
      expect(mail.text).toBe(
        [
          'Нове замовлення №42',
          '',
          'Клієнт: Іван <b>Петренко</b>',
          'Телефон: +380 67 123 45 67',
          'Email: ivan@example.com',
          'Отримання: Доставка кур’єром',
          'Адреса: Київ, Хрещатик 1 & кв. 5',
          'Коментар: Дзвоніть двічі\n<script>alert(1)</script>',
          'Замовник: гість',
          '',
          'Товари:',
          `1. Борщ — 189,00${NBSP}₴ × 2 = 378,00${NBSP}₴`,
          `2. Компот "домашній" — 45,00${NBSP}₴ × 1 = 45,00${NBSP}₴`,
          `Разом: 423,00${NBSP}₴`,
        ].join('\n'),
      );
    });

    it('escapes everything the customer typed in the HTML', () => {
      expect(mail.html).toContain('Іван &lt;b&gt;Петренко&lt;/b&gt;');
      expect(mail.html).toContain('Київ, Хрещатик 1 &amp; кв. 5');
      expect(mail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(mail.html).toContain('Компот &quot;домашній&quot;');
      expect(mail.html).not.toContain('<script>');
      expect(mail.html).not.toContain('<b>');
    });

    it('says whether the customer has an account', () => {
      expect(orderShopNotification(order, { registered: true }).text).toContain(
        'Замовник: зареєстрований клієнт',
      );
    });

    it('leaves out the empty rows: a pickup order has no address', () => {
      const pickup = orderShopNotification(
        {
          ...order,
          shippingMethod: ShippingMethod.Pickup,
          address: null,
          comments: null,
        },
        { registered: false },
      );

      expect(pickup.text).toContain('Отримання: Самовивіз');
      expect(pickup.text).not.toContain('Адреса');
      expect(pickup.text).not.toContain('Коментар');
      expect(pickup.html).not.toContain('Адреса');
    });
  });

  describe('orderConfirmation', () => {
    const mail = orderConfirmation(order);

    it('confirms the number, the items and the total', () => {
      expect(mail.subject).toBe('Замовлення №42 прийнято');
      expect(mail.text).toContain(
        `1. Борщ — 189,00${NBSP}₴ × 2 = 378,00${NBSP}₴`,
      );
      expect(mail.text).toContain(`Разом: 423,00${NBSP}₴`);
      expect(mail.text).toContain('Отримання: Доставка кур’єром');
      expect(mail.html).toContain('Компот &quot;домашній&quot;');
    });

    it('repeats nothing the customer typed: anyone can enter any email', () => {
      for (const typed of [
        'Іван',
        'Петренко',
        'Хрещатик',
        'Дзвоніть',
        'script',
        order.phone,
        order.email,
      ]) {
        expect(mail.text).not.toContain(typed);
        expect(mail.html).not.toContain(typed);
      }
    });

    it('tells someone who never ordered to ignore it', () => {
      expect(mail.text).toContain('Якщо ви не робили цього замовлення');
    });
  });
});
