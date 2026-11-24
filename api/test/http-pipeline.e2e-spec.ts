import {
  Body,
  Controller,
  Get,
  INestApplication,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import request from 'supertest';
import { App } from 'supertest/types';
import { Public } from '@/auth/decorators/public.decorator';
import { createTestApp } from './utils/test-app';

/*
 * Test-only controller: exercises the global pipeline (security headers,
 * TrimPipe, ValidationPipe, AllExceptionsFilter) the same way real endpoints
 * will. It's registered only in this testing module and never ships.
 */
class ItemDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

class PipelineTestDto {
  @IsEmail()
  email: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @ValidateNested({ each: true })
  @Type(() => ItemDto)
  items: ItemDto[];

  @IsOptional()
  @IsString()
  password?: string;
}

@Public()
@Controller('pipeline-test')
class PipelineTestController {
  @Post()
  create(@Body() dto: PipelineTestDto) {
    return { isDto: dto instanceof PipelineTestDto, dto };
  }

  // Declared before ':id' so "crash" isn't taken for an id.
  @Get('crash')
  crash(): never {
    throw new Error('connection failed: password=secret123 at /srv/app/db.ts');
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return { id };
  }
}

/** Test-only: the client address Express resolved (`req.ip`). */
@Public()
@Controller('client-ip')
class ClientIpController {
  @Get()
  ip(@Req() req: { ip?: string }) {
    return { ip: req.ip };
  }
}

/** The app with TRUST_PROXY_HOPS forced to `hops`; all other config is real. */
function createAppWithProxyHops(hops: number) {
  return createTestApp({
    controllers: [ClientIpController],
    beforeConfigure: (app) => {
      const config = app.get(ConfigService);
      const realGetOrThrow = config.getOrThrow.bind(config);
      jest
        .spyOn(config, 'getOrThrow')
        .mockImplementation((key: string) =>
          key === 'TRUST_PROXY_HOPS' ? hops : realGetOrThrow(key),
        );
    },
  });
}

const validBody = {
  email: 'ivan@example.com',
  quantity: 2,
  items: [{ name: 'Borscht' }],
};

describe('HTTP pipeline (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Logs are `silent` under NODE_ENV=test, which keeps the expected 500
    // stack trace (and all request lines) out of the test output.
    app = await createTestApp({ controllers: [PipelineTestController] });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe('security headers', () => {
    it('are set and X-Powered-By is removed', async () => {
      const res = await http().get('/api/ping').expect(200);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('are also set on error responses', async () => {
      const res = await http().get('/api/does-not-exist').expect(404);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('CORS', () => {
    it('allows a configured origin', async () => {
      const res = await http()
        .get('/api/ping')
        .set('Origin', 'http://localhost:3000');

      expect(res.headers['access-control-allow-origin']).toBe(
        'http://localhost:3000',
      );
    });

    it('does not allow other origins (and never a wildcard)', async () => {
      const res = await http()
        .get('/api/ping')
        .set('Origin', 'https://evil.example');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('validation', () => {
    it('accepts a valid body and turns it into a DTO instance', async () => {
      const res = await http()
        .post('/api/pipeline-test')
        .send(validBody)
        .expect(201);

      expect(res.body).toEqual({ isDto: true, dto: validBody });
    });

    it('trims strings before validating, but never passwords', async () => {
      const res = await http()
        .post('/api/pipeline-test')
        .send({
          ...validBody,
          email: '  ivan@example.com ',
          password: ' with spaces ',
        })
        .expect(201);

      expect(res.body.dto.email).toBe('ivan@example.com');
      expect(res.body.dto.password).toBe(' with spaces ');
    });

    it('rejects unknown properties (mass assignment)', async () => {
      const res = await http()
        .post('/api/pipeline-test')
        .send({ ...validBody, role: 'admin' })
        .expect(400);

      expect(res.body).toEqual({
        error: {
          status: 400,
          code: 'BAD_REQUEST',
          requestId: expect.any(String),
          message: 'Validation failed',
          details: [
            { field: 'role', messages: ['property role should not exist'] },
          ],
        },
      });
    });

    it('reports every invalid field', async () => {
      const res = await http()
        .post('/api/pipeline-test')
        .send({ ...validBody, email: 'not-an-email', quantity: 0 })
        .expect(400);

      expect(res.body.error.details).toEqual([
        { field: 'email', messages: ['email must be an email'] },
        { field: 'quantity', messages: ['quantity must not be less than 1'] },
      ]);
    });

    it('does not coerce types implicitly', async () => {
      const res = await http()
        .post('/api/pipeline-test')
        .send({ ...validBody, quantity: '5' })
        .expect(400);

      expect(res.body.error.details[0].field).toBe('quantity');
    });

    it('uses dotted paths for nested array items', async () => {
      const res = await http()
        .post('/api/pipeline-test')
        .send({ ...validBody, items: [{ name: 'ok' }, { name: '   ' }] })
        .expect(400);

      expect(res.body.error.details).toEqual([
        { field: 'items.1.name', messages: ['name should not be empty'] },
      ]);
    });

    it('caps the number of reported fields', async () => {
      const items = Array.from({ length: 150 }, () => ({ name: '' }));

      const res = await http()
        .post('/api/pipeline-test')
        .send({ ...validBody, items })
        .expect(400);

      expect(res.body.error.details).toHaveLength(100);
      expect(res.body.error.truncated).toBe(true);
    });

    it('rejects an invalid UUID route param', async () => {
      const res = await http().get('/api/pipeline-test/not-a-uuid').expect(400);

      expect(res.body.error).toMatchObject({
        status: 400,
        code: 'BAD_REQUEST',
      });
    });

    it('accepts a valid UUID route param', async () => {
      const id = '01a1559c-a1ed-7641-ac0e-64612b99bb5a';

      await http().get(`/api/pipeline-test/${id}`).expect(200, { id });
    });
  });

  describe('errors', () => {
    it('returns 404 for unknown routes in the error shape', async () => {
      const res = await http().get('/api/does-not-exist').expect(404);

      expect(res.body).toEqual({
        error: {
          status: 404,
          code: 'NOT_FOUND',
          requestId: expect.any(String),
          message: 'Cannot GET /api/does-not-exist',
        },
      });
    });

    it('hides the details of unexpected errors', async () => {
      const res = await http().get('/api/pipeline-test/crash').expect(500);

      expect(res.body).toEqual({
        error: {
          status: 500,
          code: 'INTERNAL_SERVER_ERROR',
          requestId: expect.any(String),
          message: 'Internal server error',
        },
      });
      expect(JSON.stringify(res.body)).not.toContain('secret123');
    });

    it('returns 400 in the error shape for malformed JSON', async () => {
      const res = await http()
        .post('/api/pipeline-test')
        .set('Content-Type', 'application/json')
        .send('{"email":')
        .expect(400);

      // Nest's Express adapter turns the parser's SyntaxError into a
      // BadRequestException; its message describes the client's own input.
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body).toEqual({
        error: {
          status: 400,
          code: 'BAD_REQUEST',
          requestId: expect.any(String),
          message: expect.any(String),
        },
      });
    });

    it('returns 413 in the error shape for a too-large body', async () => {
      // Express's default JSON body limit is 100kb.
      const res = await http()
        .post('/api/pipeline-test')
        .send({ ...validBody, padding: 'x'.repeat(200 * 1024) })
        .expect(413);

      expect(res.body).toEqual({
        error: {
          status: 413,
          code: 'PAYLOAD_TOO_LARGE',
          requestId: expect.any(String),
          message: 'Request body too large',
        },
      });
    });

    it("returns 415 in the error shape, without the parser's wording, for an unsupported charset", async () => {
      const res = await http()
        .post('/api/pipeline-test')
        // The JSON parser takes only UTF charsets.
        .set('Content-Type', 'application/json; charset=latin1')
        .send(JSON.stringify(validBody))
        .expect(415);

      expect(res.body).toEqual({
        error: {
          status: 415,
          code: 'UNSUPPORTED_MEDIA_TYPE',
          requestId: expect.any(String),
          message: 'Invalid request body',
        },
      });
    });
  });
});

describe('Client IP behind reverse proxies (e2e)', () => {
  // supertest connects over loopback; nginx would append the real client.
  const FORWARDED = '203.0.113.7, 198.51.100.2';

  it('ignores X-Forwarded-For by default: anyone could forge it', async () => {
    const app = await createTestApp({ controllers: [ClientIpController] });
    try {
      const res = await request(app.getHttpServer())
        .get('/api/client-ip')
        .set('X-Forwarded-For', FORWARDED)
        .expect(200);

      expect(res.body.ip).not.toMatch(/203\.0\.113\.7|198\.51\.100\.2/);
    } finally {
      await app.close();
    }
  });

  it.each([
    [1, '198.51.100.2'],
    [2, '203.0.113.7'],
  ])(
    'with TRUST_PROXY_HOPS=%i, reads the client that many hops back',
    async (hops, expected) => {
      const app = await createAppWithProxyHops(hops);
      try {
        const res = await request(app.getHttpServer())
          .get('/api/client-ip')
          .set('X-Forwarded-For', FORWARDED)
          .expect(200);

        expect(res.body.ip).toBe(expected);
      } finally {
        await app.close();
      }
    },
  );
});
