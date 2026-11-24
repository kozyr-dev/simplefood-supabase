import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMediaName1794326443060 implements MigrationInterface {
  name = 'AddMediaName1794326443060';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rows that already exist get the last part of their URL as the name,
    // then the column becomes required (as the entity declares it).
    await queryRunner.query(`
            ALTER TABLE "media"
            ADD "name" character varying(255)
        `);
    await queryRunner.query(`
            UPDATE "media"
            SET "name" = left(regexp_replace("url", '^.*/', ''), 255)
        `);
    await queryRunner.query(`
            ALTER TABLE "media"
            ALTER COLUMN "name" SET NOT NULL
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "media" DROP COLUMN "name"
        `);
  }
}
