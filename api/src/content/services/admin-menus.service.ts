import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  In,
  type FindOptionsWhere,
  type Repository,
} from 'typeorm';
import { adminOrder, contains } from '@/common/admin/admin-list';
import { invalidReference } from '@/common/admin/references';
import { paginate, toSkipTake, type Paginated } from '@/common/http/responses';
import type {
  AdminMenuDto,
  AdminMenuItemDto,
  AdminMenuItemsQueryDto,
  CreateMenuItemDto,
  ReorderMenuItemsDto,
  UpdateMenuItemDto,
} from '../dto/admin-content.dto';
import { MenuItem, MenuItemGroup } from '../entities/menu-item.entity';
import { Menu, MenuKey } from '../entities/menu.entity';
import { toAdminMenuItemDto } from '../mappers/admin-content.mappers';
import { applyOrder } from './ordering';

/** The three menus (fixed) and their items. */
@Injectable()
export class AdminMenusService {
  constructor(
    @InjectRepository(Menu) private readonly menus: Repository<Menu>,
    @InjectRepository(MenuItem) private readonly items: Repository<MenuItem>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** The menus (header, footer, dropdown: created by the import or seed). */
  async findAllMenus(): Promise<AdminMenuDto[]> {
    const counts = await this.items
      .createQueryBuilder('item')
      .select('item.menu_id', 'menuId')
      .addSelect('count(*)::int', 'count')
      .groupBy('item.menu_id')
      .getRawMany<{ menuId: string; count: number }>();
    const order = Object.values(MenuKey);
    return (await this.menus.find())
      .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
      .map((menu) => ({
        id: menu.id,
        key: menu.key,
        itemCount: counts.find((row) => row.menuId === menu.id)?.count ?? 0,
      }));
  }

  async findMenu(id: string): Promise<AdminMenuDto> {
    const menu = (await this.findAllMenus()).find((m) => m.id === id);
    if (!menu) throw new NotFoundException('Menu not found');
    return menu;
  }

  async findItems(
    query: AdminMenuItemsQueryDto,
  ): Promise<Paginated<AdminMenuItemDto>> {
    const where: FindOptionsWhere<MenuItem> = {};
    if (query.id) where.id = In(query.id);
    if (query.q) where.title = contains(query.q);
    if (query.menuId) where.menu = { id: query.menuId };
    if (query.group) where.group = query.group;
    const [rows, total] = await this.items.findAndCount({
      where,
      relations: { menu: true },
      order: adminOrder(query.sort, query.order),
      ...toSkipTake(query),
    });
    return paginate(
      rows.map((row) => toAdminMenuItemDto(row)),
      total,
      query,
    );
  }

  async findItem(id: string): Promise<AdminMenuItemDto> {
    return toAdminMenuItemDto(await this.findItemOrFail(id));
  }

  /** Added at the end of its group. */
  async createItem({
    menuId,
    ...fields
  }: CreateMenuItemDto): Promise<AdminMenuItemDto> {
    const menu = await this.menus.findOneBy({ id: menuId });
    if (!menu) throw invalidReference('menuId');
    const group = fields.group ?? MenuItemGroup.Main;
    const { last } = (await this.items
      .createQueryBuilder('item')
      .select('max(item.position)', 'last')
      .where('item.menu_id = :menuId AND item.item_group = :group', {
        menuId,
        group,
      })
      .getRawOne<{ last: number | null }>()) ?? { last: null };
    const item = await this.items.save(
      this.items.create({
        className: null,
        ...fields,
        group,
        menu,
        position: last === null ? 0 : last + 1,
      }),
    );
    return toAdminMenuItemDto(item, menuId);
  }

  async updateItem(
    id: string,
    dto: UpdateMenuItemDto,
  ): Promise<AdminMenuItemDto> {
    const item = await this.findItemOrFail(id);
    return toAdminMenuItemDto(await this.items.save(Object.assign(item, dto)));
  }

  async removeItem(id: string): Promise<void> {
    const { affected } = await this.items.delete(id);
    if (!affected) throw new NotFoundException('Menu item not found');
  }

  /** Puts one group of a menu in the order given (every item, once). */
  async reorder(
    menuId: string,
    { group, ids }: ReorderMenuItemsDto,
  ): Promise<AdminMenuItemDto[]> {
    await this.findMenu(menuId);
    await this.dataSource.transaction((manager) =>
      applyOrder(manager.getRepository(MenuItem), ids, {
        menu: { id: menuId },
        group,
      }),
    );
    const items = await this.items.find({
      where: { menu: { id: menuId }, group },
      order: { position: 'ASC', id: 'ASC' },
    });
    return items.map((item) => toAdminMenuItemDto(item, menuId));
  }

  private async findItemOrFail(id: string): Promise<MenuItem> {
    const item = await this.items.findOne({
      where: { id },
      relations: { menu: true },
    });
    if (!item) throw new NotFoundException('Menu item not found');
    return item;
  }
}
