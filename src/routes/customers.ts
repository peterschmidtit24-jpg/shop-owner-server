import { Router, type Request, type Response } from "express";
import { prisma } from "../db/prisma.js";

const customersRouter = Router();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function getCustomers(_req: Request, res: Response) {
  try {
    const customers = await prisma.customer.findMany({
      include: {
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(customers);
  } catch (error) {
    console.error("Failed to get customers:", error);
    return res.status(500).json({ message: "Failed to get customers" });
  }
}

async function updateCustomer(req: Request, res: Response) {
  const customerId = req.params.customerId;

  if (typeof customerId !== "string" || !uuidPattern.test(customerId)) {
    return res.status(400).json({ message: "Invalid customer ID" });
  }

  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ message: "A JSON body is required" });
  }

  const { name, email } = req.body;
  const data: { name?: string; email?: string | null } = {};

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({ message: "name must not be empty" });
    }
    data.name = name.trim();
  }

  if (email !== undefined) {
    if (email !== null && typeof email !== "string") {
      return res.status(400).json({ message: "email must be a string or null" });
    }

    const normalizedEmail = typeof email === "string" ? email.trim() : "";
    if (normalizedEmail && !emailPattern.test(normalizedEmail)) {
      return res.status(400).json({ message: "email must be a valid email address" });
    }
    data.email = normalizedEmail || null;
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: "Provide a name or email to update" });
  }

  try {
    const customer = await prisma.customer.update({
      where: { id: customerId },
      data,
      include: { _count: { select: { orders: true } } },
    });

    return res.json(customer);
  } catch (error) {
    if (hasPrismaErrorCode(error, "P2025")) {
      return res.status(404).json({ message: "Customer not found" });
    }
    if (hasPrismaErrorCode(error, "P2002")) {
      return res.status(409).json({ message: "That email address is already used by another customer" });
    }

    console.error("Failed to update customer:", error);
    return res.status(500).json({ message: "Failed to update customer" });
  }
}

function hasPrismaErrorCode(error: unknown, code: string): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

customersRouter.get("/", getCustomers);
customersRouter.patch("/:customerId", updateCustomer);

export default customersRouter;
