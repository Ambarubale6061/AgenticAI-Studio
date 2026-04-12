// backend/routes/userRoutes.js
import express from "express";
import { uploadAvatarHandler, getProfile } from "../controllers/userController.js";
import { protect } from "../middleware/authMiddleware.js";
import multer from "multer";

// Store uploads in memory (buffer) — we write to disk or cloud from there
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files are allowed"));
    } else {
      cb(null, true);
    }
  },
});

const router = express.Router();

router.use(protect);

// GET  /api/users/me          — get current user profile from MongoDB
router.get("/me", getProfile);

// POST /api/users/avatar      — upload avatar image
router.post("/avatar", upload.single("avatar"), uploadAvatarHandler);

export default router;
