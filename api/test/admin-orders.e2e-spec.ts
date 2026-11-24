import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { ContactSubmission } from '@/contact/entities/contact-submission.entity';
import { Order, OrderStatus } from '@/orders/entities/order.entity';
import { UserRole, type User } from '@/users/entities/user.entity';
import { adminApi, dataOf, errorOf, rowsOf } from './utils/admin';
import { loginAs } from './utils/auth';
import { resetDatabase } from './utils/database';
import { createOrder, createProduct, createUser } from './utils/factories';
import { createTestApp } from './utils/test-app';
import { resetRateLimits } from './utils/throttler';

describe('Admin API: orders, contact messages, dashboard (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let editor: User;
  let admin: ReturnType<typeof adminApi>;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
    resetRateLimits(app);
    editor = await createUser(dataSource, { role: UserRole.Editor });
    admin = adminApi(app, (await loginAs(app, editor)).accessToken);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const setStatus = (id: string, status: OrderStatus) =>
    dataSource.getRepository(Order).update(id, { status });

  describe('orders', () => {
    it('lists orders newest first, with item counts and the statuses they may move to', async () => {
      const older = await createOrder(dataSource, {}, [{}, {}]);
      const newer = await createOrder(dataSource);

      const rows = rowsOf(
        await admin.get('orders?sort=createdAt&order=DESC').expect(200),
      );

      expect(rows.map((o) => o.id)).toEqual([newer.id, older.id]);
      expect(rows[1]).toMatchObject({
        number: older.number,
        status: 'new',
        itemCount: 2,
        items: [],
        nextStatuses: ['processing', 'declined'],
        userId: null,
      });
    });

    it('shows one order with its items in order, and its customer account', async () => {
      const customer = await createUser(dataSource);
      const soup = await createProduct(dataSource, {
        title: 'Суп',
        price: 9000,
      });
      const order = await createOrder(dataSource, { user: customer }, [
        { product: soup, quantity: 2 },
        { title: 'Хліб', unitPrice: 1000 },
      ]);

      const res = dataOf(await admin.get(`orders/${order.id}`).expect(200));

      expect(res).toMatchObject({
        userId: customer.id,
        itemCount: 2,
        subtotal: 19000,
        items: [
          {
            productId: soup.id,
            title: 'Суп',
            unitPrice: 9000,
            quantity: 2,
            lineTotal: 18000,
          },
          {
            productId: null,
            title: 'Хліб',
            unitPrice: 1000,
            quantity: 1,
            lineTotal: 1000,
          },
        ],
      });
    });

    it('finds orders by number, by part of the name or phone, by status and by date', async () => {
      const a = await createOrder(dataSource, {
        name: 'Олена Коваль',
        phone: '+380 67 111 22 33',
      });
      const b = await createOrder(dataSource, { name: 'Іван' });
      await setStatus(b.id, OrderStatus.Processing);
      const ids = async (query: string) =>
        rowsOf(await admin.get(`orders?${query}`).expect(200)).map((o) => o.id);

      expect(await ids(`q=${a.number}`)).toEqual([a.id]);
      expect(await ids(`q=${encodeURIComponent('коваль')}`)).toEqual([a.id]);
      expect(await ids(`q=${encodeURIComponent('111 22')}`)).toEqual([a.id]);
      expect(await ids('status=processing')).toEqual([b.id]);
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
      expect(await ids(`from=${tomorrow}`)).toEqual([]);
      expect((await ids(`to=${tomorrow}`)).sort()).toEqual([a.id, b.id].sort());
    });

    it.each([
      [OrderStatus.New, OrderStatus.Processing],
      [OrderStatus.New, OrderStatus.Declined],
      [OrderStatus.Processing, OrderStatus.Completed],
      [OrderStatus.Processing, OrderStatus.Declined],
    ])('moves an order from %s to %s', async (from, to) => {
      const order = await createOrder(dataSource);
      await setStatus(order.id, from);

      const res = await admin
        .post(`orders/${order.id}/status`, { status: to })
        .expect(201);

      expect(dataOf(res)).toMatchObject({ status: to });
      expect(
        (
          await dataSource
            .getRepository(Order)
            .findOneByOrFail({ id: order.id })
        ).status,
      ).toBe(to);
    });

    it.each([
      [OrderStatus.New, OrderStatus.Completed],
      [OrderStatus.Completed, OrderStatus.New],
      [OrderStatus.Declined, OrderStatus.Processing],
      [OrderStatus.New, OrderStatus.New],
    ])('refuses %s → %s with 400 INVALID_TRANSITION', async (from, to) => {
      const order = await createOrder(dataSource);
      await setStatus(order.id, from);

      const res = await admin
        .post(`orders/${order.id}/status`, { status: to })
        .expect(400);

      expect(errorOf(res).code).toBe('INVALID_TRANSITION');
    });

    it('refuses a change based on a status someone else changed meanwhile: 409 ORDER_STATUS_CHANGED', async () => {
      const order = await createOrder(dataSource);
      // Another admin moved it on after this request read it as `new`.
      await setStatus(order.id, OrderStatus.Processing);
      const stale = Object.assign(new Order(), order, {
        status: OrderStatus.New,
      });
      jest
        .spyOn(Repository.prototype, 'findOneBy')
        .mockResolvedValueOnce(stale);

      const res = await admin
        .post(`orders/${order.id}/status`, { status: 'declined' })
        .expect(409);

      expect(errorOf(res).code).toBe('ORDER_STATUS_CHANGED');
      expect(
        (
          await dataSource
            .getRepository(Order)
            .findOneByOrFail({ id: order.id })
        ).status,
      ).toBe(OrderStatus.Processing);
    });

    it('has no create, edit or delete', async () => {
      const order = await createOrder(dataSource);

      await admin.post('orders', {}).expect(404);
      await admin.patch(`orders/${order.id}`, { subtotal: 0 }).expect(404);
      await admin.del(`orders/${order.id}`).expect(404);
    });
  });

  describe('contact messages', () => {
    const insert = (overrides: Partial<ContactSubmission> = {}) =>
      dataSource.getRepository(ContactSubmission).save({
        name: 'Олена',
        email: 'olena@example.com',
        message: 'Чи є доставка в Ірпінь?',
        handledAt: null,
        ...overrides,
      });

    it('lists new messages, marks one handled (and new again)', async () => {
      const message = await insert();
      await insert({ handledAt: new Date() });

      const fresh = rowsOf(
        await admin.get('contact-messages?handled=false').expect(200),
      );
      expect(fresh.map((m) => m.id)).toEqual([message.id]);

      const handled = dataOf(
        await admin
          .patch(`contact-messages/${message.id}`, { handled: true })
          .expect(200),
      );
      expect(handled).toMatchObject({
        handled: true,
        handledAt: expect.any(String),
      });
      expect(
        rowsOf(await admin.get('contact-messages?handled=false').expect(200)),
      ).toEqual([]);

      await admin
        .patch(`contact-messages/${message.id}`, { handled: false })
        .expect(200);
      expect(
        rowsOf(await admin.get('contact-messages?handled=false').expect(200)),
      ).toHaveLength(1);
    });

    it('searches the text', async () => {
      await insert();
      await insert({ message: 'Інше' });

      const rows = rowsOf(
        await admin
          .get(`contact-messages?q=${encodeURIComponent('ірпінь')}`)
          .expect(200),
      );
      expect(rows).toHaveLength(1);
    });

    it('lets admins delete, not editors', async () => {
      const message = await insert();

      await admin.del(`contact-messages/${message.id}`).expect(403);

      const owner = await createUser(dataSource, { role: UserRole.Admin });
      const asAdmin = adminApi(app, (await loginAs(app, owner)).accessToken);
      await asAdmin.del(`contact-messages/${message.id}`).expect(204);
    });
  });

  describe('dashboard', () => {
    it('counts orders by status, today and this week, and new messages; lists the newest', async () => {
      const today = await createOrder(dataSource);
      const old = await createOrder(dataSource);
      await dataSource.getRepository(Order).update(old.id, {
        createdAt: new Date(Date.now() - 30 * 86_400_000),
        status: OrderStatus.Completed,
      });
      await dataSource.getRepository(ContactSubmission).save([
        { name: 'a', email: 'a@example.com', message: 'x', handledAt: null },
        {
          name: 'b',
          email: 'b@example.com',
          message: 'y',
          handledAt: new Date(),
        },
      ]);

      const data = dataOf(await admin.get('dashboard').expect(200));

      expect(data).toMatchObject({
        ordersByStatus: { new: 1, processing: 0, declined: 0, completed: 1 },
        ordersToday: 1,
        ordersLast7Days: 1,
        unhandledMessages: 1,
      });
      expect((data.latestOrders as { id: string }[]).map((o) => o.id)).toEqual([
        today.id,
        old.id,
      ]);
    });
  });
});
