import { Controller, Get, INestApplication, Query } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { Public } from '@/auth/decorators/public.decorator';
import { ApiPaginatedResponse } from '@/common/http/api-responses.decorator';
import { PaginationQueryDto } from '@/common/http/pagination-query.dto';
import { paginate, toSkipTake } from '@/common/http/responses';
import { MediaDto } from '@/media/dto/media.dto';
import { Media } from '@/media/entities/media.entity';
import { MediaModule } from '@/media/media.module';
import { toMediaDto } from '@/media/mappers/media.mapper';
import { resetDatabase } from './utils/database';
import { createMedia } from './utils/factories';
import { createTestApp } from './utils/test-app';

/**
 * Test-only list endpoint built exactly the way real ones will be (query DTO,
 * findAndCount + toSkipTake, paginate, mapper, Swagger decorator), so the
 * whole pagination pattern is tested end to end before the first feature.
 */
@Public()
@Controller('pagination-test')
class PaginationTestController {
  constructor(
    @InjectRepository(Media) private readonly media: Repository<Media>,
  ) {}

  @Get()
  @ApiPaginatedResponse(MediaDto)
  async findAll(@Query() query: PaginationQueryDto) {
    const [items, total] = await this.media.findAndCount({
      order: { id: 'ASC' }, // UUIDv7: creation order
      ...toSkipTake(query),
    });
    return paginate(items.map(toMediaDto), total, query);
  }
}

describe('Pagination (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp({
      controllers: [PaginationTestController],
      imports: [MediaModule], // provides the Media repository
    });
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  const list = (query = '') =>
    request(app.getHttpServer()).get(`/api/pagination-test${query}`);

  const seed = async (count: number) => {
    const created = [];
    for (let i = 0; i < count; i++) created.push(await createMedia(dataSource));
    return created;
  };

  it('returns an empty page when there is nothing', async () => {
    const res = await list().expect(200);

    expect(res.body).toEqual({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0, pageCount: 0 },
    });
  });

  it('defaults to page 1 with 20 items', async () => {
    await seed(25);

    const res = await list().expect(200);

    expect(res.body.data).toHaveLength(20);
    expect(res.body.meta).toEqual({
      page: 1,
      pageSize: 20,
      total: 25,
      pageCount: 2,
    });
  });

  it('returns the requested page, in a stable order', async () => {
    const created = await seed(7);

    const res = await list('?page=2&pageSize=3').expect(200);

    expect(res.body.data.map((item: MediaDto) => item.id)).toEqual(
      created.slice(3, 6).map((media) => media.id),
    );
    expect(res.body.meta).toEqual({
      page: 2,
      pageSize: 3,
      total: 7,
      pageCount: 3,
    });
  });

  it('maps items to the public DTO (no internal columns)', async () => {
    await seed(1);

    const [item] = (await list().expect(200)).body.data;

    expect(Object.keys(item).sort()).toEqual(
      ['alt', 'formats', 'height', 'id', 'url', 'width'].sort(),
    );
  });

  it.each(['?page=0', '?pageSize=101', '?pageSize=abc', '?page=1.5'])(
    'rejects %s with a 400 in the error shape',
    async (query) => {
      const res = await list(query).expect(400);

      expect(res.body.error).toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Validation failed',
      });
    },
  );

  it('documents the { data, meta } envelope in Swagger', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const schema = document.paths['/api/pagination-test'].get?.responses[
      '200'
    ] as { content: Record<string, { schema: unknown }> };

    expect(schema.content['application/json'].schema).toEqual({
      type: 'object',
      required: ['data', 'meta'],
      properties: {
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/MediaDto' },
        },
        meta: { $ref: '#/components/schemas/PaginationMetaDto' },
      },
    });
    expect(document.components?.schemas).toHaveProperty('PaginationMetaDto');
    expect(document.components?.schemas).toHaveProperty('MediaDto');
  });
});
