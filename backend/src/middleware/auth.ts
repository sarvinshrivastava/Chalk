import type { Request, Response, NextFunction } from "express";
import { createUserClient } from "../lib/supabase.js";

export interface AuthRequest extends Request {
  userId: string;
  accessToken: string;
}

/**
 * Extracts Bearer token, verifies with Supabase, attaches userId to request.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = header.slice(7);
  const supabase = createUserClient(token);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  (req as AuthRequest).userId = data.user.id;
  (req as AuthRequest).accessToken = token;
  next();
}
