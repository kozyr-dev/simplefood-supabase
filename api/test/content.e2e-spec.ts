import { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  buildSwaggerDocumentConfig,
  operationIdFactory,
} from '@/config/swagger.config';
import { MenuItemGroup } from '@/content/entities/menu-item.entity';
import { Menu, MenuKey } from '@/content/entities/menu.entity';
import { SiteSettings } from '@/content/entities/site-settings.entity';
import { MenuItem } from '@/content/entities/menu-item.entity';
import { Media } from '@/media/entities/media.entity';
import { resetDatabase } from './utils/database';
import { createMedia, createMenu, createSettings } from './utils/factories';
import { createTestApp } from './utils/test-app';

describe('Content: settings and menus (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe('GET /api/settings', () => {
    it('returns 404 in the error shape until the settings exist', async () => {
      const res = await http().get('/api/settings').expect(404);

      expect(res.body.error).toMatchObject({
        code: 'NOT_FOUND',
        message: 'Site settings not found',
      });
    });

    it('returns the settings, without id or timestamps', async () => {
      await createSettings(dataSource, {
        siteName: 'SimpleFood',
        address: null,
        seo: { title: 'SimpleFood', description: null },
      });

      const res = await http().get('/api/settings').expect(200);

      expect(res.body).toEqual({
        data: {
          siteName: 'SimpleFood',
          phone: '+380 44 123 45 67',
          address: null,
          workingHours: 'Mon–Sun 10:00–22:00',
          takingOrdersHours: 'until 21:30',
          facebook: 'https://facebook.com/simplefood',
          instagram: 'https://instagram.com/simplefood',
          seo: { title: 'SimpleFood', description: null, shareImage: null },
        },
      });
    });

    it('returns the SEO share image, and null once its file is deleted', async () => {
      const shareImage = await createMedia(dataSource, { alt: 'Open Graph' });
      await createSettings(dataSource, {
        seo: { title: 'SimpleFood', description: null, shareImage },
      });

      const res = await http().get('/api/settings').expect(200);
      expect(res.body.data.seo.shareImage).toMatchObject({
        id: shareImage.id,
        url: shareImage.url,
        alt: 'Open Graph',
      });

      await dataSource.getRepository(Media).delete({ id: shareImage.id });

      const after = await http().get('/api/settings').expect(200);
      expect(after.body.data.seo.shareImage).toBeNull();
    });
  });

  describe('single settings row (enforced by the database)', () => {
    it('rejects a second row with another id', async () => {
      await createSettings(dataSource);

      await expect(
        dataSource
          .getRepository(SiteSettings)
          .insert({ id: 2, siteName: 'Another site' }),
      ).rejects.toThrow('CHK_site_settings_single_row');
    });

    it('rejects a second row with the default id', async () => {
      await createSettings(dataSource);

      await expect(
        dataSource
          .getRepository(SiteSettings)
          .insert({ siteName: 'Another site' }),
      ).rejects.toThrow(/duplicate key/);
    });
  });

  describe('GET /api/menus/:key', () => {
    it('returns the menu with items in display order', async () => {
      await createMenu(dataSource, MenuKey.Header, [
        { title: 'Contacts', link: '/contact', position: 3 },
        { title: 'Menu', link: '/menu', position: 1, className: 'icon-menu' },
        { title: 'Delivery', link: '/shipping', position: 2 },
      ]);

      const res = await http().get('/api/menus/header').expect(200);

      expect(res.body.data.key).toBe('header');
      expect(res.body.data.items).toEqual([
        {
          id: expect.any(String),
          title: 'Menu',
          link: '/menu',
          className: 'icon-menu',
          group: 'main',
        },
        expect.objectContaining({ title: 'Delivery', className: null }),
        expect.objectContaining({ title: 'Contacts' }),
      ]);
    });

    it('lists the dropdown main items before its secondary list', async () => {
      await createMenu(dataSource, MenuKey.Dropdown, [
        { title: 'Account', group: MenuItemGroup.List, position: 1 },
        { title: 'Pizza', group: MenuItemGroup.Main, position: 2 },
        { title: 'Soups', group: MenuItemGroup.Main, position: 1 },
      ]);

      const res = await http().get('/api/menus/dropdown').expect(200);

      expect(
        res.body.data.items.map(
          (i: { title: string; group: string }) => `${i.group}:${i.title}`,
        ),
      ).toEqual(['main:Soups', 'main:Pizza', 'list:Account']);
    });

    it('returns a menu with no items as an empty list', async () => {
      await createMenu(dataSource, MenuKey.Footer);

      const res = await http().get('/api/menus/footer').expect(200);

      expect(res.body.data).toEqual({ key: 'footer', items: [] });
    });

    it('returns 400 for a key that is not a menu', async () => {
      const res = await http().get('/api/menus/sidebar').expect(400);

      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('returns 404 for a valid key without a menu yet', async () => {
      const res = await http().get('/api/menus/footer').expect(404);

      expect(res.body.error.message).toBe('Menu not found');
    });
  });

  describe('menu constraints', () => {
    it('allows only one menu per key', async () => {
      await createMenu(dataSource, MenuKey.Header);

      await expect(createMenu(dataSource, MenuKey.Header)).rejects.toThrow(
        'UQ_menu_key',
      );
    });

    it('deletes the items together with their menu', async () => {
      const menu = await createMenu(dataSource, MenuKey.Header, [
        { title: 'A' },
        { title: 'B' },
      ]);

      await dataSource.getRepository(Menu).delete({ id: menu.id });

      expect(await dataSource.getRepository(MenuItem).count()).toBe(0);
    });
  });

  describe('Swagger', () => {
    const document = () =>
      SwaggerModule.createDocument(app, buildSwaggerDocumentConfig(), {
        operationIdFactory,
      });

    it('documents both endpoints under the content tag', () => {
      const paths = document().paths;

      expect(paths['/api/settings'].get).toMatchObject({
        operationId: 'Settings_get',
        tags: ['content'],
      });
      expect(paths['/api/menus/{key}'].get).toMatchObject({
        operationId: 'Menus_findByKey',
        tags: ['content'],
      });
    });

    it('documents the menu key as an enum', () => {
      const parameters = document().paths['/api/menus/{key}'].get
        ?.parameters as {
        name: string;
        schema: { $ref?: string };
      }[];
      const key = parameters.find((p) => p.name === 'key');

      expect(key?.schema.$ref).toBe('#/components/schemas/MenuKey');
      expect(document().components?.schemas?.MenuKey).toMatchObject({
        type: 'string',
        enum: ['header', 'footer', 'dropdown'],
      });
    });
  });
});
