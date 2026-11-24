import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { MenuDto } from '../dto/menu.dto';
import { Menu, type MenuKey } from '../entities/menu.entity';
import { toMenuDto } from '../mappers/content.mappers';

@Injectable()
export class MenusService {
  constructor(
    @InjectRepository(Menu) private readonly menus: Repository<Menu>,
  ) {}

  async findByKey(key: MenuKey): Promise<MenuDto> {
    const menu = await this.menus.findOne({
      where: { key },
      relations: { items: true },
    });
    if (!menu) {
      throw new NotFoundException('Menu not found');
    }
    return toMenuDto(menu);
  }
}
