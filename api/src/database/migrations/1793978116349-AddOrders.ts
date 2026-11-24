import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrders1793978116349 implements MigrationInterface {
  name = 'AddOrders1793978116349';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TYPE "public"."shipping_method" AS ENUM('delivery', 'pickup')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."order_status" AS ENUM('new', 'processing', 'declined', 'completed')
        `);
    await queryRunner.query(`
            CREATE TABLE "customer_order" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "number" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "name" character varying(100) NOT NULL,
                "email" character varying(254) NOT NULL,
                "phone" character varying(30) NOT NULL,
                "address" character varying(500),
                "shipping_method" "public"."shipping_method" NOT NULL,
                "comments" character varying(1000),
                "status" "public"."order_status" NOT NULL DEFAULT 'new',
                "subtotal" integer NOT NULL,
                "legacy_dishes_text" text,
                "user_id" uuid,
                CONSTRAINT "UQ_customer_order_number" UNIQUE ("number"),
                CONSTRAINT "CHK_customer_order_delivery_address" CHECK (
                    "shipping_method" <> 'delivery'
                    OR "address" IS NOT NULL
                ),
                CONSTRAINT "CHK_customer_order_email" CHECK (position('@' in "email") > 1),
                CONSTRAINT "CHK_customer_order_subtotal_non_negative" CHECK ("subtotal" >= 0),
                CONSTRAINT "PK_c70aef746523b2c4a0af0945209" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_customer_order_user_created" ON "customer_order" ("user_id", "created_at", "id")
        `);
    await queryRunner.query(`
            CREATE TABLE "order_item" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "position" smallint NOT NULL,
                "title" character varying(255) NOT NULL,
                "unit_price" integer NOT NULL,
                "quantity" integer NOT NULL,
                "line_total" integer NOT NULL,
                "order_id" uuid NOT NULL,
                "product_id" uuid,
                CONSTRAINT "UQ_order_item_position" UNIQUE ("order_id", "position"),
                CONSTRAINT "CHK_order_item_line_total" CHECK ("line_total" = "unit_price" * "quantity"),
                CONSTRAINT "CHK_order_item_unit_price_non_negative" CHECK ("unit_price" >= 0),
                CONSTRAINT "CHK_order_item_quantity_positive" CHECK ("quantity" > 0),
                CONSTRAINT "PK_d01158fe15b1ead5c26fd7f4e90" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_order_item_product" ON "order_item" ("product_id")
        `);
    await queryRunner.query(`
            ALTER TABLE "customer_order"
            ADD CONSTRAINT "FK_3ac7322dfcd8299d0b06dbdb554" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "order_item"
            ADD CONSTRAINT "FK_e9674a6053adbaa1057848cddfa" FOREIGN KEY ("order_id") REFERENCES "customer_order"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "order_item"
            ADD CONSTRAINT "FK_5e17c017aa3f5164cb2da5b1c6b" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "order_item" DROP CONSTRAINT "FK_5e17c017aa3f5164cb2da5b1c6b"
        `);
    await queryRunner.query(`
            ALTER TABLE "order_item" DROP CONSTRAINT "FK_e9674a6053adbaa1057848cddfa"
        `);
    await queryRunner.query(`
            ALTER TABLE "customer_order" DROP CONSTRAINT "FK_3ac7322dfcd8299d0b06dbdb554"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_order_item_product"
        `);
    await queryRunner.query(`
            DROP TABLE "order_item"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_customer_order_user_created"
        `);
    await queryRunner.query(`
            DROP TABLE "customer_order"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."order_status"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."shipping_method"
        `);
  }
}
