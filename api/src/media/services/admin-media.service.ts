import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type FindOptionsWhere, type Repository } from 'typeorm';
import { adminOrder, contains } from '@/common/admin/admin-list';
import { paginate, toSkipTake, type Paginated } from '@/common/http/responses';
import type { AdminMediaDto, AdminMediaQueryDto } from '../dto/admin-media.dto';
import { Media } from '../entities/media.entity';
import { toAdminMediaDto } from '../mappers/media.mapper';

/** Reads for the admin's image library. */
@Injectable()
export class AdminMediaService {
  constructor(
    @InjectRepository(Media) private readonly media: Repository<Media>,
  ) {}

  async findAll(query: AdminMediaQueryDto): Promise<Paginated<AdminMediaDto>> {
    const where: FindOptionsWhere<Media> = {};
    if (query.id) where.id = In(query.id);
    if (query.q) where.name = contains(query.q);
    if (query.folder) where.folder = query.folder;
    const [rows, total] = await this.media.findAndCount({
      where,
      order: adminOrder(query.sort, query.order),
      ...toSkipTake(query),
    });
    return paginate(rows.map(toAdminMediaDto), total, query);
  }

  async findOne(id: string): Promise<AdminMediaDto> {
    const media = await this.media.findOneBy({ id });
    if (!media) throw new NotFoundException('Image not found');
    return toAdminMediaDto(media);
  }
}
