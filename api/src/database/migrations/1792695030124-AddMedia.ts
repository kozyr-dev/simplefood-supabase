import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMedia1792695030124 implements MigrationInterface {
  name = 'AddMedia1792695030124';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "media" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "url" text NOT NULL,
                "mime" character varying(100) NOT NULL,
                "size" integer NOT NULL,
                "width" integer,
                "height" integer,
                "alt" text,
                "folder" character varying(255),
                "formats" jsonb,
                CONSTRAINT "CHK_media_height_positive" CHECK (
                    "height" IS NULL
                    OR "height" > 0
                ),
                CONSTRAINT "CHK_media_width_positive" CHECK (
                    "width" IS NULL
                    OR "width" > 0
                ),
                CONSTRAINT "CHK_media_size_non_negative" CHECK ("size" >= 0),
                CONSTRAINT "PK_f4e0fcac36e050de337b670d8bd" PRIMARY KEY ("id")
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP TABLE "media"
        `);
  }
}
