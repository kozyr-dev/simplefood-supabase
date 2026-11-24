import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContactSubmissions1793981468623 implements MigrationInterface {
  name = 'AddContactSubmissions1793981468623';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "contact_submission" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "name" character varying(100) NOT NULL,
                "email" character varying(254) NOT NULL,
                "message" text NOT NULL,
                "handled_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "CHK_contact_submission_message_length" CHECK (
                    char_length("message") BETWEEN 1 AND 5000
                ),
                CONSTRAINT "CHK_contact_submission_email" CHECK (position('@' in "email") > 1),
                CONSTRAINT "PK_105f8b67ed7acaf8a8d794e3619" PRIMARY KEY ("id")
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP TABLE "contact_submission"
        `);
  }
}
