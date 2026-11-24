import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSettingsAndMenus1793019631235 implements MigrationInterface {
  name = 'AddSettingsAndMenus1793019631235';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TYPE "public"."menu_key" AS ENUM('header', 'footer', 'dropdown')
        `);
    await queryRunner.query(`
            CREATE TABLE "menu" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "key" "public"."menu_key" NOT NULL,
                CONSTRAINT "UQ_menu_key" UNIQUE ("key"),
                CONSTRAINT "PK_35b2a8f47d153ff7a41860cceeb" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."menu_item_group" AS ENUM('main', 'list')
        `);
    await queryRunner.query(`
            CREATE TABLE "menu_item" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "title" character varying(100) NOT NULL,
                "link" character varying(500) NOT NULL,
                "class_name" character varying(100),
                "item_group" "public"."menu_item_group" NOT NULL DEFAULT 'main',
                "position" integer NOT NULL DEFAULT '0',
                "menu_id" uuid NOT NULL,
                CONSTRAINT "PK_722c4de0accbbfafc77947a8556" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_menu_item_menu" ON "menu_item" ("menu_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "site_settings" (
                "id" smallint NOT NULL DEFAULT '1',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "site_name" character varying(100) NOT NULL,
                "phone" character varying(50),
                "address" text,
                "working_hours" character varying(255),
                "taking_orders_hours" character varying(255),
                "facebook" text,
                "instagram" text,
                "seo_title" character varying(255),
                "seo_description" character varying(255),
                CONSTRAINT "CHK_site_settings_single_row" CHECK ("id" = 1),
                CONSTRAINT "PK_e4290e8371a166d7e066d131f6e" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "menu_item"
            ADD CONSTRAINT "FK_d13308fb4357c972780ec7cf3b0" FOREIGN KEY ("menu_id") REFERENCES "menu"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "menu_item" DROP CONSTRAINT "FK_d13308fb4357c972780ec7cf3b0"
        `);
    await queryRunner.query(`
            DROP TABLE "site_settings"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_menu_item_menu"
        `);
    await queryRunner.query(`
            DROP TABLE "menu_item"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."menu_item_group"
        `);
    await queryRunner.query(`
            DROP TABLE "menu"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."menu_key"
        `);
  }
}
