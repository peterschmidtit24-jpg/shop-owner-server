/**
 * Shared database connection for the server.
 *
 * The module reads DATABASE_URL, configures Prisma's PostgreSQL adapter, and
 * exports one Prisma Client instance for all route modules. Reusing one client
 * avoids creating a new database connection pool for every request.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;

// Fail during startup instead of allowing requests to fail later with a less
// useful database connection error.
if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const adapter = new PrismaPg({ connectionString });

/** Prisma client used by the application's product, order, and customer routes. */
export const prisma = new PrismaClient({ adapter });
