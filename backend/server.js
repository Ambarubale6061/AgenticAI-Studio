// backend/server.js
// The backend now only handles AI agent routes (Planner, Coder, Debugger, Executor).
// All project/message data is stored in Supabase and accessed directly from
// the frontend. MongoDB, project routes, and auth middleware are removed.

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";

import agentRoutes from "./routes/agentRoutes.js";
import { errorHandler } from "./middleware/errorMiddleware.js";

const app = express();

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:3000",
  process.env.FRONTEND_URL, // e.g. https://agentic-ai-studio-chi.vercel.app
  process.env.FRONTEND_URL_2, // optional second URL
].filter(Boolean);

console.log("✅ CORS allowed origins:", allowedOrigins);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      console.warn(`⛔ CORS blocked origin: ${origin}`);
      return callback(new Error(`CORS not allowed for origin: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// ─── Body parser ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));

// ─── Routes ───────────────────────────────────────────────────────────────────
// Only agent routes remain. Projects and messages are in Supabase (frontend).
app.use("/api/agent", agentRoutes);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "OK", message: "Backend running" });
});

// ─── 404 catch-all ────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
