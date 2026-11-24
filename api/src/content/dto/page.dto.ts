import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { SeoDto } from '@/common/seo/seo.dto';
import { SECTION_DTOS, type PageSectionDto } from './page-sections.dto';

const sectionDtos = Object.values(SECTION_DTOS);

/** A published page with its sections fully resolved. */
@ApiExtraModels(...sectionDtos)
export class PageDto {
  /** @example "01a1559c-a1ed-7641-ac0e-64612b99bb5a" */
  id: string;

  /** @example "about-us" */
  slug: string;

  /** @example "About us" */
  title: string;

  seo: SeoDto;

  // A polymorphic array, documented by hand (the Nest docs' pattern). The
  // discriminator lets generated clients narrow a section by its `type`.
  @ApiProperty({
    description: 'In display order. Each item is one of the section types.',
    type: 'array',
    items: {
      oneOf: sectionDtos.map((dto) => ({ $ref: getSchemaPath(dto) })),
      discriminator: {
        propertyName: 'type',
        mapping: Object.fromEntries(
          Object.entries(SECTION_DTOS).map(([type, dto]) => [
            type,
            getSchemaPath(dto),
          ]),
        ),
      },
    },
  })
  sections: PageSectionDto[];
}
