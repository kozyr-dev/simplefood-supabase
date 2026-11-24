import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlogCategory } from '@/blog/entities/blog-category.entity';
import { ProductCategory } from '@/catalog/entities/product-category.entity';
import { Product } from '@/catalog/entities/product.entity';
import { Media } from '@/media/entities/media.entity';
import {
  AdminMenuItemsController,
  AdminMenusController,
} from './controllers/admin-menus.controller';
import {
  AdminPageSectionsController,
  AdminPagesController,
} from './controllers/admin-pages.controller';
import { AdminSettingsController } from './controllers/admin-settings.controller';
import { MenusController } from './controllers/menus.controller';
import { PagesController } from './controllers/pages.controller';
import { SettingsController } from './controllers/settings.controller';
import { MenuItem } from './entities/menu-item.entity';
import { Menu } from './entities/menu.entity';
import { PageSection } from './entities/page-section.entity';
import { Page } from './entities/page.entity';
import { SiteSettings } from './entities/site-settings.entity';
import { AdminMenusService } from './services/admin-menus.service';
import { AdminPageSectionsService } from './services/admin-page-sections.service';
import { AdminPagesService } from './services/admin-pages.service';
import { AdminSettingsService } from './services/admin-settings.service';
import { MenusService } from './services/menus.service';
import { PagesService } from './services/pages.service';
import { SectionReferencesService } from './services/section-references.service';
import { SettingsService } from './services/settings.service';

/**
 * Site-wide content: settings, navigation menus and pages with sections,
 * read publicly and edited through the admin's /api/admin routes.
 * Sections refer to media, products and blog categories, which are read
 * here directly (read-only). If product visibility rules grow, move those
 * queries behind a service exported by CatalogModule instead.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SiteSettings,
      Menu,
      MenuItem,
      Page,
      PageSection,
      Media,
      Product,
      ProductCategory,
      BlogCategory,
    ]),
  ],
  controllers: [
    SettingsController,
    MenusController,
    PagesController,
    AdminSettingsController,
    AdminMenusController,
    AdminMenuItemsController,
    AdminPagesController,
    AdminPageSectionsController,
  ],
  providers: [
    SettingsService,
    MenusService,
    PagesService,
    SectionReferencesService,
    AdminSettingsService,
    AdminMenusService,
    AdminPagesService,
    AdminPageSectionsService,
  ],
})
export class ContentModule {}
