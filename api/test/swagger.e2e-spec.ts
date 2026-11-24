import { INestApplication, type Type } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import {
  DiscoveryModule,
  DiscoveryService,
  MetadataScanner,
  Reflector,
} from '@nestjs/core';
import type { OpenAPIObject, OperationObject } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import { IsOptionalAuth } from '@/auth/decorators/optional-auth.decorator';
import { IsPublic } from '@/auth/decorators/public.decorator';
import { RequiredRoles } from '@/auth/decorators/roles.decorator';
import { AuthThrottlerGuard } from '@/auth/guards/auth-throttler.guard';
import { readApiVersion } from '@/config/swagger.config';
import { createTestApp } from './utils/test-app';

/**
 * Builds the app with SWAGGER_ENABLED forced on or off, so these tests don't
 * depend on whatever `.env` (or the CI environment) sets. Every other config
 * value is the real one.
 */
function createApp(swaggerEnabled: boolean): Promise<INestApplication<App>> {
  return createTestApp({
    imports: [DiscoveryModule],
    beforeConfigure: (app) => {
      const config = app.get(ConfigService);
      const realGet = config.get.bind(config);
      jest
        .spyOn(config, 'get')
        .mockImplementation((key: string) =>
          key === 'SWAGGER_ENABLED' ? swaggerEnabled : realGet(key),
        );
    },
  });
}

interface Route {
  /** As operationIdFactory names it: `Auth_login`. */
  operationId: string;
  isPublic: boolean;
  /** `@OptionalAuth()`: a guest or a valid token. */
  optionalAuth: boolean;
  rateLimited: boolean;
  /** `@Roles(...)`: other logged-in users get a 403. */
  roles: string[] | undefined;
}

/**
 * Every route handler in the app, read from the same metadata the guards
 * use, so the checks below also cover routes added later.
 */
function routesOf(app: INestApplication): Route[] {
  const reflector = app.get(Reflector);
  const scanner = new MetadataScanner();
  const guardsOf = (target: object) =>
    (Reflect.getMetadata(GUARDS_METADATA, target) ?? []) as unknown[];

  return app
    .get(DiscoveryService)
    .getControllers()
    .flatMap(({ metatype }) => {
      const controller = metatype as Type;
      const prototype = controller.prototype as Record<
        string,
        (...args: never[]) => unknown
      >;
      return scanner
        .getAllMethodNames(prototype)
        .filter((name) => Reflect.hasMetadata(PATH_METADATA, prototype[name]))
        .map((name) => {
          const handler = prototype[name];
          return {
            operationId: `${controller.name.replace(/Controller$/, '')}_${name}`,
            isPublic:
              reflector.getAllAndOverride(IsPublic, [handler, controller]) ===
              true,
            optionalAuth:
              reflector.getAllAndOverride(IsOptionalAuth, [
                handler,
                controller,
              ]) === true,
            rateLimited: [
              ...guardsOf(controller),
              ...guardsOf(handler),
            ].includes(AuthThrottlerGuard),
            roles: reflector.getAllAndOverride(RequiredRoles, [
              handler,
              controller,
            ]),
          };
        });
    });
}

const ERROR_BODY = {
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponseDto' },
    },
  },
};

/*
 * Note: the @nestjs/swagger CLI plugin doesn't run under Jest (ts-jest uses
 * isolatedModules), so DTO *properties* aren't in this document. These tests
 * cover what doesn't depend on the plugin. To see the plugin's output, run
 * the real build (`npm run build && npm run start:prod`) and open
 * /api/docs-json.
 */
describe('Swagger (e2e)', () => {
  describe('when enabled', () => {
    let app: INestApplication<App>;
    let document: OpenAPIObject;

    beforeAll(async () => {
      app = await createApp(true);
      const res = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);
      document = res.body as OpenAPIObject;
    });

    afterAll(async () => {
      await app.close();
    });

    const http = () => request(app.getHttpServer());

    describe('Swagger UI', () => {
      it('is served at /api/docs with the security headers', async () => {
        const res = await http().get('/api/docs').expect(200);

        expect(res.headers['content-type']).toMatch(/text\/html/);
        expect(res.headers['content-security-policy']).toContain(
          "script-src 'self'",
        );
        expect(res.headers['x-content-type-options']).toBe('nosniff');
      });

      // Guards the "works with the default CSP" property: no inline code and
      // no third-party hosts, which `script-src 'self'` would block.
      it('loads only same-origin scripts, with no inline code', async () => {
        const res = await http().get('/api/docs').expect(200);
        const html = res.text;

        expect(html).not.toMatch(/<script>[^<]+<\/script>/);
        expect(html).not.toMatch(/(src|href)="https?:\/\//);
        expect(html).toContain('swagger-ui-bundle.js');
      });

      it('serves its assets', async () => {
        const res = await http()
          .get('/api/docs/swagger-ui-bundle.js')
          .expect(200);

        expect(res.headers['content-type']).toMatch(/javascript/);
      });
    });

    describe('OpenAPI document', () => {
      it('is OpenAPI 3 with the title and package.json version', () => {
        expect(document.openapi).toMatch(/^3\./);
        expect(document.info).toMatchObject({
          title: 'SimpleFood API',
          version: readApiVersion(),
        });
      });

      it('includes the /api prefix in paths, and /health outside it', () => {
        expect(Object.keys(document.paths)).toEqual(
          expect.arrayContaining(['/api/ping', '/health']),
        );
        expect(document.paths['/api/health']).toBeUndefined();
      });

      it('uses short, unique operation IDs', () => {
        expect(document.paths['/health'].get?.operationId).toBe('Health_check');
      });

      it('groups endpoints under explicit tags with descriptions', () => {
        expect(document.paths['/health'].get?.tags).toEqual(['health']);
        expect(document.tags?.map((tag) => tag.name)).toEqual([
          'health',
          'catalog',
          'content',
          'blog',
          'auth',
          'users',
          'orders',
          'contact',
          'media',
          'admin',
        ]);
        for (const tag of document.tags ?? []) {
          expect(tag.description).toEqual(expect.any(String));
        }
        expect(
          document.tags?.find((tag) => tag.name === 'content')?.description,
        ).toContain('pages');
      });

      it('documents the shared error shape on every endpoint', () => {
        expect(document.components?.schemas?.ErrorResponseDto).toBeDefined();

        for (const status of ['400', '404', '500']) {
          expect(
            document.paths['/health'].get?.responses[status],
          ).toMatchObject({
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponseDto' },
              },
            },
          });
        }
      });

      it('declares the bearer (JWT) auth scheme', () => {
        expect(document.components?.securitySchemes?.bearer).toMatchObject({
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        });
      });

      it("declares the admin app's refresh cookie, on the routes that read it", () => {
        expect(
          document.components?.securitySchemes?.adminRefreshCookie,
        ).toMatchObject({
          type: 'apiKey',
          in: 'cookie',
          name: 'sf_admin_refresh',
        });
        const usingIt = Object.values(document.paths)
          .flatMap((item) => Object.values(item) as OperationObject[])
          .filter((operation) =>
            operation.security?.some(
              (scheme) => 'adminRefreshCookie' in scheme,
            ),
          )
          .map((operation) => operation.operationId ?? '')
          .sort((a, b) => a.localeCompare(b));
        expect(usingIt).toEqual(['AdminAuth_logout', 'AdminAuth_refresh']);
      });

      it('is served as JSON only (no YAML copy)', async () => {
        await http().get('/api/docs-yaml').expect(404);
      });
    });

    describe('auth and rate limits', () => {
      let routes: Route[];
      let operations: Map<string, OperationObject>;

      beforeAll(() => {
        routes = routesOf(app);
        operations = new Map(
          Object.values(document.paths)
            .flatMap((item) => Object.values(item) as OperationObject[])
            .map((operation) => [operation.operationId ?? '', operation]),
        );
      });

      /** The documented operation for a route; fails if it's missing. */
      const operationOf = (operationId: string) => {
        const operation = operations.get(operationId);
        expect(operation).toBeDefined();
        return operation as OperationObject;
      };

      /** A route of the admin API (/api/admin/*), sign-in excluded. */
      const isAdminApi = (route: Route) =>
        route.operationId.startsWith('Admin') &&
        !route.operationId.startsWith('AdminAuth_');

      /** Neither public nor optional: a token is required. */
      const needsLogin = (route: Route) =>
        !route.isPublic && !route.optionalAuth;

      it('finds the routes to check, public and protected', () => {
        const ids = routes.map((route) => route.operationId);

        expect(ids).toEqual(
          expect.arrayContaining([
            'Health_check',
            'Products_findAll',
            'Auth_login',
            'Auth_changePassword',
            'Users_getMe',
          ]),
        );
        // The admin API (every Admin* controller but the sign-in) on top.
        expect(
          routes.filter((route) => needsLogin(route) && !isAdminApi(route)),
        ).toHaveLength(8);
        expect(
          routes
            .filter((route) => route.optionalAuth)
            .map((r) => r.operationId),
        ).toEqual(['Orders_create']);
      });

      it('shows the bearer scheme and its 401 on every route that needs a login', () => {
        for (const { operationId } of routes.filter(needsLogin)) {
          const operation = operationOf(operationId);

          expect({ operationId, security: operation.security }).toEqual({
            operationId,
            security: [{ bearer: [] }],
          });
          expect(operation.responses['401']).toMatchObject({
            ...ERROR_BODY,
            headers: { 'WWW-Authenticate': expect.any(Object) },
          });
        }
      });

      it('shows the login as optional, with its 401, on @OptionalAuth() routes', () => {
        for (const { operationId } of routes.filter((r) => r.optionalAuth)) {
          const operation = operationOf(operationId);

          // OpenAPI: `{}` = no credentials needed; or a bearer token.
          expect({ operationId, security: operation.security }).toEqual({
            operationId,
            security: [{}, { bearer: [] }],
          });
          expect(operation.responses['401']).toMatchObject({
            ...ERROR_BODY,
            headers: { 'WWW-Authenticate': expect.any(Object) },
          });
        }
      });

      it('shows no login requirement on public routes', () => {
        // The admin app's refresh and logout read a cookie instead (above).
        const cookieRoutes = ['AdminAuth_refresh', 'AdminAuth_logout'];
        for (const { operationId } of routes.filter(
          (r) => r.isPublic && !cookieRoutes.includes(r.operationId),
        )) {
          expect({
            operationId,
            security: operationOf(operationId).security,
          }).toEqual({ operationId, security: undefined });
        }
      });

      it('documents the 429 and Retry-After on every rate-limited route', () => {
        const limited = routes.filter((route) => route.rateLimited);
        expect(limited.map((route) => route.operationId).sort()).toEqual([
          'AdminAuth_login',
          'AdminAuth_logout',
          'AdminAuth_refresh',
          'Auth_changePassword',
          'Auth_forgotPassword',
          'Auth_login',
          'Auth_logout',
          'Auth_refresh',
          'Auth_register',
          'Auth_resendVerification',
          'Auth_resetPassword',
          'Auth_verifyEmail',
          'Contact_submit',
          'Media_upload',
          'Orders_create',
          'Users_updateMe',
        ]);

        for (const { operationId } of limited) {
          expect(operationOf(operationId).responses['429']).toMatchObject({
            ...ERROR_BODY,
            headers: { 'Retry-After': { schema: { type: 'integer' } } },
          });
        }
        expect(operationOf('Users_getMe').responses['429']).toBeUndefined();
      });

      it.each([
        ['Auth_register', ['201', '409']],
        ['Auth_login', ['200', '401', '403']],
        ['Auth_refresh', ['200', '401']],
        ['Auth_logout', ['204']],
        ['Auth_changePassword', ['200', '400', '401']],
        ['Users_getMe', ['200', '401']],
        ['Users_updateMe', ['200', '400', '401', '409']],
        ['Orders_create', ['201', '400', '401', '409']],
        ['Orders_findMine', ['200', '401']],
        ['Contact_submit', ['204', '429']],
        ['Auth_forgotPassword', ['204', '429']],
        ['Auth_resetPassword', ['204', '400', '429']],
        ['Auth_verifyEmail', ['204', '400', '429']],
        ['Auth_resendVerification', ['204', '401', '429']],
        ['Media_upload', ['201', '400', '401', '403', '413', '415', '429']],
        ['Media_update', ['200', '401', '403', '404']],
        ['Media_remove', ['204', '401', '403', '404']],
        ['AdminAuth_login', ['200', '401', '403', '429']],
        ['AdminAuth_refresh', ['200', '401', '403', '429']],
        ['AdminAuth_logout', ['204', '403', '429']],
      ])('%s documents its own responses: %j', (operationId, statuses) => {
        const { responses } = operationOf(operationId);

        expect(Object.keys(responses)).toEqual(
          expect.arrayContaining(statuses),
        );
        for (const status of statuses.filter((s) => Number(s) >= 400)) {
          expect(responses[status]).toMatchObject({
            ...ERROR_BODY,
            description: expect.any(String),
          });
        }
      });

      it.each([
        ['Auth_register', '201', 'AuthResultDto'],
        ['Auth_login', '200', 'AuthResultDto'],
        ['Auth_refresh', '200', 'AuthTokensDto'],
        ['Auth_changePassword', '200', 'AuthResultDto'],
        ['Users_getMe', '200', 'UserDto'],
        ['Users_updateMe', '200', 'UserDto'],
        ['Orders_create', '201', 'OrderDto'],
        ['Media_upload', '201', 'MediaDto'],
        ['Media_update', '200', 'MediaDto'],
        ['AdminAuth_login', '200', 'AdminSessionDto'],
        ['AdminAuth_refresh', '200', 'AdminSessionDto'],
      ])('%s answers %s with { data: %s }', (operationId, status, model) => {
        expect(operationOf(operationId).responses[status]).toMatchObject({
          content: {
            'application/json': {
              schema: {
                required: ['data'],
                properties: {
                  data: { $ref: `#/components/schemas/${model}` },
                },
              },
            },
          },
        });
      });

      it.each([
        'Auth_logout',
        'Auth_forgotPassword',
        'Auth_resetPassword',
        'Auth_verifyEmail',
        'Auth_resendVerification',
        'Contact_submit',
        'Media_remove',
        'AdminAuth_logout',
      ])('has no body for the 204 of %s', (operationId) => {
        expect(operationOf(operationId).responses['204']).toEqual({
          description: expect.any(String),
        });
      });

      it('limits every admin API route to staff, and needs a login for it', () => {
        const admin = routes.filter(isAdminApi);
        expect(admin.length).toBeGreaterThan(40);

        for (const route of admin) {
          expect({
            id: route.operationId,
            needsLogin: needsLogin(route),
          }).toEqual({
            id: route.operationId,
            needsLogin: true,
          });
          expect({ id: route.operationId, roles: route.roles }).toEqual({
            id: route.operationId,
            roles: expect.arrayContaining(['admin']),
          });
          expect(route.roles).not.toContain('customer');
        }
        // Admins only: accounts, and deleting what customers wrote.
        expect(
          admin
            .filter((route) => !route.roles?.includes('editor'))
            .map((route) => route.operationId)
            .sort((a, b) => a.localeCompare(b)),
        ).toEqual([
          'AdminContactMessages_remove',
          'AdminUsers_findAll',
          'AdminUsers_findOne',
          'AdminUsers_sendPasswordReset',
          'AdminUsers_update',
        ]);
      });

      it('documents the 403 on every route limited to roles', () => {
        const limited = routes.filter((route) => route.roles);
        expect(limited.map((route) => route.operationId)).toEqual(
          expect.arrayContaining([
            'Media_remove',
            'Media_update',
            'Media_upload',
          ]),
        );
        expect(limited).toHaveLength(3 + routes.filter(isAdminApi).length);

        for (const { operationId, roles } of limited) {
          expect(operationOf(operationId).responses['403']).toMatchObject({
            ...ERROR_BODY,
            description: `Logged in, but not as ${roles?.join(' or ')} (\`FORBIDDEN\`).`,
          });
        }
      });

      it('documents the upload as a multipart form with a binary file', () => {
        const body = operationOf('Media_upload').requestBody as {
          content: Record<string, { schema: object }>;
        };

        expect(Object.keys(body.content)).toEqual(['multipart/form-data']);
        expect(body.content['multipart/form-data'].schema).toMatchObject({
          required: ['file'],
          properties: { file: { type: 'string', format: 'binary' } },
        });
      });
    });
  });

  describe('when disabled', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await createApp(false);
    });

    afterAll(async () => {
      await app.close();
    });

    it.each(['/api/docs', '/api/docs-json'])(
      'GET %s is a regular 404',
      async (path) => {
        const res = await request(app.getHttpServer()).get(path).expect(404);

        expect(res.body.error.code).toBe('NOT_FOUND');
      },
    );
  });
});
