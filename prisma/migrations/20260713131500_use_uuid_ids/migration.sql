-- Add UUID columns alongside the existing integer identifiers.
ALTER TABLE "Product" ADD COLUMN "uuid_id" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "Customer" ADD COLUMN "uuid_id" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "Order" ADD COLUMN "uuid_id" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "Order" ADD COLUMN "uuid_productId" UUID;
ALTER TABLE "Order" ADD COLUMN "uuid_customerId" UUID;

-- Preserve existing order relationships while translating their identifiers.
UPDATE "Order" AS orders
SET "uuid_productId" = products."uuid_id"
FROM "Product" AS products
WHERE orders."productId" = products."id";

UPDATE "Order" AS orders
SET "uuid_customerId" = customers."uuid_id"
FROM "Customer" AS customers
WHERE orders."customerId" = customers."id";

ALTER TABLE "Order" ALTER COLUMN "uuid_productId" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "uuid_customerId" SET NOT NULL;

-- Remove constraints that depend on the old integer identifiers.
ALTER TABLE "Order" DROP CONSTRAINT "Order_productId_fkey";
ALTER TABLE "Order" DROP CONSTRAINT "Order_customerId_fkey";
ALTER TABLE "Order" DROP CONSTRAINT "Order_pkey";
ALTER TABLE "Product" DROP CONSTRAINT "Product_pkey";
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_pkey";

-- Replace the integer columns with their UUID equivalents.
ALTER TABLE "Order" DROP COLUMN "id";
ALTER TABLE "Order" DROP COLUMN "productId";
ALTER TABLE "Order" DROP COLUMN "customerId";
ALTER TABLE "Product" DROP COLUMN "id";
ALTER TABLE "Customer" DROP COLUMN "id";

ALTER TABLE "Order" RENAME COLUMN "uuid_id" TO "id";
ALTER TABLE "Order" RENAME COLUMN "uuid_productId" TO "productId";
ALTER TABLE "Order" RENAME COLUMN "uuid_customerId" TO "customerId";
ALTER TABLE "Product" RENAME COLUMN "uuid_id" TO "id";
ALTER TABLE "Customer" RENAME COLUMN "uuid_id" TO "id";

-- Restore primary keys and relations using UUIDs.
ALTER TABLE "Product" ADD CONSTRAINT "Product_pkey" PRIMARY KEY ("id");
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_pkey" PRIMARY KEY ("id");
ALTER TABLE "Order" ADD CONSTRAINT "Order_pkey" PRIMARY KEY ("id");
ALTER TABLE "Order" ADD CONSTRAINT "Order_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
