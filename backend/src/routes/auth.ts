import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { validate } from "../lib/validate.js";
import { asyncHandler } from "../lib/errors.js";
import {
  emailSignupSchema,
  emailSigninSchema,
  oauthSigninSchema,
  refreshSchema,
  updateProfileSchema,
} from "../schemas/auth.js";
import * as authService from "../services/auth.js";

const router = Router();

router.post(
  "/signup/email",
  validate(emailSignupSchema),
  asyncHandler(async (req, res) => {
    const { email, password, name } = req.body;
    const result = await authService.signUpWithEmail(email, password, name);
    res.status(201).json(result);
  }),
);

router.post(
  "/signin/email",
  validate(emailSigninSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const result = await authService.signInWithEmail(email, password);
    res.json(result);
  }),
);

router.post(
  "/signin/oauth",
  validate(oauthSigninSchema),
  asyncHandler(async (req, res) => {
    const { access_token, provider, name } = req.body;
    const result = await authService.signInWithOAuth(
      access_token,
      provider,
      name,
    );
    res.json(result);
  }),
);

router.post(
  "/refresh",
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.refreshSession(req.body.refresh_token);
    res.json(result);
  }),
);

router.post(
  "/signout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { accessToken } = req as AuthRequest;
    await authService.signOut(accessToken);
    res.json({ ok: true });
  }),
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    const user = await authService.getProfile(userId);
    res.json({ user });
  }),
);

router.patch(
  "/me",
  requireAuth,
  validate(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    const user = await authService.updateProfile(userId, req.body);
    res.json({ user });
  }),
);

export default router;
