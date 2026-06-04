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

// ── CORS CONFIG (FULLY FIXED FOR LATEST DEPLOYMENTS) ────────────────
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8080",
  "https://agentic-ai-studio-chi.vercel.app", // तुमची लाईव्ह फ्रंटएंड लिंक
  process.env.FRONTEND_URL,
].filter(Boolean);

// Main CORS middleware
app.use(
  cors({
    origin: function (origin, callback) {
      // Postman किंवा थेट सर्व्हर-टू-सर्व्हर रिक्वेस्टला परवानगी देण्यासाठी
      if (!origin) return callback(null, true);

      // जर ओरिजिन लिस्टमध्ये असेल तर अलाऊ करा
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Vercel च्या काही सब-डोमेन्स किंवा बदललेल्या लिंक्स सुरक्षित हाताळण्यासाठी
      if (origin.endsWith(".vercel.app")) {
        return callback(null, true);
      }

      console.log("❌ Blocked by CORS:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
    ],
  }),
);

// ── HANDLE PREFLIGHT REQUESTS ──────────────────────
// प्रिफ्लाइट रिक्वेस्ट ब्राउझर आधी पाठवतो, त्याला इथूनच '204 No Content' ने रिस्पॉन्स दिला जाईल
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
    message: "Backend is running smoothly!",
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
