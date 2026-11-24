import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { SettingsDto } from '../dto/settings.dto';
import {
  SITE_SETTINGS_ID,
  SiteSettings,
} from '../entities/site-settings.entity';
import { toSettingsDto } from '../mappers/content.mappers';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(SiteSettings)
    private readonly settings: Repository<SiteSettings>,
  ) {}

  /**
   * 404 until the settings row exists (seed or data migration). Deliberately
   * no built-in fallback: a missing seed should be noticed, not hidden behind
   * placeholder text.
   */
  async get(): Promise<SettingsDto> {
    const settings = await this.settings.findOne({
      where: { id: SITE_SETTINGS_ID },
      relations: { seo: { shareImage: true } },
    });
    if (!settings) {
      throw new NotFoundException('Site settings not found');
    }
    return toSettingsDto(settings);
  }
}
