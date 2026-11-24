import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '@/database/entities/base.entity';
import { Menu } from './menu.entity';

/**
 * Which list of a menu an item belongs to. Most menus only use `main`; the
 * dropdown also has a secondary `list` (Strapi's `menuListItem`).
 */
export enum MenuItemGroup {
  Main = 'main',
  List = 'list',
}

@Entity()
export class MenuItem extends AppBaseEntity {
  /** Items always belong to a menu and are deleted with it. */
  @Index('IDX_menu_item_menu')
  @ManyToOne(() => Menu, (menu) => menu.items, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  menu: Menu;

  @Column({ type: 'varchar', length: 100 })
  title: string;

  /** Not validated as a URL: the data has `#` and relative paths. */
  @Column({ type: 'varchar', length: 500 })
  link: string;

  /** Optional CSS class for the frontend (e.g. an icon). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  className: string | null;

  // Column `item_group`, not `group`: GROUP is a reserved SQL word, so every
  // hand-written query (e.g. the Strapi data migration) would have to quote it.
  @Column({
    name: 'item_group',
    type: 'enum',
    enum: MenuItemGroup,
    enumName: 'menu_item_group',
    default: MenuItemGroup.Main,
  })
  group: MenuItemGroup;

  /** Display order within its group: lower first. */
  @Column({ type: 'integer', default: 0 })
  position: number;
}
