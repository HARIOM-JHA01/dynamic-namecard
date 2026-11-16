import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import multer from "multer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { Admin, Settings, Video } from "./models.js";

fs.mkdirSync(config.uploadDir, { recursive: true });
fs.mkdirSync(config.originalsDir, { recursive: true });

const app = express();
app.set("trust proxy", 1);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // The page is served by this app, so keep helmet's default CSP, minus
    // upgrade-insecure-requests (it would break plain-http local testing;
    // production is https via the host's nginx anyway).
    contentSecurityPolicy: { useDefaults: true, directives: { "upgrade-insecure-requests": null } },
  }),
);
app.use(cors());
app.use(express.json({ limit: "100kb" }));

// ---------- validation helpers ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only http(s) links are allowed (blocks javascript: and other schemes). */
const validLink = (v) => {
  try {
    const u = new URL(String(v).trim());
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
};

/** Returns an error message, or null. Empty values are allowed only where `optional`. */
const checkLink = (v, label, optional = false) => {
  if (optional && String(v ?? "").trim() === "") return null;
  return validLink(v) ? null : `${label} must be a valid http(s) URL`;
};
const checkEmail = (v) =>
  EMAIL_RE.test(String(v ?? "").trim()) ? null : "Contact email is not a valid email address";

// ---------- auth ----------
const signToken = (admin) =>
  jwt.sign({ sub: String(admin._id), u: admin.username }, config.jwtSecret, {
    expiresIn: "12h",
  });

const requireAdmin = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });
  try {
    req.admin = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts, try again later" },
});

app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string")
    return res.status(400).json({ success: false, message: "Username and password required" });
  const admin = await Admin.findOne({ username: username.trim() });
  // compare even when missing to keep timing similar
  const hash = admin?.passwordHash || "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv";
  const ok = await bcrypt.compare(password, hash);
  if (!admin || !ok)
    return res.status(401).json({ success: false, message: "Invalid credentials" });
  res.json({ success: true, token: signToken(admin), username: admin.username });
});

// ---------- uploads ----------
const ALLOWED = new Map([
  ["video/mp4", ".mp4"],
  ["video/webm", ".webm"],
  ["video/quicktime", ".mov"],
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: config.originalsDir,
    filename: (_req, file, cb) =>
      cb(null, `${crypto.randomUUID()}${ALLOWED.get(file.mimetype) || ".bin"}`),
  }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    ALLOWED.has(file.mimetype)
      ? cb(null, true)
      : cb(new Error("Only MP4, WebM or MOV videos are allowed")),
});

const removeFrom = (dir, filename) =>
  filename
    ? fs.promises.unlink(path.join(dir, path.basename(filename))).catch(() => {})
    : Promise.resolve();

const serialize = (v) => ({
  _id: v._id,
  title: v.title,
  videoUrl: v.filename ? `/uploads/${v.filename}` : "",
  linkUrl: v.linkUrl || "",
  isActive: v.isActive,
  status: v.status,
  error: v.error || "",
  size: v.size,
  originalSize: v.originalSize || 0,
  createdAt: v.createdAt,
});

// ---------- compression (ffmpeg) ----------
// H.264 + AAC MP4 with faststart (playback begins before the full download),
// height capped at 1280px. Plays on every browser, including iOS Safari.
const running = new Map(); // video id -> ffmpeg child, so delete can cancel it

const transcode = (id, input, output) =>
  new Promise((resolve, reject) => {
    const args = [
      "-y", "-i", input,
      "-map", "0:v:0", "-map", "0:a:0?",
      "-vf", "scale=-2:min(1280\\,ih),format=yuv420p",
      "-c:v", "libx264", "-preset", "medium", "-crf", String(config.videoCrf),
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      "-sn", "-dn",
      output,
    ];
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    running.set(String(id), child);
    let tail = "";
    child.stderr.on("data", (d) => { tail = (tail + d).slice(-600); });
    const timer = setTimeout(() => child.kill("SIGKILL"), 20 * 60 * 1000);
    child.on("error", (e) => { clearTimeout(timer); running.delete(String(id)); reject(e); });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      running.delete(String(id));
      if (code === 0) return resolve();
      reject(new Error(signal ? `ffmpeg stopped (${signal})` : `ffmpeg exited ${code}: ${tail.trim().split("\n").pop()}`));
    });
  });

const processVideo = async (id) => {
  const v = await Video.findById(id);
  if (!v || v.status !== "processing") return;
  const input = path.join(config.originalsDir, path.basename(v.originalFilename));
  const outName = `${crypto.randomUUID()}.mp4`;
  const output = path.join(config.uploadDir, outName);
  try {
    await transcode(id, input, output);
    const { size } = await fs.promises.stat(output);
    const fresh = await Video.findById(id);
    if (!fresh) return removeFrom(config.uploadDir, outName); // deleted meanwhile
    fresh.filename = outName;
    fresh.size = size;
    fresh.status = "ready";
    fresh.error = "";
    if (fresh.makeLive) {
      await Video.updateMany({ isActive: true }, { isActive: false });
      fresh.isActive = true;
      fresh.makeLive = false;
    }
    await fresh.save();
    console.log(`Video ${id} ready: ${v.originalSize} -> ${size} bytes`);
  } catch (err) {
    await removeFrom(config.uploadDir, outName);
    if (!(await Video.exists({ _id: id }))) return; // deleted/cancelled
    console.error(`Video ${id} failed:`, err.message);
    await Video.findByIdAndUpdate(id, {
      status: "failed",
      error: String(err.message).slice(0, 300),
    });
  }
};

// One job at a time keeps CPU/RAM predictable on a small VPS.
let queue = Promise.resolve();
const enqueue = (id) => {
  queue = queue.then(() => processVideo(id)).catch((e) => console.error(e));
};

const getButtons = async () => {
  const s = await Settings.findOne({ key: "buttons" });
  return {
    createLink: s?.createLink || config.defaultCreateLink,
    contactEmail: s?.contactEmail || config.defaultContactEmail,
  };
};

// Serve uploaded videos (static handler supports Range requests for seeking).
app.use(
  "/uploads",
  express.static(config.uploadDir, { index: false, dotfiles: "deny", maxAge: "7d", immutable: true }),
);

// ---------- public ----------
// One call for the landing page: the active video (+ its own link) and the
// site-wide button targets, kept as separate objects.
app.get("/api/landing", async (_req, res) => {
  const [v, buttons] = await Promise.all([
    // $nin (not equality) so legacy documents without a status field still match
    Video.findOne({ isActive: true, status: { $nin: ["processing", "failed"] } }).sort({ updatedAt: -1 }),
    getButtons(),
  ]);
  res.json({
    success: true,
    video: v ? { videoUrl: `/uploads/${v.filename}`, linkUrl: v.linkUrl || "", title: v.title } : null,
    buttons,
  });
});

// ---------- admin ----------
const admin = express.Router();
admin.use(requireAdmin);

admin.get("/videos", async (_req, res) => {
  const videos = await Video.find().sort({ createdAt: -1 });
  res.json({ success: true, data: videos.map(serialize) });
});

admin.post("/videos", upload.single("video"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ success: false, message: "Video file is required" });

  const linkUrl = String(req.body.linkUrl || "").trim();
  const err = checkLink(linkUrl, "Video link", true);
  if (err) {
    await removeFrom(config.originalsDir, file.filename);
    return res.status(400).json({ success: false, message: err });
  }

  // The original is kept as-is; a compressed copy is produced in the background.
  const video = await Video.create({
    title: String(req.body.title || "").trim().slice(0, 120),
    originalFilename: file.filename,
    originalName: file.originalname,
    originalSize: file.size,
    linkUrl,
    status: "processing",
    makeLive: req.body.setActive !== "false",
  });
  enqueue(video._id);
  res.status(202).json({ success: true, data: serialize(video) });
});

admin.post("/videos/:id/retry", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id))
    return res.status(404).json({ success: false, message: "Not found" });
  const video = await Video.findById(req.params.id);
  if (!video) return res.status(404).json({ success: false, message: "Not found" });
  if (video.status !== "failed" || !video.originalFilename)
    return res.status(409).json({ success: false, message: "Only failed videos can be retried" });
  video.status = "processing";
  video.error = "";
  await video.save();
  enqueue(video._id);
  res.json({ success: true, data: serialize(video) });
});

admin.patch("/videos/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id))
    return res.status(404).json({ success: false, message: "Not found" });
  const { title, linkUrl } = req.body || {};
  if (linkUrl !== undefined) {
    const err = checkLink(linkUrl, "Video link", true);
    if (err) return res.status(400).json({ success: false, message: err });
  }
  const update = {};
  if (typeof title === "string") update.title = title.trim().slice(0, 120);
  if (linkUrl !== undefined) update.linkUrl = String(linkUrl).trim();
  const video = await Video.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!video) return res.status(404).json({ success: false, message: "Not found" });
  res.json({ success: true, data: serialize(video) });
});

admin.post("/videos/:id/activate", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id))
    return res.status(404).json({ success: false, message: "Not found" });
  const video = await Video.findById(req.params.id);
  if (!video) return res.status(404).json({ success: false, message: "Not found" });
  if (video.status !== "ready")
    return res.status(409).json({ success: false, message: "Video is not ready yet" });
  await Video.updateMany({ isActive: true }, { isActive: false });
  video.isActive = true;
  await video.save();
  res.json({ success: true, data: serialize(video) });
});

admin.delete("/videos/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id))
    return res.status(404).json({ success: false, message: "Not found" });
  const video = await Video.findByIdAndDelete(req.params.id);
  if (!video) return res.status(404).json({ success: false, message: "Not found" });
  running.get(String(video._id))?.kill("SIGKILL");
  await removeFrom(config.uploadDir, video.filename);
  await removeFrom(config.originalsDir, video.originalFilename);
  res.json({ success: true });
});

// Site-wide button settings (separate from videos).
admin.get("/settings", async (_req, res) => {
  res.json({
    success: true,
    data: await getButtons(),
    defaults: { createLink: config.defaultCreateLink, contactEmail: config.defaultContactEmail },
  });
});

admin.put("/settings", async (req, res) => {
  const { createLink, contactEmail } = req.body || {};
  const err = checkLink(createLink, "Create link") || checkEmail(contactEmail);
  if (err) return res.status(400).json({ success: false, message: err });
  await Settings.findOneAndUpdate(
    { key: "buttons" },
    { key: "buttons", createLink: String(createLink).trim(), contactEmail: String(contactEmail).trim() },
    { upsert: true },
  );
  res.json({ success: true, data: await getButtons() });
});

app.use("/api/admin", admin);
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ---------- frontend (built React app) ----------
// Served from this container so the repo needs no web-server config; the host's
// nginx only has to proxy to this app and terminate TLS.
if (fs.existsSync(path.join(config.staticDir, "index.html"))) {
  app.use(
    express.static(config.staticDir, {
      index: false,
      setHeaders: (res, file) => {
        if (file.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
        else if (file.includes(`${path.sep}assets${path.sep}`))
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); // hashed names
        else res.setHeader("Cache-Control", "public, max-age=3600");
      },
    }),
  );
  // SPA fallback (/admin etc.); unknown /api and /uploads paths stay 404s.
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/uploads/")) return next();
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(config.staticDir, "index.html"));
  });
} else {
  console.warn(`No built frontend at ${config.staticDir}; serving API only.`);
}

// ---------- errors ----------
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? `Video exceeds the ${config.maxUploadMb} MB limit`
        : err.message;
    return res.status(400).json({ success: false, message });
  }
  if (err?.message?.startsWith("Only MP4"))
    return res.status(400).json({ success: false, message: err.message });
  console.error(err);
  res.status(500).json({ success: false, message: "Server error" });
});

// ---------- boot ----------
const seedAdmin = async () => {
  if (!config.adminUsername || !config.adminPassword) {
    console.warn("ADMIN_USERNAME/ADMIN_PASSWORD not set; no admin seeded.");
    return;
  }
  const passwordHash = await bcrypt.hash(config.adminPassword, 12);
  await Admin.findOneAndUpdate(
    { username: config.adminUsername },
    { username: config.adminUsername, passwordHash },
    { upsert: true },
  );
  console.log(`Admin "${config.adminUsername}" ready.`);
};

await mongoose.connect(config.mongoUri);
await seedAdmin();
for (const v of await Video.find({ status: "processing" })) enqueue(v._id);
const server = app.listen(config.port, () => console.log(`App listening on :${config.port}`));
// Node's default 5-minute request timeout would cut off large uploads on slow links.
server.requestTimeout = 30 * 60 * 1000;
