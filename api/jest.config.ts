import type { Config } from 'jest';

/**
 * Source files that coverage ignores, relative to `src/`. Shared with the e2e
 * config (test/jest-e2e.config.ts), so both reports measure the same code.
 * Test files (*.spec.ts, *.e2e-spec.ts) are left out by Jest automatically.
 */
export const coverageExclusions = [
  'main.ts', // bootstrap only
  'database/data-source.ts', // TypeORM CLI entry point
  'database/migrations/**', // checked by test/migrations.e2e-spec.ts
  '**/*.module.ts', // DI wiring
  '**/*.entity.ts', // declarative
  '**/*.dto.ts', // declarative
];

// Unit tests: *.spec.ts next to the code. E2E tests: test/jest-e2e.config.ts.
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  // The `@/*` path alias from tsconfig.json (`@/x` = `src/x`).
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  // Decorators (class-transformer's @Type, TypeORM, Nest) need this polyfill.
  // The app gets it via Nest; a unit test of a plain DTO would not.
  setupFiles: ['reflect-metadata'],
  collectCoverageFrom: [
    '**/*.ts',
    ...coverageExclusions.map((pattern) => `!${pattern}`),
  ],
  // Outside src/ (rootDir), so the report is never collected as source code.
  coverageDirectory: '<rootDir>/../coverage/unit',
  testEnvironment: 'node',
};

export default config;
