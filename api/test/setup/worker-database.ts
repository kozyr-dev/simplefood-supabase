/**
 * Runs in each Jest worker before every test file (`setupFiles`), so before
 * the file imports the app: points the app at this worker's own database,
 * created from the migrated template by global-setup.ts, and its own
 * uploads folder (created by the app on startup).
 *
 * JEST_WORKER_ID starts at 1 (and is always 1 with --runInBand).
 */
const template = process.env.TEST_DB_TEMPLATE;
if (!template) {
  throw new Error(
    'TEST_DB_TEMPLATE is not set: run e2e tests via test/jest-e2e.config.ts.',
  );
}

const worker = process.env.JEST_WORKER_ID ?? '1';
process.env.DB_NAME = `${template}_w${worker}`;
process.env.UPLOADS_DIR = `${process.env.TEST_UPLOADS_ROOT}/w${worker}`;
