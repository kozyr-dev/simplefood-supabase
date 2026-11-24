import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type FindOptionsWhere, type Repository } from 'typeorm';
import { BlogCategory } from '@/blog/entities/blog-category.entity';
import { ProductCategory } from '@/catalog/entities/product-category.entity';
import { Product } from '@/catalog/entities/product.entity';
import { adminOrder } from '@/common/admin/admin-list';
import { invalidReference } from '@/common/admin/references';
import { paginate, toSkipTake, type Paginated } from '@/common/http/responses';
import { Media } from '@/media/entities/media.entity';
import type {
  AdminPageSectionDto,
  AdminPageSectionsQueryDto,
  CreatePageSectionDto,
  SectionReferencesDto,
  UpdatePageSectionDto,
} from '../dto/admin-content.dto';
import { PageSection } from '../entities/page-section.entity';
import { Page } from '../entities/page.entity';
import { toAdminPageSectionDto } from '../mappers/admin-content.mappers';
import { collectSectionReferences } from '../mappers/page.mappers';
import { prepareSectionData } from './section-writes';

/** A page's sections: their typed data, checked and cleaned on every write. */
@Injectable()
export class AdminPageSectionsService {
  constructor(
    @InjectRepository(PageSection)
    private readonly sections: Repository<PageSection>,
    @InjectRepository(Page) private readonly pages: Repository<Page>,
    @InjectRepository(Media) private readonly media: Repository<Media>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(ProductCategory)
    private readonly productCategories: Repository<ProductCategory>,
    @InjectRepository(BlogCategory)
    private readonly blogCategories: Repository<BlogCategory>,
  ) {}

  async findAll(
    query: AdminPageSectionsQueryDto,
  ): Promise<Paginated<AdminPageSectionDto>> {
    const where: FindOptionsWhere<PageSection> = {};
    if (query.id) where.id = In(query.id);
    if (query.pageId) where.page = { id: query.pageId };
    const [rows, total] = await this.sections.findAndCount({
      where,
      relations: { page: true },
      order: adminOrder(query.sort, query.order),
      ...toSkipTake(query),
    });
    return paginate(
      rows.map((row) => toAdminPageSectionDto(row)),
      total,
      query,
    );
  }

  /** With `references`: the names behind the ids in `data`. */
  async findOne(id: string): Promise<AdminPageSectionDto> {
    const section = await this.findOrFail(id);
    return Object.assign(toAdminPageSectionDto(section), {
      references: await this.references(section),
    });
  }

  /** Added at the end of the page. */
  async create({
    pageId,
    type,
    data,
  }: CreatePageSectionDto): Promise<AdminPageSectionDto> {
    const page = await this.pages.findOneBy({ id: pageId });
    if (!page) throw invalidReference('pageId');
    const { last } = (await this.sections
      .createQueryBuilder('section')
      .select('max(section.position)', 'last')
      .where('section.page_id = :pageId', { pageId })
      .getRawOne<{ last: number | null }>()) ?? { last: null };
    const saved = await this.sections.save(
      this.sections.create({
        page,
        type,
        data: await prepareSectionData(type, data),
        position: last === null ? 0 : last + 1,
      }),
    );
    return this.findOne(saved.id);
  }

  async update(
    id: string,
    { data }: UpdatePageSectionDto,
  ): Promise<AdminPageSectionDto> {
    const section = await this.findOrFail(id);
    section.data = await prepareSectionData(section.type, data);
    await this.sections.save(section);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const { affected } = await this.sections.delete(id);
    if (!affected) throw notFound();
  }

  /** One query per kind of row, only for the kinds the section uses. */
  private async references(
    section: PageSection,
  ): Promise<SectionReferencesDto> {
    const refs = collectSectionReferences([section]);
    const ids = (set: Set<string>) => ({ id: In([...set]) });
    const [media, products, productCategories, blogCategories] =
      await Promise.all([
        refs.mediaIds.size ? this.media.findBy(ids(refs.mediaIds)) : [],
        refs.productIds.size ? this.products.findBy(ids(refs.productIds)) : [],
        refs.productCategoryIds.size
          ? this.productCategories.findBy(ids(refs.productCategoryIds))
          : [],
        refs.blogCategoryIds.size
          ? this.blogCategories.findBy(ids(refs.blogCategoryIds))
          : [],
      ]);
    return {
      media: media.map((m) => ({
        id: m.id,
        label: m.name,
        thumbnailUrl: (m.formats?.thumbnail ?? m.formats?.small)?.url ?? m.url,
      })),
      products: products.map((p) => ({ id: p.id, label: p.title })),
      productCategories: productCategories.map((c) => ({
        id: c.id,
        label: c.name,
      })),
      blogCategories: blogCategories.map((c) => ({ id: c.id, label: c.name })),
    };
  }

  private async findOrFail(id: string): Promise<PageSection> {
    const section = await this.sections.findOne({
      where: { id },
      relations: { page: true },
    });
    if (!section) throw notFound();
    return section;
  }
}

function notFound(): NotFoundException {
  return new NotFoundException('Section not found');
}
