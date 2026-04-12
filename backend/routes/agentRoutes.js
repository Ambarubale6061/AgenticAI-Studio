// backend/routes/agentRoutes.js
import express from "express";
import {
  planner,
  coder,
  debuggerAgent,
  execute,
} from "../controllers/agentController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// All agent routes require a valid Supabase JWT
router.use(protect);

router.post("/planner", planner);
router.post("/coder", coder);
router.post("/debugger", debuggerAgent);
router.post("/execute", execute);

export default router;
