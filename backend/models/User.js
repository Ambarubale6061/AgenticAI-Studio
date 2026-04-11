import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    supabase_id: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    name: { type: String },
    avatar_url: { type: String },
  },
  { timestamps: true },
);

export default mongoose.model("User", userSchema);
