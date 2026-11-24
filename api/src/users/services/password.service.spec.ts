import bcrypt from 'bcrypt';
import type { AuthConfig } from '@/config/auth.config';
import { PASSWORD_MAX_BYTES, PasswordService } from './password.service';

/** A real Strapi hash (bcryptjs, cost 10) of STRAPI_PASSWORD. */
const STRAPI_HASH =
  '$2a$10$KmHCmk4RGi9/OYM.18Bh6uwVYnHew3f7i0zBXzh7/nFHEQZueiCZa';
const STRAPI_PASSWORD = 'Simple-Food-7';

function createService(bcryptRounds: number): PasswordService {
  return new PasswordService({ bcryptRounds } as AuthConfig);
}

describe('PasswordService', () => {
  // bcrypt's minimum cost, as in the e2e tests: 12 would take ~250 ms per hash.
  let service: PasswordService;

  beforeAll(async () => {
    service = createService(4);
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('hash', () => {
    it('makes a bcrypt hash at the configured cost', async () => {
      expect(await service.hash('correct horse')).toMatch(
        /^\$2b\$04\$[./A-Za-z0-9]{53}$/,
      );
    });

    it('salts every hash: the same password never hashes the same', async () => {
      const [first, second] = await Promise.all([
        service.hash('correct horse'),
        service.hash('correct horse'),
      ]);

      expect(first).not.toBe(second);
    });

    it.each([
      ['72 ASCII characters', 'a'.repeat(72)],
      ['36 Cyrillic letters (72 bytes)', 'ї'.repeat(36)],
    ])('accepts %s', async (_, password) => {
      await expect(service.hash(password)).resolves.toBeDefined();
    });

    // bcrypt would silently ignore everything after byte 72.
    it.each([
      ['73 ASCII characters', 'a'.repeat(73)],
      ['37 Cyrillic letters (74 bytes)', 'ї'.repeat(37)],
      ['18 emoji (72 bytes) plus one character', '🍲'.repeat(18) + 'a'],
    ])('refuses %s', async (_, password) => {
      await expect(service.hash(password)).rejects.toThrow(
        `longer than ${PASSWORD_MAX_BYTES} bytes`,
      );
    });
  });

  describe('verify', () => {
    it('accepts the right password and refuses others', async () => {
      const hash = await service.hash('correct horse');

      expect(await service.verify('correct horse', hash)).toBe(true);
      expect(await service.verify('Correct horse', hash)).toBe(false);
      expect(await service.verify('correct horse ', hash)).toBe(false);
      expect(await service.verify('', hash)).toBe(false);
    });

    it('accepts hashes migrated from Strapi ($2a$, cost 10)', async () => {
      expect(await service.verify(STRAPI_PASSWORD, STRAPI_HASH)).toBe(true);
      expect(await service.verify('simple-food-7', STRAPI_HASH)).toBe(false);
    });

    it('works with non-ASCII passwords', async () => {
      const hash = await service.hash('Борщ і вареники 🍲');

      expect(await service.verify('Борщ і вареники 🍲', hash)).toBe(true);
      expect(await service.verify('Борщ і вареники', hash)).toBe(false);
    });

    it.each([null, undefined])(
      'is false for an unknown user (hash %p), after the same bcrypt work',
      async (hash) => {
        const compare = jest.spyOn(bcrypt, 'compare');

        expect(await service.verify('any password', hash)).toBe(false);
        // The time comes from bcrypt: a check at the configured cost must run.
        expect(compare).toHaveBeenCalledTimes(1);
        expect(compare).toHaveBeenCalledWith(
          'any password',
          expect.stringMatching(/^\$2b\$04\$/),
        );
      },
    );

    it('is false, without throwing, for a stored value that is not a bcrypt hash', async () => {
      expect(await service.verify('correct horse', 'not-a-hash')).toBe(false);
      expect(await service.verify('correct horse', '')).toBe(false);
    });
  });

  describe('needsRehash', () => {
    // Only reads the cost from the hash's prefix: no hashing needed.
    const current = createService(12);
    const madeWithCost = (cost: number) =>
      bcrypt.genSaltSync(cost) + 'x'.repeat(31);

    it('is true for a Strapi hash once the cost is above 10', () => {
      expect(current.needsRehash(STRAPI_HASH)).toBe(true);
    });

    it('is false for a hash at the current cost', () => {
      expect(current.needsRehash(madeWithCost(12))).toBe(false);
    });

    it('is false for a hash above the current cost (never downgrade)', () => {
      expect(current.needsRehash(madeWithCost(13))).toBe(false);
    });

    it('is true for a value that is not a bcrypt hash', () => {
      expect(current.needsRehash('not-a-hash')).toBe(true);
    });
  });
});
