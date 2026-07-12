import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { validate, validateParams, param } from "../lib/validate.js";
import { asyncHandler } from "../lib/errors.js";
import {
  createGroupSchema,
  inviteMemberSchema,
  groupIdParamSchema,
} from "../schemas/groups.js";
import * as groupsService from "../services/groups.js";

const router = Router();
router.use(requireAuth);

router.post(
  "/",
  validate(createGroupSchema),
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    const group = await groupsService.createGroup(userId, req.body.name);
    res.status(201).json({ group });
  }),
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    const groups = await groupsService.listGroups(userId);
    res.json({ groups });
  }),
);

router.get(
  "/:groupId",
  validateParams(groupIdParamSchema),
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    const result = await groupsService.getGroupDetail(
      param(req, "groupId"),
      userId,
    );
    res.json(result);
  }),
);

router.post(
  "/:groupId/invite",
  validateParams(groupIdParamSchema),
  validate(inviteMemberSchema),
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    const result = await groupsService.inviteMember(
      param(req, "groupId"),
      req.body.phone,
      userId,
    );
    res.status(201).json({ ok: true, ...result });
  }),
);

router.delete(
  "/:groupId/leave",
  validateParams(groupIdParamSchema),
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    await groupsService.leaveGroup(param(req, "groupId"), userId);
    res.json({ ok: true });
  }),
);

router.delete(
  "/:groupId",
  validateParams(groupIdParamSchema),
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    await groupsService.deleteGroup(param(req, "groupId"), userId);
    res.json({ ok: true });
  }),
);

export default router;
