import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The email is an account's only unique field and the
 * only way to log in, so `username` becomes `name`, the person's name:
 * not unique, up to 100 characters (the order form's limit), `@` allowed.
 * A rename, not drop and add: the names are kept.
 */
export class UserNameNotUnique1794853284240 implements MigrationInterface {
  name = 'UserNameNotUnique1794853284240';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "app_user" DROP CONSTRAINT "UQ_user_username"
        `);
    await queryRunner.query(`
            ALTER TABLE "app_user" DROP CONSTRAINT "CHK_app_user_username"
        `);
    await queryRunner.query(`
            ALTER TABLE "app_user" RENAME COLUMN "username" TO "name"
        `);
    await queryRunner.query(`
            ALTER TABLE "app_user"
            ALTER COLUMN "name" TYPE character varying(100) USING "name"::text
        `);
    await queryRunner.query(`
            ALTER TABLE "app_user"
            ADD CONSTRAINT "CHK_app_user_name" CHECK (
                char_length("name") BETWEEN 2 AND 100
            )
        `);
  }

  /**
   * Back to unique usernames without `@`, up to 50 characters. Refuses,
   * with the reason, once names exist that the old rules don't allow: it
   * won't rename people.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ duplicates, invalid }] = (await queryRunner.query(`
            SELECT
                (SELECT count(*) FROM (
                    SELECT lower("name") FROM "app_user"
                    GROUP BY lower("name") HAVING count(*) > 1
                ) AS shared)::int AS duplicates,
                (SELECT count(*) FROM "app_user"
                 WHERE char_length("name") > 50
                    OR position('@' in "name") > 0)::int AS invalid
        `)) as { duplicates: number; invalid: number }[];
    if (duplicates > 0 || invalid > 0) {
      throw new Error(
        `Can't restore unique usernames: ${duplicates} name(s) shared by ` +
          `several accounts, ${invalid} longer than 50 characters or with "@". ` +
          'Change those names first.',
      );
    }
    await queryRunner.query(`
            ALTER TABLE "app_user" DROP CONSTRAINT "CHK_app_user_name"
        `);
    await queryRunner.query(`
            ALTER TABLE "app_user"
            ALTER COLUMN "name" TYPE citext USING "name"::citext
        `);
    await queryRunner.query(`
            ALTER TABLE "app_user" RENAME COLUMN "name" TO "username"
        `);
    await queryRunner.query(`
            ALTER TABLE "app_user"
            ADD CONSTRAINT "CHK_app_user_username" CHECK (
                char_length("username") BETWEEN 2 AND 50
                AND position('@' in "username") = 0
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "app_user"
            ADD CONSTRAINT "UQ_user_username" UNIQUE ("username")
        `);
  }
}
