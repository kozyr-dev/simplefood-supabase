import { MenuKey } from '../entities/menu.entity';
import { MenuItemDto } from './menu-item.dto';

export class MenuDto {
  key: MenuKey;

  /** Ordered by group (`main` first), then position. */
  items: MenuItemDto[];
}
