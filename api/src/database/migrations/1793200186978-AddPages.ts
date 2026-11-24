import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPages1793200186978 implements MigrationInterface {
  name = 'AddPages1793200186978';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TYPE "public"."page_section_type" AS ENUM(
                'image-banner',
                'products',
                'benefits',
                'articles',
                'image-gallery',
                'video',
                'news',
                'content',
                'contact',
                'promo'
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "page_section" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "position" integer NOT NULL DEFAULT '0',
                "type" "public"."page_section_type" NOT NULL,
                "data" jsonb NOT NULL,
                "page_id" uuid NOT NULL,
                CONSTRAINT "CHK_page_section_data_object" CHECK (jsonb_typeof("data") = 'object'),
                CONSTRAINT "PK_24ff5b425f241e57ace24536df9" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_page_section_page" ON "page_section" ("page_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "page" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "slug" character varying(150) NOT NULL,
                "title" character varying(255) NOT NULL,
                "published_at" TIMESTAMP WITH TIME ZONE,
                "seo_title" character varying(255),
                "seo_description" character varying(255),
                CONSTRAINT "UQ_page_slug" UNIQUE ("slug"),
                CONSTRAINT "PK_742f4117e065c5b6ad21b37ba1f" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "page_section"
            ADD CONSTRAINT "FK_8b37a9fcc7d9f7fe6300d195457" FOREIGN KEY ("page_id") REFERENCES "page"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "page_section" DROP CONSTRAINT "FK_8b37a9fcc7d9f7fe6300d195457"
        `);
    await queryRunner.query(`
            DROP TABLE "page"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_page_section_page"
        `);
    await queryRunner.query(`
            DROP TABLE "page_section"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."page_section_type"
        `);
  }
}
