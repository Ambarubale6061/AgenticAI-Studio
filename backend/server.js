// backend/server.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import connectDB from "./config/db.js";
import projectRoutes from "./routes/projectRoutes.js";
import agentRoutes from "./routes/agentRoutes.js";
import versionRoutes from "./routes/versionRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import { errorHandler } from "./middleware/errorMiddleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── DB CONNECT ─────────────────────────────────────
connectDB();

const app = express();

// ── CORS CONFIG (FIXED) ────────────────────────────
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8080",
  process.env.FRONTEND_URL,
].filter(Boolean);

// Main CORS middleware
app.use(
  cors({
    origin: function (origin, callback) {
      // allow tools like Postman
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.log("❌ Blocked by CORS:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// ── HANDLE PREFLIGHT REQUESTS ──────────────────────
app.options("*", cors());

// ── BODY PARSER ────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── STATIC FILES ───────────────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── ROUTES ─────────────────────────────────────────
app.use("/api/projects", projectRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/versions", versionRoutes);
app.use("/api/users", userRoutes);

// ── HEALTH CHECK ───────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
  });
});

// ── GLOBAL ERROR HANDLER ───────────────────────────
app.use(errorHandler);

// ── SERVER START ────────────────────────────────────
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`✅ Allowed CORS origins:`, allowedOrigins);
});
