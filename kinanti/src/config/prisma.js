// src/config/prisma.js
// Prisma client singleton (aman untuk hot-reload dev di Next.js).
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__kinanti_prisma__ ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__kinanti_prisma__ = prisma;
}

export default prisma;
