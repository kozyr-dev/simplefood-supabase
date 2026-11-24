import { MenuItem, MenuItemGroup } from '../entities/menu-item.entity';
import { Menu, MenuKey } from '../entities/menu.entity';
import { SiteSettings } from '../entities/site-settings.entity';
import { toMenuDto, toSettingsDto } from './content.mappers';

function item(
  id: string,
  title: string,
  group: MenuItemGroup,
  position: number,
): MenuItem {
  return Object.assign(new MenuItem(), {
    id,
    title,
    link: `/${title.toLowerCase()}`,
    className: null,
    group,
    position,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('toSettingsDto', () => {
  const fields = {
    id: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    siteName: 'SimpleFood',
    phone: '+380 44 123 45 67',
    address: null,
    workingHours: '10:00–22:00',
    takingOrdersHours: null,
    facebook: 'https://facebook.com/simplefood',
    instagram: null,
    seo: { title: 'SimpleFood', description: null },
  };
  const settings = Object.assign(new SiteSettings(), fields);

  it('returns the public fields with the SEO defaults', () => {
    expect(toSettingsDto(settings)).toEqual({
      siteName: 'SimpleFood',
      phone: '+380 44 123 45 67',
      address: null,
      workingHours: '10:00–22:00',
      takingOrdersHours: null,
      facebook: 'https://facebook.com/simplefood',
      instagram: null,
      seo: { title: 'SimpleFood', description: null, shareImage: null },
    });
  });

  it('leaves out the id and timestamps', () => {
    const dto = toSettingsDto(settings);

    for (const key of ['id', 'createdAt', 'updatedAt']) {
      expect(dto).not.toHaveProperty(key);
    }
  });

  it('returns null SEO fields when the embedded object is missing', () => {
    const dto = toSettingsDto(
      Object.assign(new SiteSettings(), { ...fields, seo: undefined }),
    );

    expect(dto.seo).toEqual({
      title: null,
      description: null,
      shareImage: null,
    });
  });
});

describe('toMenuDto', () => {
  const menu = (items: MenuItem[] | undefined) =>
    Object.assign(new Menu(), { id: 'menu-1', key: MenuKey.Dropdown, items });

  it('orders items by group (main first), then position, then id', () => {
    const dto = toMenuDto(
      menu([
        item('0003', 'Gamma', MenuItemGroup.List, 1),
        item('0002', 'Beta', MenuItemGroup.Main, 2),
        item('0005', 'Epsilon', MenuItemGroup.Main, 1),
        item('0004', 'Delta', MenuItemGroup.Main, 1),
      ]),
    );

    expect(dto.items.map((i) => i.title)).toEqual([
      'Delta',
      'Epsilon',
      'Beta',
      'Gamma',
    ]);
  });

  it('returns the public item fields only', () => {
    const dto = toMenuDto(menu([item('0001', 'Home', MenuItemGroup.Main, 0)]));

    expect(dto).toEqual({
      key: 'dropdown',
      items: [
        {
          id: '0001',
          title: 'Home',
          link: '/home',
          className: null,
          group: 'main',
        },
      ],
    });
  });

  it('copes with items that were not loaded', () => {
    expect(toMenuDto(menu(undefined)).items).toEqual([]);
  });
});
