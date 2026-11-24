import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsersAndRefreshTokens1793291621423 implements MigrationInterface {
  name = 'AddUsersAndRefreshTokens1793291621423';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TYPE "public"."user_role" AS ENUM('customer', 'editor', 'admin')
        `);
    await queryRunner.query(`
            CREATE TABLE "app_user" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "username" citext NOT NULL,
                "email" citext NOT NULL,
                "password_hash" character varying(255) NOT NULL,
                "phone" character varying(30),
                "address" character varying(500),
                "role" "public"."user_role" NOT NULL DEFAULT 'customer',
                "blocked" boolean NOT NULL DEFAULT false,
                CONSTRAINT "UQ_user_username" UNIQUE ("username"),
                CONSTRAINT "UQ_user_email" UNIQUE ("email"),
                CONSTRAINT "CHK_app_user_username" CHECK (
                    char_length("username") BETWEEN 2 AND 50
                    AND position('@' in "username") = 0
                ),
                CONSTRAINT "CHK_app_user_email" CHECK (
                    char_length("email") <= 254
                    AND position('@' in "email") > 1
                ),
                CONSTRAINT "PK_22a5c4a3d9b2fb8e4e73fc4ada1" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "refresh_token" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "family_id" uuid NOT NULL,
                "token_hash" character(64) NOT NULL,
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "family_expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "revoked_at" TIMESTAMP WITH TIME ZONE,
                "user_id" uuid NOT NULL,
                CONSTRAINT "UQ_refresh_token_hash" UNIQUE ("token_hash"),
                CONSTRAINT "PK_b575dd3c21fb0831013c909e7fe" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_refresh_token_user" ON "refresh_token" ("user_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_refresh_token_family" ON "refresh_token" ("family_id")
        `);
    await queryRunner.query(`
            ALTER TABLE "refresh_token"
            ADD CONSTRAINT "FK_6bbe63d2fe75e7f0ba1710351d4" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "refresh_token" DROP CONSTRAINT "FK_6bbe63d2fe75e7f0ba1710351d4"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_refresh_token_family"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_refresh_token_user"
        `);
    await queryRunner.query(`
            DROP TABLE "refresh_token"
        `);
    await queryRunner.query(`
            DROP TABLE "app_user"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."user_role"
        `);
  }
}
