import mongoose from "mongoose";

const memorySchema = new mongoose.Schema(
  {
    errorPattern: { type: String, required: true },
    fix: { type: String, required: true },
    language: { type: String, required: true },
    confidence: {
      type: String,
      enum: ["high", "medium", "low"],
      default: "medium",
    },
  },
  { timestamps: true },
);

export default mongoose.model("AgentMemory", memorySchema);
