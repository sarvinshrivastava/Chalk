import type { Request, Response, NextFunction } from "express";
import { createUserClient } from "../lib/supabase.js";
import { AppError } from "../lib/errors.js";

export interface AuthRequest extends Request {
  userId: string;
  accessToken: string;
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(
      new AppError(
        401,
        "Missing or invalid Authorization header",
        "AUTH_MISSING",
      ),
    );
  }

  const token = header.slice(7);

  try {
    const supabase = createUserClient(token);
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return next(
        new AppError(401, "Invalid or expired token", "AUTH_INVALID"),
      );
    }

    (req as AuthRequest).userId = data.user.id;
    (req as AuthRequest).accessToken = token;
    next();
  } catch {
    next(new AppError(401, "Authentication failed", "AUTH_FAILED"));
  }
}
