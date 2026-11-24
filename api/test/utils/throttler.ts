import type { INestApplication } from '@nestjs/common';
import {
  getStorageToken,
  type ThrottlerStorageService,
} from '@nestjs/throttler';

/**
 * Forgets every rate-limit counter and block, so each test starts with the
 * production limits untouched. Call it in `beforeEach`.
 */
export function resetRateLimits(app: INestApplication): void {
  // Not `storage.clear()`: in @nestjs/throttler 6.7 the hits are also kept in
  // a second, private map, and the counts are rebuilt from it. The shutdown
  // hook clears both (the sweep timer restarts on the next hit).
  app.get<ThrottlerStorageService>(getStorageToken()).onApplicationShutdown();
}
