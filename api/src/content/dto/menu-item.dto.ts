import { MenuItemGroup } from '../entities/menu-item.entity';

export class MenuItemDto {
  /** @example "01a1559c-a1ed-7641-ac0e-64612b99bb5a" */
  id: string;

  /** @example "Delivery" */
  title: string;

  /**
   * A path, full URL or `#`.
   * @example "/shipping"
   */
  link: string;

  /** Optional CSS class, e.g. for an icon. */
  className: string | null;

  /** `main` for most items; the dropdown menu also has a secondary `list`. */
  group: MenuItemGroup;
}
