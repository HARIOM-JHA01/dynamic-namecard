import "dotenv/config";

const required = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
};

export const config = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGO_URI || "mongodb://mongo:27017/dynamic-namecard",
  jwtSecret: required("JWT_SECRET"),
  adminUsername: process.env.ADMIN_USERNAME || "",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  originalsDir: process.env.ORIGINALS_DIR || "/data/originals",
  videoCrf: Number(process.env.VIDEO_CRF || 26),
  staticDir: process.env.STATIC_DIR || "/app/public",
  uploadDir: process.env.UPLOAD_DIR || "/data/uploads",
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 200),
  defaultCreateLink: process.env.DEFAULT_CREATE_LINK || "https://t.me/AddmycoBot",
  defaultContactEmail: process.env.DEFAULT_CONTACT_EMAIL || "Office@addmy.co",
};
