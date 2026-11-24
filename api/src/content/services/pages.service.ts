import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { PageDto } from '../dto/page.dto';
import { Page } from '../entities/page.entity';
import { collectSectionReferences, toPageDto } from '../mappers/page.mappers';
import { isPublishedNow } from '@/database/published';
import { SectionReferencesService } from './section-references.service';

@Injectable()
export class PagesService {
  constructor(
    @InjectRepository(Page) private readonly pages: Repository<Page>,
    private readonly references: SectionReferencesService,
  ) {}

  async findBySlug(slug: string): Promise<PageDto> {
    const page = await this.pages.findOne({
      where: { slug, publishedAt: isPublishedNow() },
      relations: { sections: true, seo: { shareImage: true } },
    });
    // Same 404 for unknown, draft and scheduled: don't reveal unpublished slugs.
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const lookups = await this.references.load(
      collectSectionReferences(page.sections),
    );
    return toPageDto(page, lookups);
  }
}
