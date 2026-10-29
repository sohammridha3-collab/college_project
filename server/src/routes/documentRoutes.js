import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getPool } from "../config/db.js";
import { authenticate } from "../middleware/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, "../..");

const router = Router();

function resolveDocumentFile(doc) {
  if (!doc) return null;
  const configuredUploadDir = process.env.UPLOAD_DIR || "./uploads";
  const uploadDir = path.isAbsolute(configuredUploadDir)
    ? configuredUploadDir
    : path.resolve(serverDir, configuredUploadDir);
  const serverUploadDir = path.resolve(serverDir, "uploads");
  const rootUploadDir = path.resolve(process.cwd(), "uploads");

  const candidates = [];
  if (doc.file_path) {
    candidates.push(doc.file_path);
    candidates.push(path.resolve(doc.file_path));
    const base = path.basename(doc.file_path.replace(/\\/g, "/"));
    if (base) {
      candidates.push(path.join(uploadDir, base));
      candidates.push(path.join(serverUploadDir, base));
      candidates.push(path.join(rootUploadDir, base));
    }
  }
  if (doc.stored_filename) {
    candidates.push(path.join(uploadDir, doc.stored_filename));
    candidates.push(path.join(serverUploadDir, doc.stored_filename));
    candidates.push(path.join(rootUploadDir, doc.stored_filename));
  }

  for (const p of candidates) {
    if (p && fs.existsSync(p)) {
      return path.resolve(p);
    }
  }

  // Persistent storage fallback: If file is missing on disk (e.g. Render restart/redeployment),
  // re-hydrate from file_data (base64) stored in database
  if (doc.file_data) {
    try {
      const targetDir = fs.existsSync(uploadDir)
        ? uploadDir
        : (fs.existsSync(serverUploadDir) ? serverUploadDir : rootUploadDir);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      const filename = doc.stored_filename || `doc-${doc.id}-${path.basename(doc.original_name || "file.pdf")}`;
      const targetPath = path.join(targetDir, filename);
      const buf = Buffer.from(doc.file_data, "base64");
      fs.writeFileSync(targetPath, buf);
      return path.resolve(targetPath);
    } catch (e) {
      console.error("Failed to re-hydrate document from database file_data:", e);
    }
  }

  return null;
}

function getSafeMimeType(doc) {
  let mime = doc.mime_type;
  if (!mime || mime === "application/octet-stream") {
    const ext = path.extname(doc.original_name || doc.stored_filename || "").toLowerCase();
    if (ext === ".pdf") mime = "application/pdf";
    else if (ext === ".jpg" || ext === ".jpeg") mime = "image/jpeg";
    else if (ext === ".png") mime = "image/png";
    else if (ext === ".webp") mime = "image/webp";
    else mime = "application/octet-stream";
  }
  return mime;
}

function getSafeDisposition(dispositionType, originalName) {
  const name = originalName || "document";
  const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "");
  const utf8 = encodeURIComponent(name);
  return `${dispositionType}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

// GET /api/documents/:id/view - strictly authorized access only
router.get("/:id/view", authenticate, async (req, res, next) => {
  try {
    const docId = req.params.id;
    const pool = getPool();

    const [rows] = await pool.query(
      `SELECT d.*, a.user_id
       FROM uploaded_documents d
       JOIN admission_applications a ON d.application_id = a.id
       WHERE d.id = ? LIMIT 1`,
      [docId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Document record not found." });
    }

    const doc = rows[0];

    // Authorization: Student can only view their own; Officer and Admin can view all
    const userRole = String(req.user.role || "").toLowerCase();
    if (userRole === "student" && String(doc.user_id) !== String(req.user.id)) {
      return res.status(403).json({ message: "Unauthorized: You do not have permission to view this document." });
    }

    const resolvedPath = resolveDocumentFile(doc);
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      return res.status(404).json({ message: "Document file could not be found on server storage." });
    }

    const mime = getSafeMimeType(doc);
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", getSafeDisposition("inline", doc.original_name));
    res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
    return res.sendFile(resolvedPath);
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/:id/download - strictly authorized access only
router.get("/:id/download", authenticate, async (req, res, next) => {
  try {
    const docId = req.params.id;
    const pool = getPool();

    const [rows] = await pool.query(
      `SELECT d.*, a.user_id
       FROM uploaded_documents d
       JOIN admission_applications a ON d.application_id = a.id
       WHERE d.id = ? LIMIT 1`,
      [docId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Document record not found." });
    }

    const doc = rows[0];
    const userRole = String(req.user.role || "").toLowerCase();
    if (userRole === "student" && String(doc.user_id) !== String(req.user.id)) {
      return res.status(403).json({ message: "Unauthorized: You do not have permission to access this document." });
    }

    const resolvedPath = resolveDocumentFile(doc);
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      return res.status(404).json({ message: "Document file could not be found on server storage." });
    }

    const mime = getSafeMimeType(doc);
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", getSafeDisposition("attachment", doc.original_name));
    return res.download(resolvedPath, doc.original_name);
  } catch (err) {
    next(err);
  }
});

export default router;
