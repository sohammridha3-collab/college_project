import { Router } from "express";
import fs from "fs";
import path from "path";
import { getPool } from "../config/db.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// GET /api/documents/:id/view or download - strictly authorized access only
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
      return res.status(404).json({ message: "Document not found." });
    }

    const doc = rows[0];

    // Authorization: Student can only view their own; Officer and Admin can view all
    const userRole = String(req.user.role || "").toLowerCase();
    if (userRole === "student" && String(doc.user_id) !== String(req.user.id)) {
      return res.status(403).json({ message: "Unauthorized: You do not have permission to view this document." });
    }

    if (!fs.existsSync(doc.file_path)) {
      return res.status(404).json({ message: "File missing on server storage." });
    }

    res.setHeader("Content-Type", doc.mime_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${doc.original_name}"`);
    return res.sendFile(path.resolve(doc.file_path));
  } catch (err) {
    next(err);
  }
});

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
      return res.status(404).json({ message: "Document not found." });
    }

    const doc = rows[0];
    const userRole = String(req.user.role || "").toLowerCase();
    if (userRole === "student" && String(doc.user_id) !== String(req.user.id)) {
      return res.status(403).json({ message: "Unauthorized access to document." });
    }

    if (!fs.existsSync(doc.file_path)) {
      return res.status(404).json({ message: "File missing on server storage." });
    }

    return res.download(path.resolve(doc.file_path), doc.original_name);
  } catch (err) {
    next(err);
  }
});

export default router;
