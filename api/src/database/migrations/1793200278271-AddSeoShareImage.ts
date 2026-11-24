import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSeoShareImage1793200278271 implements MigrationInterface {
  name = 'AddSeoShareImage1793200278271';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "blog_post"
            ADD "seo_share_image_id" uuid
        `);
    await queryRunner.query(`
            ALTER TABLE "page"
            ADD "seo_share_image_id" uuid
        `);
    await queryRunner.query(`
            ALTER TABLE "site_settings"
            ADD "seo_share_image_id" uuid
        `);
    await queryRunner.query(`
            ALTER TABLE "blog_post"
            ADD CONSTRAINT "FK_daa1534cc440e65af5d232e6027" FOREIGN KEY ("seo_share_image_id") REFERENCES "media"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "page"
            ADD CONSTRAINT "FK_e4834c93ea23d55e0960c1236de" FOREIGN KEY ("seo_share_image_id") REFERENCES "media"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "site_settings"
            ADD CONSTRAINT "FK_9e39766c21641555ec7287a564b" FOREIGN KEY ("seo_share_image_id") REFERENCES "media"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "site_settings" DROP CONSTRAINT "FK_9e39766c21641555ec7287a564b"
        `);
    await queryRunner.query(`
            ALTER TABLE "page" DROP CONSTRAINT "FK_e4834c93ea23d55e0960c1236de"
        `);
    await queryRunner.query(`
            ALTER TABLE "blog_post" DROP CONSTRAINT "FK_daa1534cc440e65af5d232e6027"
        `);
    await queryRunner.query(`
            ALTER TABLE "site_settings" DROP COLUMN "seo_share_image_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "page" DROP COLUMN "seo_share_image_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "blog_post" DROP COLUMN "seo_share_image_id"
        `);
  }
}
