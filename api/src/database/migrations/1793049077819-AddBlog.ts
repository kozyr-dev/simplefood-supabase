import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBlog1793049077819 implements MigrationInterface {
  name = 'AddBlog1793049077819';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "blog_category" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "name" character varying(100) NOT NULL,
                "slug" character varying(100) NOT NULL,
                CONSTRAINT "UQ_blog_category_slug" UNIQUE ("slug"),
                CONSTRAINT "PK_32b67ddf344608b5c2fb95bc90c" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "blog_post" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "slug" character varying(150) NOT NULL,
                "title" character varying(255) NOT NULL,
                "text" text NOT NULL,
                "published_at" TIMESTAMP WITH TIME ZONE,
                "image_id" uuid,
                "seo_title" character varying(255),
                "seo_description" character varying(255),
                CONSTRAINT "UQ_blog_post_slug" UNIQUE ("slug"),
                CONSTRAINT "PK_694e842ad1c2b33f5939de6fede" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_blog_post_published_at" ON "blog_post" ("published_at")
        `);
    await queryRunner.query(`
            CREATE TABLE "blog_post_to_category" (
                "blog_post_id" uuid NOT NULL,
                "category_id" uuid NOT NULL,
                CONSTRAINT "PK_c68d30f9473af8ffcf306d3e7d1" PRIMARY KEY ("blog_post_id", "category_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_934a893d934669fafe71e8e7c5" ON "blog_post_to_category" ("blog_post_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_9f4cb706dabdb909aa4a200780" ON "blog_post_to_category" ("category_id")
        `);
    await queryRunner.query(`
            ALTER TABLE "blog_post"
            ADD CONSTRAINT "FK_ded128eb3cd8eaa9cacf88cf2d9" FOREIGN KEY ("image_id") REFERENCES "media"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "blog_post_to_category"
            ADD CONSTRAINT "FK_934a893d934669fafe71e8e7c52" FOREIGN KEY ("blog_post_id") REFERENCES "blog_post"("id") ON DELETE CASCADE ON UPDATE CASCADE
        `);
    await queryRunner.query(`
            ALTER TABLE "blog_post_to_category"
            ADD CONSTRAINT "FK_9f4cb706dabdb909aa4a200780f" FOREIGN KEY ("category_id") REFERENCES "blog_category"("id") ON DELETE CASCADE ON UPDATE CASCADE
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "blog_post_to_category" DROP CONSTRAINT "FK_9f4cb706dabdb909aa4a200780f"
        `);
    await queryRunner.query(`
            ALTER TABLE "blog_post_to_category" DROP CONSTRAINT "FK_934a893d934669fafe71e8e7c52"
        `);
    await queryRunner.query(`
            ALTER TABLE "blog_post" DROP CONSTRAINT "FK_ded128eb3cd8eaa9cacf88cf2d9"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_9f4cb706dabdb909aa4a200780"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_934a893d934669fafe71e8e7c5"
        `);
    await queryRunner.query(`
            DROP TABLE "blog_post_to_category"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_blog_post_published_at"
        `);
    await queryRunner.query(`
            DROP TABLE "blog_post"
        `);
    await queryRunner.query(`
            DROP TABLE "blog_category"
        `);
  }
}
