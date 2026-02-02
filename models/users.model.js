import mongoose from "mongoose";

const userSchema = mongoose.Schema({
  displayName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    validate: {
      validator: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      message: "Invalid email address",
    },
  },
  profilePic: {
    type: String,
    default: null,
    required: false,
  },
  lastSeen: {
    type: Date,
    default: new Date(),
  },
  status: {
    type: String,
    required: true,
    trim: true,
    enum: ["offline", "online"],
    default: "offline",
  },
  toured: {
    type: Boolean,
    default: false,
  },
  resetPasswordToken: {
    type: String,
    default: null,
  },
  resetPasswordTokenExpDate: {
    type: Date,
    default: null,
  },
  meta: {
    unreadCount: {
      type: Number,
      default: 0,
    },
    lastMessage: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: "Message",
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const userModel = mongoose.model("User", userSchema);

export default userModel;
