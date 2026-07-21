import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { hashToken, SESSION_COOKIE } from "./security.js";

export async function requireConfirmedOwner(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string") {
    return res.status(401).json({ message: "Authentication required" });
  }

  const session = await prisma.ownerSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { owner: true },
  });

  if (!session || session.expiresAt <= new Date()) {
    if (session) await prisma.ownerSession.delete({ where: { id: session.id } });
    return res.status(401).json({ message: "Session expired" });
  }
  if (!session.owner.approved) {
    return res.status(403).json({ message: "This owner account is not approved" });
  }

  res.locals.owner = session.owner;
  return next();
}
