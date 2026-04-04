import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { validate, validateParams } from "../lib/validate.js";
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
    const { userId, accessToken } = req as AuthRequest;
    const group = await groupsService.createGroup(
      userId,
      accessToken,
      req.body.name,
    );
    res.status(201).json({ group });
  }),
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { accessToken } = req as AuthRequest;
    const groups = await groupsService.listGroups(accessToken);
    res.json({ groups });
  }),
);

router.get(
  "/:groupId",
  validateParams(groupIdParamSchema),
  asyncHandler(async (req, res) => {
    const { accessToken } = req as AuthRequest;
    // Safe cast: validateParams(groupIdParamSchema) guarantees groupId is a valid UUID string
    const result = await groupsService.getGroupDetail(
      req.params.groupId as string,
      accessToken,
    );
    res.json(result);
  }),
);

router.post(
  "/:groupId/invite",
  validateParams(groupIdParamSchema),
  validate(inviteMemberSchema),
  asyncHandler(async (req, res) => {
    const { accessToken } = req as AuthRequest;
    // Safe cast: validateParams(groupIdParamSchema) guarantees groupId is a valid UUID string
    const result = await groupsService.inviteMember(
      req.params.groupId as string,
      req.body.phone,
      accessToken,
    );
    res.status(201).json({ ok: true, ...result });
  }),
);

router.delete(
  "/:groupId/leave",
  validateParams(groupIdParamSchema),
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    // Safe cast: validateParams(groupIdParamSchema) guarantees groupId is a valid UUID string
    await groupsService.leaveGroup(req.params.groupId as string, userId);
    res.json({ ok: true });
  }),
);

router.delete(
  "/:groupId",
  validateParams(groupIdParamSchema),
  asyncHandler(async (req, res) => {
    const { accessToken } = req as AuthRequest;
    // Safe cast: validateParams(groupIdParamSchema) guarantees groupId is a valid UUID string
    await groupsService.deleteGroup(req.params.groupId as string, accessToken);
    res.json({ ok: true });
  }),
);

export default router;
