import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  In,
  type FindOptionsWhere,
  type Repository,
} from 'typeorm';
import {
  adminOrder,
  contains,
  uniqueViolation,
} from '@/common/admin/admin-list';
import { paginate, toSkipTake, type Paginated } from '@/common/http/responses';
import { applySeoInput } from '@/common/seo/admin-seo';
import { inPublishState } from '@/database/published';
import { Media } from '@/media/entities/media.entity';
import type {
  AdminPageDto,
  AdminPageSectionDto,
  AdminPagesQueryDto,
  CreatePageDto,
  ReorderDto,
  UpdatePageDto,
} from '../dto/admin-content.dto';
import { PageSection } from '../entities/page-section.entity';
import { HOME_PAGE_SLUG, Page } from '../entities/page.entity';
import {
  toAdminPageDto,
  toAdminPageSectionDto,
} from '../mappers/admin-content.mappers';
import { applyOrder } from './ordering';

const RELATIONS = { seo: { shareImage: true } } as const;
const UNIQUE = { UQ_page_slug: { field: 'slug', code: 'SLUG_TAKEN' } };

/** Pages, drafts included. The homepage (`home`) can't be renamed or deleted. */
@Injectable()
export class AdminPagesService {
  constructor(
    @InjectRepository(Page) private readonly pages: Repository<Page>,
    @InjectRepository(PageSection)
    private readonly sections: Repository<PageSection>,
    @InjectRepository(Media) private readonly media: Repository<Media>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async findAll(query: AdminPagesQueryDto): Promise<Paginated<AdminPageDto>> {
    const where: FindOptionsWhere<Page>[] = [];
    const base: FindOptionsWhere<Page> = {};
    if (query.id) base.id = In(query.id);
    if (query.state) base.publishedAt = inPublishState(query.state);
    // `q` matches the title or the slug.
    if (query.q) {
      where.push(
        { ...base, title: contains(query.q) },
        { ...base, slug: contains(query.q) },
      );
    } else {
      where.push(base);
    }
    const [rows, total] = await this.pages.findAndCount({
      where,
      relations: RELATIONS,
      order: adminOrder(query.sort, query.order),
      ...toSkipTake(query),
    });
    const counts = await this.sectionCounts(rows.map((page) => page.id));
    return paginate(
      rows.map((page) => toAdminPageDto(page, counts.get(page.id) ?? 0)),
      total,
      query,
    );
  }

  async findOne(id: string): Promise<AdminPageDto> {
    const page = await this.findOrFail(id);
    const counts = await this.sectionCounts([id]);
    return toAdminPageDto(page, counts.get(id) ?? 0);
  }

  async create(dto: CreatePageDto): Promise<AdminPageDto> {
    const page = this.pages.create({
      publishedAt: null,
      seo: { title: null, description: null, shareImage: null },
    });
    await this.apply(page, dto);
    return this.save(page);
  }

  async update(id: string, dto: UpdatePageDto): Promise<AdminPageDto> {
    const page = await this.findOrFail(id);
    if (
      page.slug === HOME_PAGE_SLUG &&
      dto.slug !== undefined &&
      dto.slug !== HOME_PAGE_SLUG
    ) {
      throw new BadRequestException({
        message: 'The homepage keeps the slug "home"',
        code: 'HOME_PAGE',
        details: [
          { field: 'slug', messages: ['the homepage keeps the slug "home"'] },
        ],
      });
    }
    await this.apply(page, dto);
    return this.save(page);
  }

  /** Its sections go with it. The homepage can't be deleted (409 `HOME_PAGE`). */
  async remove(id: string): Promise<void> {
    const page = await this.findOrFail(id);
    if (page.slug === HOME_PAGE_SLUG) {
      throw new ConflictException({
        message: "The homepage can't be deleted",
        code: 'HOME_PAGE',
      });
    }
    await this.pages.delete(id);
  }

  /** Puts the page's sections in the order given (every section, once). */
  async reorderSections(
    id: string,
    { ids }: ReorderDto,
  ): Promise<AdminPageSectionDto[]> {
    await this.findOrFail(id);
    await this.dataSource.transaction((manager) =>
      applyOrder(manager.getRepository(PageSection), ids, { page: { id } }),
    );
    const sections = await this.sections.find({
      where: { page: { id } },
      order: { position: 'ASC', id: 'ASC' },
    });
    return sections.map((section) => toAdminPageSectionDto(section, id));
  }

  private async apply(page: Page, dto: UpdatePageDto): Promise<void> {
    const { seo, publishedAt, ...fields } = dto;
    Object.assign(page, fields);
    if (publishedAt !== undefined) {
      page.publishedAt = publishedAt === null ? null : new Date(publishedAt);
    }
    await applySeoInput(page.seo, seo, this.media);
  }

  private async save(page: Page): Promise<AdminPageDto> {
    try {
      const saved = await this.pages.save(page);
      return this.findOne(saved.id);
    } catch (error) {
      throw uniqueViolation(error, UNIQUE) ?? error;
    }
  }

  private async sectionCounts(pageIds: string[]): Promise<Map<string, number>> {
    if (!pageIds.length) return new Map();
    const rows = await this.sections
      .createQueryBuilder('section')
      .select('section.page_id', 'pageId')
      .addSelect('count(*)::int', 'count')
      .where('section.page_id IN (:...pageIds)', { pageIds })
      .groupBy('section.page_id')
      .getRawMany<{ pageId: string; count: number }>();
    return new Map(rows.map((row) => [row.pageId, row.count]));
  }

  private async findOrFail(id: string): Promise<Page> {
    const page = await this.pages.findOne({
      where: { id },
      relations: RELATIONS,
    });
    if (!page) throw new NotFoundException('Page not found');
    return page;
  }
}
