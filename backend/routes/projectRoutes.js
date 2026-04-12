// backend/routes/projectRoutes.js
import express from "express";
import {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getProjectMessages,
  saveMessage,
} from "../controllers/projectController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// All project routes are protected
router.use(protect);

// ── Projects ──────────────────────────────────────────────────────────────────
router.get("/", getProjects);
router.post("/", createProject);
router.get("/:id", getProjectById);
router.put("/:id", updateProject);
router.delete("/:id", deleteProject);

// ── Messages ──────────────────────────────────────────────────────────────────
// GET  /api/projects/:projectId/messages  — fetch all messages for a project
router.get("/:projectId/messages", getProjectMessages);

// POST /api/projects/messages             — save a new message
// Note: uses a flat path so the frontend can POST without knowing projectId
// separately (projectId is in the body as project_id).
router.post("/messages", saveMessage);

export default router;
