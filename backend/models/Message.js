import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    user_id: { type: String, required: true },
    role: { type: String, enum: ["user", "assistant"], required: true },
    agent: { type: String },
    content: { type: String, required: true },
  },
  { timestamps: true },
);

messageSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
  },
});

export default mongoose.model("Message", messageSchema);
