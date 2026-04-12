// backend/routes/versionRoutes.js
import express from "express";
import {
  getVersions,
  createVersion,
  deleteVersion,
} from "../controllers/versionController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

// GET  /api/versions/:projectId      — list versions for a project
// POST /api/versions/:projectId      — create a new version snapshot
// DELETE /api/versions/:versionId    — delete a specific version
router.get("/:projectId", getVersions);
router.post("/:projectId", createVersion);
router.delete("/:versionId", deleteVersion);

export default router;
