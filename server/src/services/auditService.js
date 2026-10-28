import { getPool } from "../config/db.js";

export async function logAudit({ userId = null, userEmail = null, action, details = "", ip = null }) {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO audit_logs (user_id, user_email, action, details, ip_address)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, userEmail, action, String(details), ip]
    );
  } catch (err) {
    console.error("[AuditLog Error]", err.message);
  }
}
