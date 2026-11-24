import { toAdminSeoDto } from '@/common/seo/admin-seo';
import { publishStateOf } from '@/database/published';
import type {
  AdminMenuItemDto,
  AdminPageDto,
  AdminPageSectionDto,
  AdminSettingsDto,
} from '../dto/admin-content.dto';
import type { MenuItem } from '../entities/menu-item.entity';
import type { PageSection } from '../entities/page-section.entity';
import type { Page } from '../entities/page.entity';
import {
  SITE_SETTINGS_ID,
  type SiteSettings,
} from '../entities/site-settings.entity';

/** Load `seo.shareImage`. Before the record exists: empty fields. */
export function toAdminSettingsDto(
  settings: SiteSettings | null,
): AdminSettingsDto {
  return {
    id: SITE_SETTINGS_ID,
    siteName: settings?.siteName ?? '',
    phone: settings?.phone ?? null,
    address: settings?.address ?? null,
    workingHours: settings?.workingHours ?? null,
    takingOrdersHours: settings?.takingOrdersHours ?? null,
    facebook: settings?.facebook ?? null,
    instagram: settings?.instagram ?? null,
    seo: toAdminSeoDto(settings?.seo),
    updatedAt: settings?.updatedAt ?? null,
  };
}

/** Load `menu` (or pass its id). */
export function toAdminMenuItemDto(
  item: MenuItem,
  menuId = item.menu.id,
): AdminMenuItemDto {
  return {
    id: item.id,
    menuId,
    title: item.title,
    link: item.link,
    className: item.className,
    group: item.group,
    position: item.position,
  };
}

/** Load `seo.shareImage`. */
export function toAdminPageDto(page: Page, sectionCount: number): AdminPageDto {
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    seo: toAdminSeoDto(page.seo),
    publishedAt: page.publishedAt,
    state: publishStateOf(page.publishedAt),
    sectionCount,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  };
}

/** Load `page` (or pass its id). */
export function toAdminPageSectionDto(
  section: PageSection,
  pageId = section.page.id,
): AdminPageSectionDto {
  return {
    id: section.id,
    pageId,
    type: section.type,
    data: section.data as unknown as Record<string, unknown>,
    position: section.position,
  };
}
