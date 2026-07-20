CREATE TABLE "ShopOwner" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShopOwner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OwnerSession" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerId" UUID NOT NULL,
    CONSTRAINT "OwnerSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailVerificationToken" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerId" UUID NOT NULL,
    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopOwner_email_key" ON "ShopOwner"("email");
CREATE UNIQUE INDEX "OwnerSession_tokenHash_key" ON "OwnerSession"("tokenHash");
CREATE INDEX "OwnerSession_ownerId_idx" ON "OwnerSession"("ownerId");
CREATE INDEX "OwnerSession_expiresAt_idx" ON "OwnerSession"("expiresAt");
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE INDEX "EmailVerificationToken_ownerId_idx" ON "EmailVerificationToken"("ownerId");
CREATE INDEX "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");
ALTER TABLE "OwnerSession" ADD CONSTRAINT "OwnerSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "ShopOwner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "ShopOwner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
