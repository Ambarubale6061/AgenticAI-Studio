import mongoose from "mongoose";

const versionSchema = new mongoose.Schema(
  {
    project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    label: { type: String },
    files: { type: Array, required: true },
  },
  { timestamps: true },
);

export default mongoose.model("Version", versionSchema);
