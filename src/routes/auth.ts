import { Router, type Request, type Response } from "express";
import { compare, hash } from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import { prisma } from "../db/prisma.js";
import {
  createToken,
  hashToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  sessionCookieOptions,
} from "../auth/security.js";

const authRouter = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });

authRouter.use(limiter);

function publicOwner(owner: { id: string; name: string; approved: boolean }) {
  return {
    id: owner.id,
    name: owner.name,
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
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!name) return res.status(400).json({ message: "Name is required" });
  if (password.length < 10) return res.status(400).json({ message: "Password must contain at least 10 characters" });

  const existing = await prisma.shopOwner.findFirst({ where: { name } });
  if (existing) return res.status(409).json({ message: "An account already exists for this name" });

  const owner = await prisma.shopOwner.create({
    data: {
      name,
      email: `${createToken()}@local.invalid`,
      passwordHash: await hash(password, 12),
    },
  });
  await createSession(owner.id, res);
  return res.status(201).json({ owner: publicOwner(owner) });
});

authRouter.post("/login", async (req: Request, res: Response) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const owner = await prisma.shopOwner.findFirst({ where: { name } });

  if (!owner || !(await compare(password, owner.passwordHash))) {
    return res.status(401).json({ message: "Invalid name or password" });
  }
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
  if (!session || session.expiresAt <= new Date() || !session.owner.approved) {
    return res.json({ owner: null });
  }
  return res.json({ owner: publicOwner(session.owner) });
});

export default authRouter;
