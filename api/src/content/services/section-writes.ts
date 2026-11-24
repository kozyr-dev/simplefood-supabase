import { BadRequestException } from '@nestjs/common';
import { sanitizeEmbed, sanitizeRichHtml } from '@/common/html/sanitize';
import { SectionType } from '../entities/page-section.entity';
import {
  InvalidSectionDataError,
  validateSectionData,
  type SectionData,
} from '../entities/section-data';

/** Fields the site shows as HTML (`dangerouslySetInnerHTML`): cleaned on save. */
export const RICH_HTML_FIELDS: Partial<Record<SectionType, readonly string[]>> =
  {
    [SectionType.ImageBanner]: ['text'],
    [SectionType.Video]: ['description'],
    [SectionType.Content]: ['content'],
    [SectionType.Contact]: ['content', 'secondaryContent'],
  };

/** Embed codes: one iframe from an allowed player or map, nothing else. */
export const EMBED_FIELDS: Partial<Record<SectionType, readonly string[]>> = {
  [SectionType.Content]: ['embedCode'],
  [SectionType.Contact]: ['mapEmbedCode'],
};

/**
 * Section data as the admin sends it -> what is stored:
 * - `null`, `""` and empty objects are dropped (a missing field and an
 *   empty one mean the same: the forms send both);
 * - checked against the type (validateSectionData): a 400 whose `details`
 *   name fields under `data.` (`data.items.0.title`), as the form has them;
 * - HTML fields cleaned, embed codes reduced to an allowed iframe (a 400 if
 *   none is left).
 */
export async function prepareSectionData(
  type: SectionType,
  data: Record<string, unknown>,
): Promise<SectionData> {
  const compact = withoutEmpty(data) as Record<string, unknown>;
  try {
    await validateSectionData(type, compact);
  } catch (error) {
    if (error instanceof InvalidSectionDataError) {
      throw new BadRequestException({
        message: 'Validation failed',
        details: error.details.map(({ field, messages }) => ({
          field: `data.${field}`,
          messages,
        })),
      });
    }
    throw error;
  }

  for (const field of RICH_HTML_FIELDS[type] ?? []) {
    const value = compact[field];
    if (typeof value === 'string') {
      const clean = sanitizeRichHtml(value);
      if (clean) compact[field] = clean;
      else delete compact[field];
    }
  }
  for (const field of EMBED_FIELDS[type] ?? []) {
    const value = compact[field];
    if (typeof value !== 'string') continue;
    const clean = sanitizeEmbed(value);
    if (!clean) {
      throw new BadRequestException({
        message: 'Validation failed',
        details: [
          {
            field: `data.${field}`,
            messages: [
              `data.${field} must be an iframe (https) from Google Maps, YouTube or Vimeo`,
            ],
          },
        ],
      });
    }
    compact[field] = clean;
  }
  // Stored as the plain object that was checked (validateSectionData would
  // return class instances).
  return compact as unknown as SectionData;
}

/** Drops `null`, `""` (after trimming), empty objects; recursive. Arrays keep their items. */
export function withoutEmpty(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => withoutEmpty(item));
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === '__proto__') continue;
    const clean = withoutEmpty(item);
    if (clean === null || clean === undefined) continue;
    if (typeof clean === 'string' && !clean.trim()) continue;
    if (
      typeof clean === 'object' &&
      !Array.isArray(clean) &&
      !Object.keys(clean).length
    ) {
      continue;
    }
    result[key] = typeof clean === 'string' ? clean.trim() : clean;
  }
  return result;
}
