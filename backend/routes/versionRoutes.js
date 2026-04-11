import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getVersions,
  createVersion,
  deleteVersion,
} from "../controllers/versionController.js";

const router = express.Router();

router.use(protect);

router.route("/:projectId/versions").get(getVersions).post(createVersion);
router.delete("/:versionId", deleteVersion);

export default router;
