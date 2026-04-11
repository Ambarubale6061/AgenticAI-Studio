// backend/server.js
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Load env FIRST
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, ".env");

if (!fs.existsSync(envPath)) {
  console.error("❌ .env file not found at:", envPath);
  process.exit(1);
}

const result = dotenv.config({ path: envPath });
if (result.error) {
  console.error("❌ Failed to parse .env:", result.error);
  process.exit(1);
}

// Validate env
const requiredVars = ["PORT", "MONGO_URI", "GROQ_API_KEY", "SUPABASE_URL"];

const missing = requiredVars.filter((v) => !process.env[v]);

if (missing.length > 0) {
  console.error("❌ Missing environment variables:", missing.join(", "));
  process.exit(1);
}

console.log("✅ Environment loaded");

// Imports AFTER env load
import express from "express";
import cors from "cors";
import connectDB from "./config/db.js";

import agentRoutes from "./routes/agentRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import versionRoutes from "./routes/versionRoutes.js";

import { errorHandler } from "./middleware/errorMiddleware.js";

// Connect DB
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/agent", agentRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/versions", versionRoutes);

// Error handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
