import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);

const videoSchema = new mongoose.Schema(
  {
    title: { type: String, default: "", trim: true },
    // Compressed, publicly served file ("" until processing finishes).
    filename: { type: String, default: "" },
    // Untouched upload, kept in a private directory and never deleted by compression.
    originalFilename: { type: String, default: "" },
    originalName: { type: String, default: "" },
    originalSize: { type: Number, default: 0 },
    size: { type: Number, default: 0 },
    // Legacy documents (created before compression existed) default to "ready".
    status: { type: String, enum: ["processing", "ready", "failed"], default: "ready", index: true },
    error: { type: String, default: "" },
    // Go live automatically once processing finishes.
    makeLive: { type: Boolean, default: false },
    // Where the landing page sends visitors when this video ends (optional).
    linkUrl: { type: String, default: "" },
    isActive: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

// Site-wide button targets, independent of any video (single document).
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "buttons", unique: true },
    createLink: { type: String, required: true },
    contactEmail: { type: String, required: true },
  },
  { timestamps: true },
);

export const Settings = mongoose.model("Settings", settingsSchema);
export const Admin = mongoose.model("Admin", adminSchema);
export const Video = mongoose.model("Video", videoSchema);
