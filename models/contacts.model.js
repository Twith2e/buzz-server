import mongoose from "mongoose";
const { Schema } = mongoose;

const ContactSchema = new Schema({
  owner: { type: mongoose.SchemaTypes.ObjectId, ref: "User", required: true },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    required: true,
    validate: {
      validator: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      message: "Invalid email address",
    },
  },
  localName: { type: String, required: true, trim: true },
  contactUser: {
    type: mongoose.SchemaTypes.ObjectId,
    ref: "User",
    default: null,
  },
  matchedAt: { type: Date, default: null },
  isBlocked: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

ContactSchema.index({ owner: 1, email: 1 }, { unique: true });
ContactSchema.index({ owner: 1, contactUser: 1 });

const contactModel = mongoose.model("Contact", ContactSchema);

export default contactModel;
