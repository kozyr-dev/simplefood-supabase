import { Column, Entity, OneToMany, Unique } from 'typeorm';
import { AppBaseEntity } from '@/database/entities/base.entity';
import { MenuItem } from './menu-item.entity';

/** The site's navigation menus; one row each. */
export enum MenuKey {
  Header = 'header',
  Footer = 'footer',
  Dropdown = 'dropdown',
}

@Entity()
@Unique('UQ_menu_key', ['key'])
export class Menu extends AppBaseEntity {
  @Column({ type: 'enum', enum: MenuKey, enumName: 'menu_key' })
  key: MenuKey;

  @OneToMany(() => MenuItem, (item) => item.menu)
  items: MenuItem[];
}
