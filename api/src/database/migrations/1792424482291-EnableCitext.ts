import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Case-insensitive text type, used later for `users.email` so that
 * "Ivan@Mail.com" and "ivan@mail.com" can't register as two accounts.
 * `citext` is a trusted extension (PG 13+): a non-superuser owner of the
 * database can install it, so this also works with a restricted prod role.
 */
export class EnableCitext1792424482291 implements MigrationInterface {
  name = 'EnableCitext1792424482291';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS citext`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP EXTENSION IF EXISTS citext`);
  }
}
