import mongoose from "mongoose";
const { Schema } = mongoose;

const StatusSchema = new Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  publicId: {
    type: String,
    required: true,
  },
  url: { type: String, required: true },
  thumbUrl: { type: String },
  resourceType: {
    type: String,
    enum: ["image", "video"],
    default: "image",
  },
  caption: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, required: true, index: true },
  viewers: [{ type: mongoose.Schema.Types.ObjectId }],
});

const statusModel = mongoose.model("Status", StatusSchema);

export default statusModel;
