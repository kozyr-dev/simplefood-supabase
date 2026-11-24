import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCatalog1792764906842 implements MigrationInterface {
  name = 'AddCatalog1792764906842';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "product_category" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "name" character varying(100) NOT NULL,
                "slug" character varying(100) NOT NULL,
                "position" integer NOT NULL DEFAULT '0',
                CONSTRAINT "UQ_product_category_slug" UNIQUE ("slug"),
                CONSTRAINT "PK_0dce9bc93c2d2c399982d04bef1" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "product" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "slug" character varying(150) NOT NULL,
                "title" character varying(255) NOT NULL,
                "description" text,
                "price" integer NOT NULL,
                "weight" integer,
                "calories" integer,
                "available" boolean NOT NULL DEFAULT true,
                "featured" boolean NOT NULL DEFAULT false,
                "favorite" boolean NOT NULL DEFAULT false,
                "image_id" uuid,
                CONSTRAINT "UQ_product_slug" UNIQUE ("slug"),
                CONSTRAINT "CHK_product_calories_non_negative" CHECK (
                    "calories" IS NULL
                    OR "calories" >= 0
                ),
                CONSTRAINT "CHK_product_weight_positive" CHECK (
                    "weight" IS NULL
                    OR "weight" > 0
                ),
                CONSTRAINT "CHK_product_price_non_negative" CHECK ("price" >= 0),
                CONSTRAINT "PK_bebc9158e480b949565b4dc7a82" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "product_to_category" (
                "product_id" uuid NOT NULL,
                "category_id" uuid NOT NULL,
                CONSTRAINT "PK_d9c12e06d52f23c86287e1b8fc7" PRIMARY KEY ("product_id", "category_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_ef1119ce91f7cb425a5862be94" ON "product_to_category" ("product_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_c56688ed83d7e74fa56452a064" ON "product_to_category" ("category_id")
        `);
    await queryRunner.query(`
            ALTER TABLE "product"
            ADD CONSTRAINT "FK_99d98a80f57857d51b5f63c8240" FOREIGN KEY ("image_id") REFERENCES "media"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "product_to_category"
            ADD CONSTRAINT "FK_ef1119ce91f7cb425a5862be941" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE
        `);
    await queryRunner.query(`
            ALTER TABLE "product_to_category"
            ADD CONSTRAINT "FK_c56688ed83d7e74fa56452a0641" FOREIGN KEY ("category_id") REFERENCES "product_category"("id") ON DELETE CASCADE ON UPDATE CASCADE
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "product_to_category" DROP CONSTRAINT "FK_c56688ed83d7e74fa56452a0641"
        `);
    await queryRunner.query(`
            ALTER TABLE "product_to_category" DROP CONSTRAINT "FK_ef1119ce91f7cb425a5862be941"
        `);
    await queryRunner.query(`
            ALTER TABLE "product" DROP CONSTRAINT "FK_99d98a80f57857d51b5f63c8240"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_c56688ed83d7e74fa56452a064"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_ef1119ce91f7cb425a5862be94"
        `);
    await queryRunner.query(`
            DROP TABLE "product_to_category"
        `);
    await queryRunner.query(`
            DROP TABLE "product"
        `);
    await queryRunner.query(`
            DROP TABLE "product_category"
        `);
  }
}
