import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true },
    title: { type: String, default: "Untitled Project" },
    description: { type: String, default: "" },
    language: { type: String, default: "javascript" },
    status: { type: String, default: "active" },
    plan: { type: Array, default: [] },
    generated_code: { type: Array, default: [] },
    console_output: { type: Array, default: [] },
  },
  { timestamps: true },
);

// Transform _id to id for frontend compatibility
projectSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
  },
});

export default mongoose.model("Project", projectSchema);
