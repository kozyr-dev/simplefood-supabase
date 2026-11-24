import { rm } from 'node:fs/promises';

/**
 * Runs once after all e2e test files. Testcontainers' Ryuk sidecar would also
 * remove the container if the run crashed; stopping it here frees it right away.
 * The uploads folder goes too.
 */
export default async function globalTeardown(): Promise<void> {
  await globalThis.__POSTGRES__?.stop();
  const uploads = process.env.TEST_UPLOADS_ROOT;
  if (uploads) {
    await rm(uploads, { recursive: true, force: true });
  }
}
