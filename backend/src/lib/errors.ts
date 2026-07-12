import type { Request, Response, NextFunction } from "express";
import { Prisma } from "../generated/prisma/client.js";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

/**
 * Map known Prisma error codes to AppError.
 * P2002 → 409 Conflict (unique constraint)
 * P2025 → 404 Not Found (record not found)
 */
export function mapPrismaError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        throw new AppError(409, "Resource already exists", "CONFLICT");
      case "P2025":
        throw new AppError(404, "Resource not found", "NOT_FOUND");
    }
  }
  throw error;
}

/** Wraps an async operation with Prisma error mapping. */
export async function withPrismaErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    mapPrismaError(error);
  }
}
