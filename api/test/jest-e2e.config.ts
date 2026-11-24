/**
 * @jest-config-loader ts-node
 *
 * Jest first loads TypeScript configs with Node's native type stripping (ESM
 * rules: relative imports need a file extension). The import below has none,
 * which `npm run typecheck` requires, so Jest falls back to ts-node for it.
 */
import type { Config } from 'jest';
import { coverageExclusions } from '../jest.config';

// E2E tests: test/**/*.e2e-spec.ts against the real app and a Testcontainers
// Postgres (see setup/global-setup.ts). Unit tests: ../jest.config.ts.
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  // The project root, so coverage can include src/; tests are found in test/.
  rootDir: '..',
  roots: ['<rootDir>/test'],
  testRegex: '.e2e-spec.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  // The `@/*` path alias from tsconfig.json (`@/x` = `src/x`). It doesn't
  // apply to globalSetup, which registers tsconfig-paths itself.
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  globalSetup: '<rootDir>/test/setup/global-setup.ts',
  globalTeardown: '<rootDir>/test/setup/global-teardown.ts',
  // Each worker gets its own database (see setup/worker-database.ts).
  setupFiles: ['<rootDir>/test/setup/worker-database.ts'],
  // Caps parallel workers, and so the number of test databases and of
  // connection pools open against the test Postgres.
  maxWorkers: 4,
  collectCoverageFrom: [
    'src/**/*.ts',
    ...coverageExclusions.map((pattern) => `!src/${pattern}`),
  ],
  coverageDirectory: '<rootDir>/coverage/e2e',
  testEnvironment: 'node',
};

export default config;
