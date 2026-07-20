import { Router, type Request, type Response } from "express";
import { compare, hash } from "bcryptjs";
import rateLimit from "express-rate-limit";
import { prisma } from "../db/prisma.js";
import {
  createToken,
  hashToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  sessionCookieOptions,
} from "../auth/security.js";

const authRouter = Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });

authRouter.use(limiter);

function publicOwner(owner: { id: string; name: string; email: string; emailVerifiedAt: Date | null; approved: boolean }) {
  return {
    id: owner.id,
    name: owner.name,
    email: owner.email,
    confirmed: Boolean(owner.emailVerifiedAt),
    approved: owner.approved,
  };
}

async function createSession(ownerId: string, res: Response) {
  const token = createToken();
  await prisma.ownerSession.create({
    data: {
      ownerId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS),
    },
  });
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

authRouter.post("/register", async (req: Request, res: Response) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!name) return res.status(400).json({ message: "Name is required" });
  if (!emailPattern.test(email)) return res.status(400).json({ message: "Enter a valid email address" });
  if (password.length < 10) return res.status(400).json({ message: "Password must contain at least 10 characters" });

  const existing = await prisma.shopOwner.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ message: "An account already exists for this email" });

  const verificationToken = createToken();
  const owner = await prisma.shopOwner.create({
    data: {
      name,
      email,
      passwordHash: await hash(password, 12),
      verificationTokens: {
        create: {
          tokenHash: hashToken(verificationToken),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      },
    },
  });

  const clientOrigin = process.env.ORIGIN ?? "http://localhost:5173";
  const confirmationUrl = `${clientOrigin}/confirm-email?token=${encodeURIComponent(verificationToken)}`;
  console.info(`Email confirmation for ${email}: ${confirmationUrl}`);

  return res.status(201).json({
    message: "Account created. Confirm your email before signing in.",
    owner: publicOwner(owner),
    ...(process.env.NODE_ENV !== "production" ? { confirmationUrl } : {}),
  });
});

authRouter.post("/confirm-email", async (req: Request, res: Response) => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  if (!token) return res.status(400).json({ message: "Confirmation token is required" });

  const verification = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { owner: true },
  });
  if (!verification || verification.expiresAt <= new Date()) {
    return res.status(400).json({ message: "This confirmation link is invalid or expired" });
  }

  const owner = await prisma.$transaction(async (tx) => {
    const updated = await tx.shopOwner.update({
      where: { id: verification.ownerId },
      data: { emailVerifiedAt: new Date() },
    });
    await tx.emailVerificationToken.deleteMany({ where: { ownerId: verification.ownerId } });
    return updated;
  });
  await createSession(owner.id, res);
  return res.json({ owner: publicOwner(owner) });
});

authRouter.post("/login", async (req: Request, res: Response) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const owner = await prisma.shopOwner.findUnique({ where: { email } });

  if (!owner || !(await compare(password, owner.passwordHash))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  if (!owner.emailVerifiedAt) return res.status(403).json({ message: "Confirm your email before signing in" });
  if (!owner.approved) return res.status(403).json({ message: "This owner account is not approved" });

  await createSession(owner.id, res);
  return res.json({ owner: publicOwner(owner) });
});

authRouter.post("/logout", async (req: Request, res: Response) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string") {
    await prisma.ownerSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(), maxAge: undefined });
  return res.status(204).send();
});

authRouter.get("/session", async (req: Request, res: Response) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string") return res.json({ owner: null });

  const session = await prisma.ownerSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { owner: true },
  });
  if (!session || session.expiresAt <= new Date() || !session.owner.emailVerifiedAt || !session.owner.approved) {
    return res.json({ owner: null });
  }
  return res.json({ owner: publicOwner(session.owner) });
});

export default authRouter;
