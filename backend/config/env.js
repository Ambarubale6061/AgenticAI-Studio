// backend/config/env.js
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, "..", ".env");

// Load .env
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.warn("⚠️ .env file not found, using process.env");
}

// ✅ Only required env
export const SUPABASE_URL = process.env.SUPABASE_URL;
export const PORT = process.env.PORT || 5000;
export const MONGO_URI = process.env.MONGO_URI;
export const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Validate
const requiredVars = ["SUPABASE_URL", "MONGO_URI", "GROQ_API_KEY"];

const missing = requiredVars.filter((v) => !process.env[v]);

if (missing.length > 0) {
  console.error("❌ Missing environment variables:", missing.join(", "));
  process.exit(1);
}

console.log("✅ Environment loaded successfully");
