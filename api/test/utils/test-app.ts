import { Controller, Get, type Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';
import { Public } from '@/auth/decorators/public.decorator';
import { MAIL_TRANSPORT } from '@/mail/types/mail.types';
import { FakeMailTransport } from './mail';

/** Test-only route: any test that needs "some endpoint that returns 200". */
@Public()
@Controller('ping')
export class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}

export interface TestAppOptions {
  /** Extra test-only controllers, registered next to PingController. */
  controllers?: Type[];
  /** Modules whose providers those controllers inject (e.g. MediaModule for its repository). */
  imports?: Type[];
  /** Replace providers before compiling, e.g. `.overrideProvider(...)`. */
  override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
  /** Runs after the app is created, before configureApp() (e.g. to spy on config). */
  beforeConfigure?: (app: NestExpressApplication) => void;
}

/**
 * The real AppModule with the real HTTP pipeline (configureApp), exactly as
 * main.ts builds it, plus test-only controllers. Remember `await app.close()`.
 *
 * SMTP is always replaced by a FakeMailTransport (read it with mailbox()):
 * no test can send real mail.
 */
export async function createTestApp(
  options: TestAppOptions = {},
): Promise<NestExpressApplication> {
  const builder = Test.createTestingModule({
    imports: [AppModule, ...(options.imports ?? [])],
    controllers: [PingController, ...(options.controllers ?? [])],
  })
    .overrideProvider(MAIL_TRANSPORT)
    .useValue(new FakeMailTransport());
  const moduleFixture = await (
    options.override?.(builder) ?? builder
  ).compile();

  const app = moduleFixture.createNestApplication<NestExpressApplication>();
  options.beforeConfigure?.(app);
  configureApp(app);
  await app.init();
  return app;
}

/** A v4 UUID, as generated for request IDs. */
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
