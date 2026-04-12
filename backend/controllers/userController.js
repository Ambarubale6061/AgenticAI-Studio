// backend/controllers/userController.js
// Avatar uploads: files are saved to the local filesystem under /uploads/avatars/.
// The public URL is constructed from BACKEND_PUBLIC_URL env var.
// For production you can swap this to S3 / Cloudinary by changing only this file.

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import User from "../models/User.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve uploads directory (project root / uploads / avatars)
const UPLOADS_DIR = path.join(__dirname, "..", "uploads", "avatars");

// Ensure the directory exists on startup
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ── GET /api/users/me ─────────────────────────────────────────────────────────
export const getProfile = async (req, res) => {
  try {
    // req.user is set by authMiddleware from the Supabase JWT
    let user = await User.findOne({ supabase_id: req.user.id });

    // Auto-create a profile record on first request after registration
    if (!user) {
      user = await User.create({
        supabase_id: req.user.id,
        email: req.user.email,
      });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/users/avatar ────────────────────────────────────────────────────
export const uploadAvatarHandler = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Build a unique filename: <supabase_user_id>_<timestamp>.<ext>
    const ext = req.file.originalname.split(".").pop() || "jpg";
    const filename = `${req.user.id}_${Date.now()}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);

    // Write buffer to disk
    fs.writeFileSync(filePath, req.file.buffer);

    // Build public URL
    const backendUrl = (
      process.env.BACKEND_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 5000}`
    ).replace(/\/+$/, "");
    const avatar_url = `${backendUrl}/uploads/avatars/${filename}`;

    // Upsert user record in MongoDB
    const user = await User.findOneAndUpdate(
      { supabase_id: req.user.id },
      { supabase_id: req.user.id, email: req.user.email, avatar_url },
      { upsert: true, new: true }
    );

    res.json({ avatar_url: user.avatar_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
