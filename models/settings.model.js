import mongoose from "mongoose";
const { Schema } = mongoose;

const SettingSchema = new Schema({
  userId: { type: mongoose.SchemaTypes.ObjectId, ref: "User", required: true },
  notification: { type: Boolean, default: true },
  theme: { type: String, enum: ["dark", "light", "system"], default: "dark" },
  language: {
    type: String,
    enum: ["en", "fr", "es", "de", "it", "pt", "ru", "ja", "zh", "ko"],
    default: "en",
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const settingModel = mongoose.model("Setting", SettingSchema);

export default settingModel;
