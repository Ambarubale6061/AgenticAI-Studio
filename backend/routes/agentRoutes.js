import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  planner,
  coder,
  debuggerAgent,
  execute,
} from "../controllers/agentController.js";

const router = express.Router();

router.use(protect); // All agent routes require authentication

router.post("/planner", planner);
router.post("/coder", coder);
router.post("/debugger", debuggerAgent);
router.post("/execute", execute);

export default router;
