import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountTokens1793993843990 implements MigrationInterface {
  name = 'AddAccountTokens1793993843990';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TYPE "public"."account_token_purpose" AS ENUM('password_reset', 'email_verification')
        `);
    await queryRunner.query(`
            CREATE TABLE "account_token" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "user_id" uuid NOT NULL,
                "purpose" "public"."account_token_purpose" NOT NULL,
                "token_hash" character(64) NOT NULL,
                "email" citext NOT NULL,
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "used_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "UQ_account_token_hash" UNIQUE ("token_hash"),
                CONSTRAINT "PK_a55842d3341d42534e39f85e931" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_account_token_user_purpose" ON "account_token" ("user_id", "purpose")
        `);
    await queryRunner.query(`
            ALTER TABLE "app_user"
            ADD "email_verified_at" TIMESTAMP WITH TIME ZONE
        `);
    await queryRunner.query(`
            ALTER TABLE "account_token"
            ADD CONSTRAINT "FK_ab3c66669facfe429164e60ab82" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "account_token" DROP CONSTRAINT "FK_ab3c66669facfe429164e60ab82"
        `);
    await queryRunner.query(`
            ALTER TABLE "app_user" DROP COLUMN "email_verified_at"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_account_token_user_purpose"
        `);
    await queryRunner.query(`
            DROP TABLE "account_token"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."account_token_purpose"
        `);
  }
}
