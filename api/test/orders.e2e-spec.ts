import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Product } from '@/catalog/entities/product.entity';
import authConfig, { type AuthConfig } from '@/config/auth.config';
import { OrderItem } from '@/orders/entities/order-item.entity';
import {
  Order,
  OrderStatus,
  ShippingMethod,
} from '@/orders/entities/order.entity';
import { User, UserRole } from '@/users/entities/user.entity';
import { bearer, loginAs } from './utils/auth';
import { resetDatabase } from './utils/database';
import {
  createOrder,
  createProduct,
  createUser,
  daysFromNow,
} from './utils/factories';
import { mailbox } from './utils/mail';
import { createTestApp } from './utils/test-app';
import { resetRateLimits } from './utils/throttler';

const NBSP = '\u00a0';

interface OrderBody {
  data: {
    id: string;
    number: number;
    subtotal: number;
    address: string | null;
    comments: string | null;
    items: { productId: string | null; title: string; unitPrice: number }[];
  };
}

describe('Orders (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let borscht: Product;
  let compote: Product;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
    resetRateLimits(app);
    (await mailbox(app)).clear();
    borscht = await createProduct(dataSource, { title: 'Борщ', price: 18900 });
    compote = await createProduct(dataSource, { title: 'Компот', price: 4500 });
  });

  const http = () => request(app.getHttpServer());

  /** A valid guest delivery order for 2 × borscht and 1 × compote. */
  const orderBody = (overrides: Record<string, unknown> = {}) => ({
    items: [
      { productId: borscht.id, quantity: 2 },
      { productId: compote.id, quantity: 1 },
    ],
    name: 'Іван Петренко',
    email: 'ivan@example.com',
    phone: '+380 67 123 45 67',
    shippingMethod: 'delivery',
    address: 'Київ, Хрещатик 1, кв. 5',
    comments: 'Дзвоніть двічі',
    ...overrides,
  });

  const placeOrder = (body: object, token?: string) => {
    const req = http().post('/api/orders');
    return (token ? req.set(bearer(token)) : req).send(body);
  };

  const orderCount = () => dataSource.getRepository(Order).count();

  const errorOf = (res: request.Response) =>
    (res.body as { error: Record<string, unknown> }).error;

  describe('POST /orders', () => {
    it('places a guest order, priced from the database', async () => {
      const res = await placeOrder(orderBody()).expect(201);

      expect(res.headers['cache-control']).toBe('no-store');
      expect((res.body as OrderBody).data).toEqual({
        id: expect.any(String),
        number: 1,
        status: 'new',
        shippingMethod: 'delivery',
        name: 'Іван Петренко',
        email: 'ivan@example.com',
        phone: '+380 67 123 45 67',
        address: 'Київ, Хрещатик 1, кв. 5',
        comments: 'Дзвоніть двічі',
        subtotal: 2 * 18900 + 4500,
        items: [
          {
            productId: borscht.id,
            title: 'Борщ',
            unitPrice: 18900,
            quantity: 2,
            lineTotal: 37800,
          },
          {
            productId: compote.id,
            title: 'Компот',
            unitPrice: 4500,
            quantity: 1,
            lineTotal: 4500,
          },
        ],
        legacyItemsText: null,
        createdAt: expect.any(String),
      });

      const saved = await dataSource
        .getRepository(Order)
        .findOneByOrFail({ id: (res.body as OrderBody).data.id });
      expect(saved).toMatchObject({ userId: null, subtotal: 42300 });
      expect(await dataSource.getRepository(OrderItem).count()).toBe(2);
    });

    it('emails the shop (Reply-To: the customer) and the customer', async () => {
      await placeOrder(orderBody()).expect(201);

      const [shop, customer] = (await mailbox(app)).sent;
      expect(shop).toMatchObject({
        to: 'shop@example.com',
        replyTo: 'ivan@example.com',
        subject: 'Нове замовлення №1',
      });
      expect(shop.text).toContain('Клієнт: Іван Петренко');
      expect(shop.text).toContain('Адреса: Київ, Хрещатик 1, кв. 5');
      expect(shop.text).toContain('Замовник: гість');
      expect(shop.text).toContain(`Разом: 423,00${NBSP}₴`);

      expect(customer).toMatchObject({
        to: 'ivan@example.com',
        subject: 'Замовлення №1 прийнято',
      });
      expect(customer.replyTo).toBeUndefined();
      expect(customer.text).not.toContain('Іван');
      expect(customer.text).not.toContain('Хрещатик');
    });

    it.each([
      [
        'a price on a line',
        { items: [{ productId: 'X', quantity: 1, price: 1 }] },
      ],
      ['the total', { amount: 100 }],
      ['the subtotal', { subtotal: 100 }],
      ['the status', { status: 'completed' }],
      ['the owner', { userId: randomUUID() }],
    ])('refuses a body that sets %s: 400, nothing saved', async (_, extra) => {
      const body = orderBody(extra);
      // Keep the real product in a tampered line.
      if ('items' in extra) {
        (body.items as { productId: string }[])[0].productId = borscht.id;
      }

      const res = await placeOrder(body).expect(400);

      expect(errorOf(res).code).toBe('BAD_REQUEST');
      expect(await orderCount()).toBe(0);
    });

    it('refuses unknown and unavailable products: 409 naming each line, nothing saved or sent', async () => {
      const soldOut = await createProduct(dataSource, { available: false });

      const res = await placeOrder(
        orderBody({
          items: [
            { productId: borscht.id, quantity: 1 },
            { productId: soldOut.id, quantity: 1 },
            { productId: randomUUID(), quantity: 1 },
          ],
        }),
      ).expect(409);

      expect(errorOf(res)).toMatchObject({
        status: 409,
        code: 'PRODUCTS_UNAVAILABLE',
        details: [
          {
            field: 'items.1.productId',
            messages: ['product is not available'],
          },
          {
            field: 'items.2.productId',
            messages: ['product is not available'],
          },
        ],
      });
      expect(await orderCount()).toBe(0);
      expect((await mailbox(app)).sent).toEqual([]);
    });

    it.each([
      ['no items', { items: [] }],
      [
        '51 lines',
        {
          items: Array.from({ length: 51 }, () => ({
            productId: randomUUID(),
            quantity: 1,
          })),
        },
      ],
      [
        'a product twice',
        {
          items: [
            { productId: 'A', quantity: 1 },
            { productId: 'A', quantity: 2 },
          ],
        },
      ],
      [
        'a product twice, in different case',
        {
          items: [
            { productId: 'lower', quantity: 1 },
            { productId: 'UPPER', quantity: 2 },
          ],
        },
      ],
      ['quantity 0', { items: [{ productId: 'A', quantity: 0 }] }],
      ['quantity 100', { items: [{ productId: 'A', quantity: 100 }] }],
      ['quantity 1.5', { items: [{ productId: 'A', quantity: 1.5 }] }],
      ['quantity as text', { items: [{ productId: 'A', quantity: '2' }] }],
      [
        'an id that is not a uuid',
        { items: [{ productId: 'borscht', quantity: 1 }] },
      ],
      ['items that are not objects', { items: [1, 2] }],
      ['no email', { email: undefined }],
      ['a bad email', { email: 'ivan.example.com' }],
      ['a bad phone', { phone: 'call me' }],
      ['a blank name', { name: '   ' }],
      ['an unknown shipping method', { shippingMethod: 'flat_rate' }],
      ['delivery without an address', { address: undefined }],
      ['delivery with a blank address', { address: '  ' }],
      ['a comment over 1000 characters', { comments: 'x'.repeat(1001) }],
    ])('refuses %s with 400', async (_, overrides) => {
      const body = orderBody(overrides);
      // 'A', 'lower', 'UPPER': stand-ins for one real product id.
      for (const line of body.items as { productId: unknown }[]) {
        if (line.productId === 'A' || line.productId === 'lower') {
          line.productId = borscht.id;
        } else if (line.productId === 'UPPER') {
          line.productId = borscht.id.toUpperCase();
        }
      }

      await placeOrder(body).expect(400);
      expect(await orderCount()).toBe(0);
    });

    it('accepts a product id in capitals (uuids ignore case)', async () => {
      const res = await placeOrder(
        orderBody({
          items: [{ productId: borscht.id.toUpperCase(), quantity: 1 }],
        }),
      ).expect(201);

      expect((res.body as OrderBody).data.items[0]).toMatchObject({
        productId: borscht.id,
        unitPrice: 18900,
      });
    });

    it('stores no address for pickup, and an empty comment as none', async () => {
      const res = await placeOrder(
        orderBody({
          shippingMethod: 'pickup',
          address: 'Київ, магазин',
          comments: '   ',
        }),
      ).expect(201);

      expect((res.body as OrderBody).data).toMatchObject({
        address: null,
        comments: null,
      });
      expect((await mailbox(app)).sent[0].text).toContain(
        'Отримання: Самовивіз',
      );
    });

    it('numbers orders one after another', async () => {
      const numbers = [];
      for (let i = 0; i < 3; i++) {
        const res = await placeOrder(orderBody()).expect(201);
        numbers.push((res.body as OrderBody).data.number);
      }

      expect(numbers).toEqual([1, 2, 3]);
    });

    it('still places the order when the email fails', async () => {
      (await mailbox(app)).failNext(2);

      await placeOrder(orderBody()).expect(201);

      expect(await orderCount()).toBe(1);
      expect((await mailbox(app)).sent).toEqual([]);
    });

    describe('logged in', () => {
      it("links the order to the token's account, not the email's", async () => {
        const ivan = await createUser(dataSource, {
          email: 'ivan@example.com',
        });
        const olena = await createUser(dataSource);
        const { accessToken } = await loginAs(app, olena);

        // Olena orders with Ivan's email address.
        const res = await placeOrder(orderBody(), accessToken).expect(201);

        const saved = await dataSource
          .getRepository(Order)
          .findOneByOrFail({ id: (res.body as OrderBody).data.id });
        expect(saved.userId).toBe(olena.id);
        expect(saved.userId).not.toBe(ivan.id);
        expect((await mailbox(app)).sent[0].text).toContain(
          'Замовник: зареєстрований клієнт',
        );
      });

      it('refuses an expired token with 401: never a silent guest order', async () => {
        const auth = app.get<AuthConfig>(authConfig.KEY);
        const now = Math.floor(Date.now() / 1000);
        const expired = await new JwtService({
          secret: auth.accessSecret,
        }).signAsync(
          {
            sub: (await createUser(dataSource)).id,
            role: UserRole.Customer,
            iat: now - 60,
            exp: now - 1,
          },
          { issuer: auth.issuer, audience: auth.audience },
        );

        const res = await placeOrder(orderBody(), expired).expect(401);

        expect(res.headers['www-authenticate']).toBe(
          'Bearer error="invalid_token"',
        );
        expect(await orderCount()).toBe(0);
      });

      it.each([
        [
          'blocked',
          (user: User) =>
            dataSource.getRepository(User).update(user.id, { blocked: true }),
        ],
        [
          'deleted',
          (user: User) => dataSource.getRepository(User).delete(user.id),
        ],
      ])(
        'refuses a %s account whose token is still valid: 401',
        async (_, change) => {
          const user = await createUser(dataSource);
          const { accessToken } = await loginAs(app, user);
          await change(user);

          await placeOrder(orderBody(), accessToken).expect(401);
          expect(await orderCount()).toBe(0);
        },
      );
    });
  });

  describe('GET /orders/me', () => {
    const myOrders = (token: string, query = '') =>
      http().get(`/api/orders/me${query}`).set(bearer(token));

    it('needs a login', async () => {
      await http().get('/api/orders/me').expect(401);
    });

    it("lists only the caller's orders, newest first, with their items", async () => {
      const ivan = await createUser(dataSource, { email: 'ivan@example.com' });
      const olena = await createUser(dataSource);
      const older = await createOrder(
        dataSource,
        { user: ivan, createdAt: daysFromNow(-2) },
        [{ product: borscht, quantity: 2 }, { product: compote }],
      );
      const newer = await createOrder(dataSource, {
        user: ivan,
        createdAt: daysFromNow(-1),
      });
      await createOrder(dataSource, { user: olena });
      // A guest order with Ivan's email is not his.
      await createOrder(dataSource, { email: 'ivan@example.com' });
      const { accessToken } = await loginAs(app, ivan);

      const res = await myOrders(accessToken).expect(200);

      expect(res.headers['cache-control']).toBe('no-store');
      const body = res.body as {
        data: OrderBody['data'][];
        meta: Record<string, number>;
      };
      expect(body.data.map((order) => order.id)).toEqual([newer.id, older.id]);
      expect(body.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 2,
        pageCount: 1,
      });
      expect(body.data[1].items).toEqual([
        {
          productId: borscht.id,
          title: 'Борщ',
          unitPrice: 18900,
          quantity: 2,
          lineTotal: 37800,
        },
        {
          productId: compote.id,
          title: 'Компот',
          unitPrice: 4500,
          quantity: 1,
          lineTotal: 4500,
        },
      ]);
    });

    it('pages through them', async () => {
      const user = await createUser(dataSource);
      const orders = [];
      for (let day = 3; day >= 1; day--) {
        orders.push(
          await createOrder(dataSource, { user, createdAt: daysFromNow(-day) }),
        );
      }
      const { accessToken } = await loginAs(app, user);

      const res = await myOrders(accessToken, '?page=2&pageSize=1').expect(200);

      const body = res.body as { data: { id: string }[]; meta: object };
      expect(body.data.map((order) => order.id)).toEqual([orders[1].id]);
      expect(body.meta).toEqual({
        page: 2,
        pageSize: 1,
        total: 3,
        pageCount: 3,
      });
    });

    it('keeps the price an order was placed at, and survives a deleted product', async () => {
      const user = await createUser(dataSource);
      const { accessToken } = await loginAs(app, user);
      await placeOrder(
        orderBody({
          items: [
            { productId: borscht.id, quantity: 1 },
            { productId: compote.id, quantity: 1 },
          ],
        }),
        accessToken,
      ).expect(201);

      await dataSource
        .getRepository(Product)
        .update(borscht.id, { price: 99900 });
      await dataSource.getRepository(Product).delete(compote.id);

      const res = await myOrders(accessToken).expect(200);
      const [order] = (res.body as { data: OrderBody['data'][] }).data;
      expect(order.subtotal).toBe(18900 + 4500);
      expect(order.items).toEqual([
        expect.objectContaining({ productId: borscht.id, unitPrice: 18900 }),
        expect.objectContaining({
          productId: null,
          title: 'Компот',
          unitPrice: 4500,
        }),
      ]);
    });

    it("shows an old site's order by its dish text", async () => {
      const user = await createUser(dataSource);
      await createOrder(
        dataSource,
        { user, legacyDishesText: 'Борщ - 2 шт.' },
        [],
      );
      const { accessToken } = await loginAs(app, user);

      const res = await myOrders(accessToken).expect(200);

      expect((res.body as { data: object[] }).data[0]).toMatchObject({
        items: [],
        legacyItemsText: 'Борщ - 2 шт.',
      });
    });

    it('refuses a blocked account whose token is still valid: 401', async () => {
      const user = await createUser(dataSource);
      const { accessToken } = await loginAs(app, user);
      await dataSource.getRepository(User).update(user.id, { blocked: true });

      await myOrders(accessToken).expect(401);
    });
  });

  /** The order with its items in position order. */
  const reload = (order: Order) =>
    dataSource.getRepository(Order).findOneOrFail({
      where: { id: order.id },
      relations: { user: true, items: { product: true } },
      order: { items: { position: 'ASC' } },
    });

  /** An item written directly, past the factory's arithmetic. */
  const insertItem = (order: Order, item: Partial<OrderItem>) =>
    dataSource.getRepository(OrderItem).save({
      order,
      position: 1,
      title: 'Борщ',
      unitPrice: 100,
      quantity: 2,
      lineTotal: 200,
      ...item,
    });

  describe('database constraints', () => {
    it('saves an order with its items, as new, numbered from 1', async () => {
      const borscht = await createProduct(dataSource, {
        title: 'Борщ',
        price: 18900,
      });
      const order = await createOrder(dataSource, {}, [
        { product: borscht, quantity: 2 },
        { title: 'Компот', unitPrice: 4500 },
      ]);

      const saved = await reload(order);
      expect(saved).toMatchObject({
        number: 1,
        status: OrderStatus.New,
        subtotal: 2 * 18900 + 4500,
        user: null,
      });
      expect(
        saved.items.map(
          ({ position, title, unitPrice, quantity, lineTotal }) => ({
            position,
            title,
            unitPrice,
            quantity,
            lineTotal,
          }),
        ),
      ).toEqual([
        {
          position: 0,
          title: 'Борщ',
          unitPrice: 18900,
          quantity: 2,
          lineTotal: 37800,
        },
        {
          position: 1,
          title: 'Компот',
          unitPrice: 4500,
          quantity: 1,
          lineTotal: 4500,
        },
      ]);
      expect(saved.items[0].product?.id).toBe(borscht.id);
    });

    it('numbers orders in the order they are placed', async () => {
      const numbers = [];
      for (let i = 0; i < 3; i++) {
        numbers.push((await createOrder(dataSource)).number);
      }

      expect(numbers).toEqual([1, 2, 3]);
    });

    it('never takes a number from outside: not on insert, not on update', async () => {
      await expect(createOrder(dataSource, { number: 99 })).rejects.toThrow(
        'cannot insert a non-DEFAULT value into column "number"',
      );

      const order = await createOrder(dataSource);
      await expect(
        dataSource.getRepository(Order).update(order.id, { number: 99 }),
      ).rejects.toThrow('column "number" can only be updated to DEFAULT');
    });

    it('needs an address for delivery, not for pickup', async () => {
      await expect(
        createOrder(dataSource, {
          shippingMethod: ShippingMethod.Delivery,
          address: null,
        }),
      ).rejects.toThrow('CHK_customer_order_delivery_address');

      const pickup = await createOrder(dataSource, {
        shippingMethod: ShippingMethod.Pickup,
        address: null,
      });
      expect((await reload(pickup)).address).toBeNull();
    });

    it.each([
      [{ subtotal: -1 }, 'CHK_customer_order_subtotal_non_negative'],
      [{ email: 'ivan.example.com' }, 'CHK_customer_order_email'],
      [{ email: '@example.com' }, 'CHK_customer_order_email'],
    ])('rejects an order with %o (%s)', async (overrides, constraint) => {
      await expect(createOrder(dataSource, overrides)).rejects.toThrow(
        constraint,
      );
    });

    it.each([
      [{ lineTotal: 201 }, 'CHK_order_item_line_total'],
      [{ quantity: 0, lineTotal: 0 }, 'CHK_order_item_quantity_positive'],
      [
        { unitPrice: -100, lineTotal: -200 },
        'CHK_order_item_unit_price_non_negative',
      ],
      [{ position: 0 }, 'UQ_order_item_position'],
    ])('rejects an item with %o (%s)', async (item, constraint) => {
      const order = await createOrder(dataSource); // its one item is position 0

      await expect(insertItem(order, item)).rejects.toThrow(constraint);
    });

    it('deletes the items with their order', async () => {
      const order = await createOrder(dataSource, {}, [{}, {}]);

      await dataSource.getRepository(Order).delete(order.id);

      expect(await dataSource.getRepository(OrderItem).count()).toBe(0);
    });

    it('keeps the order readable when its product is deleted', async () => {
      const product = await createProduct(dataSource, { title: 'Борщ' });
      const order = await createOrder(dataSource, {}, [{ product }]);

      await dataSource.getRepository(Product).delete(product.id);

      expect((await reload(order)).items[0]).toMatchObject({
        product: null,
        title: 'Борщ',
        unitPrice: product.price,
      });
    });

    it('keeps the order, without its owner, when the account is deleted', async () => {
      const user = await createUser(dataSource);
      const order = await createOrder(dataSource, { user });
      expect((await reload(order)).user?.id).toBe(user.id);

      await dataSource.getRepository(User).delete(user.id);

      expect(await reload(order)).toMatchObject({ user: null });
    });
  });
});
