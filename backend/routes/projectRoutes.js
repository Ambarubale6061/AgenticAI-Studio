import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getProjectMessages,
  saveMessage,
} from "../controllers/projectController.js";

const router = express.Router();

router.use(protect);

router.route("/").get(getProjects).post(createProject);
router
  .route("/:id")
  .get(getProjectById)
  .put(updateProject)
  .delete(deleteProject);
router.get("/:projectId/messages", getProjectMessages);
router.post("/messages", saveMessage);

export default router;
