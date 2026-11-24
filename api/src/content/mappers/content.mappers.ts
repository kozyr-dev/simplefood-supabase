import { toSeoDto } from '@/common/seo/seo.mapper';
import type { MenuItemDto } from '../dto/menu-item.dto';
import type { MenuDto } from '../dto/menu.dto';
import type { SettingsDto } from '../dto/settings.dto';
import { MenuItemGroup, type MenuItem } from '../entities/menu-item.entity';
import type { Menu } from '../entities/menu.entity';
import type { SiteSettings } from '../entities/site-settings.entity';

export function toSettingsDto(settings: SiteSettings): SettingsDto {
  return {
    siteName: settings.siteName,
    phone: settings.phone,
    address: settings.address,
    workingHours: settings.workingHours,
    takingOrdersHours: settings.takingOrdersHours,
    facebook: settings.facebook,
    instagram: settings.instagram,
    seo: toSeoDto(settings.seo),
  };
}

const GROUP_ORDER: Record<MenuItemGroup, number> = {
  [MenuItemGroup.Main]: 0,
  [MenuItemGroup.List]: 1,
};

/** Display order: group (`main` first), position, then id (creation order). */
export function compareMenuItems(a: MenuItem, b: MenuItem): number {
  return (
    GROUP_ORDER[a.group] - GROUP_ORDER[b.group] ||
    a.position - b.position ||
    a.id.localeCompare(b.id)
  );
}

export function toMenuItemDto(item: MenuItem): MenuItemDto {
  return {
    id: item.id,
    title: item.title,
    link: item.link,
    className: item.className,
    group: item.group,
  };
}

/**
 * Expects `items` to be loaded. Sorted here, so the order never depends on
 * how Postgres returned the joined rows.
 */
export function toMenuDto(menu: Menu): MenuDto {
  return {
    key: menu.key,
    items: [...(menu.items ?? [])].sort(compareMenuItems).map(toMenuItemDto),
  };
}
