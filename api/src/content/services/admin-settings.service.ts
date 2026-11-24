import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { applySeoInput } from '@/common/seo/admin-seo';
import { Media } from '@/media/entities/media.entity';
import type {
  AdminSettingsDto,
  UpdateSettingsDto,
} from '../dto/admin-content.dto';
import {
  SITE_SETTINGS_ID,
  SiteSettings,
} from '../entities/site-settings.entity';
import { toAdminSettingsDto } from '../mappers/admin-content.mappers';

const RELATIONS = { seo: { shareImage: true } } as const;

/** The one settings record: read it, change it (created by the first save). */
@Injectable()
export class AdminSettingsService {
  constructor(
    @InjectRepository(SiteSettings)
    private readonly settings: Repository<SiteSettings>,
    @InjectRepository(Media) private readonly media: Repository<Media>,
  ) {}

  async get(): Promise<AdminSettingsDto> {
    return toAdminSettingsDto(await this.find());
  }

  async update(dto: UpdateSettingsDto): Promise<AdminSettingsDto> {
    const { seo, ...fields } = dto;
    const settings =
      (await this.find()) ??
      this.settings.create({
        id: SITE_SETTINGS_ID,
        seo: { title: null, description: null, shareImage: null },
      });
    Object.assign(settings, emptyToNull(fields));
    // The first save creates the record, which needs a name.
    if (!settings.siteName) {
      throw new BadRequestException({
        message: 'Validation failed',
        details: [{ field: 'siteName', messages: ['siteName is required'] }],
      });
    }
    await applySeoInput(settings.seo, seo, this.media);
    await this.settings.save(settings);
    return this.get();
  }

  private find(): Promise<SiteSettings | null> {
    return this.settings.findOne({
      where: { id: SITE_SETTINGS_ID },
      relations: RELATIONS,
    });
  }
}

/** Optional texts: blank means none. */
function emptyToNull<T extends object>(fields: T): T {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      typeof value === 'string' && !value.trim() ? null : value,
    ]),
  ) as T;
}
