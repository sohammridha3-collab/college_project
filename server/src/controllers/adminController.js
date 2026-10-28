import bcrypt from "bcryptjs";
import { getPool } from "../config/db.js";
import { logAudit } from "../services/auditService.js";

export async function getDashboard(req, res, next) {
  try {
    const pool = getPool();

    const [students] = await pool.query(
      `SELECT COUNT(*) AS count FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'student'`
    );
    const [officers] = await pool.query(
      `SELECT COUNT(*) AS count FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'officer'`
    );
    const [admins] = await pool.query(
      `SELECT COUNT(*) AS count FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'admin'`
    );
    const [pending] = await pool.query(
      `SELECT COUNT(*) AS count FROM admission_applications WHERE status = 'Submitted' OR status = 'Under review'`
    );
    const [approved] = await pool.query(
      `SELECT COUNT(*) AS count FROM admission_applications WHERE status = 'Approved'`
    );
    const [rejected] = await pool.query(
      `SELECT COUNT(*) AS count FROM admission_applications WHERE status = 'Rejected'`
    );

    return res.json({
      stats: {
        "Total Applicants": `${students[0].count}`,
        "Admission Officers": `${officers[0].count}`,
        "System Administrators": `${admins[0].count}`,
        "Pending Applications": `${pending[0].count}`,
        "Approved Applications": `${approved[0].count}`,
        "Rejected Applications": `${rejected[0].count}`,
      },
    });
  } catch (err) {
    next(err);
  }
}

// Entity helper: Students, Officers, Users
async function getEntityList(roleFilter, req) {
  const pool = getPool();
  const { q, status, page = 1, limit = 10, sort = "id", dir = "asc" } = req.query;
  const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
  const validDir = dir.toLowerCase() === "desc" ? "DESC" : "ASC";

  let whereSql = "WHERE 1=1";
  const params = [];

  if (roleFilter) {
    whereSql += " AND r.name = ?";
    params.push(roleFilter);
  }

  if (status) {
    whereSql += " AND u.status = ?";
    params.push(status);
  }

  if (q) {
    whereSql += " AND (COALESCE(sp.full_name, ao.full_name, 'Admin') LIKE ? OR u.email LIKE ?)";
    params.push(`%${q}%`, `%${q}%`);
  }

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM users u
     JOIN roles r ON u.role_id = r.id
     LEFT JOIN student_profiles sp ON u.id = sp.user_id
     LEFT JOIN admission_officers ao ON u.id = ao.user_id
     ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT u.id,
            COALESCE(sp.full_name, ao.full_name, 'Admin') AS name,
            u.email, r.name AS role, u.status, u.created_at AS createdAt
     FROM users u
     JOIN roles r ON u.role_id = r.id
     LEFT JOIN student_profiles sp ON u.id = sp.user_id
     LEFT JOIN admission_officers ao ON u.id = ao.user_id
     ${whereSql}
     ORDER BY u.id ${validDir}
     LIMIT ? OFFSET ?`,
    [...params, parseInt(limit, 10), offset]
  );

  return {
    items: rows,
    total: countRows[0].total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  };
}

export async function getStudents(req, res, next) {
  try {
    const data = await getEntityList("student", req);
    res.json(data);
  } catch (err) { next(err); }
}

export async function getOfficers(req, res, next) {
  try {
    const data = await getEntityList("officer", req);
    res.json(data);
  } catch (err) { next(err); }
}

export async function getUsers(req, res, next) {
  try {
    const data = await getEntityList(null, req);
    res.json(data);
  } catch (err) { next(err); }
}

export async function createUser(req, res, next) {
  try {
    const { name, email, password, role = "student" } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required." });
    }

    const pool = getPool();
    const [roles] = await pool.query(`SELECT id FROM roles WHERE name = ? LIMIT 1`, [role]);
    if (!roles.length) {
      return res.status(400).json({ message: "Invalid role specified." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [uRes] = await conn.query(
        `INSERT INTO users (email, password_hash, role_id, status) VALUES (?, ?, ?, 'active')`,
        [email.trim().toLowerCase(), passwordHash, roles[0].id]
      );
      const userId = uRes.insertId;

      if (role === "student") {
        await conn.query(`INSERT INTO student_profiles (user_id, full_name, phone) VALUES (?, ?, '')`, [userId, name]);
        await conn.query(`INSERT INTO admission_applications (user_id, status) VALUES (?, 'Draft')`, [userId]);
      } else if (role === "officer") {
        await conn.query(`INSERT INTO admission_officers (user_id, full_name) VALUES (?, ?)`, [userId, name]);
      }

      await conn.commit();

      await logAudit({
        userId: req.user.id,
        userEmail: req.user.email,
        action: "ADMIN_CREATE_USER",
        details: `Created user ${email} with role ${role}`,
        ip: req.ip,
      });

      return res.status(201).json({ message: "User created successfully." });
    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }
  } catch (err) { next(err); }
}

export async function updateUser(req, res, next) {
  try {
    const userId = req.params.id;
    const { name, email, role } = req.body;
    const pool = getPool();

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      if (email) {
        await conn.query(`UPDATE users SET email = ? WHERE id = ?`, [email.trim().toLowerCase(), userId]);
      }

      if (role) {
        const [roles] = await conn.query(`SELECT id FROM roles WHERE name = ? LIMIT 1`, [role]);
        if (roles.length) {
          await conn.query(`UPDATE users SET role_id = ? WHERE id = ?`, [roles[0].id, userId]);
        }
      }

      if (name) {
        await conn.query(`UPDATE student_profiles SET full_name = ? WHERE user_id = ?`, [name, userId]);
        await conn.query(`UPDATE admission_officers SET full_name = ? WHERE user_id = ?`, [name, userId]);
      }

      await conn.commit();

      await logAudit({
        userId: req.user.id,
        userEmail: req.user.email,
        action: "ADMIN_UPDATE_USER",
        details: `Updated user #${userId}`,
        ip: req.ip,
      });

      return res.json({ message: "User updated successfully." });
    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }
  } catch (err) { next(err); }
}

export async function updateUserStatus(req, res, next) {
  try {
    const userId = req.params.id;
    const { status, remarks } = req.body;
    const pool = getPool();

    const newStatus = status === "suspended" ? "suspended" : "active";
    await pool.query(`UPDATE users SET status = ? WHERE id = ?`, [newStatus, userId]);

    await logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      action: "USER_STATUS_CHANGE",
      details: `User #${userId} status set to ${newStatus}.${remarks ? ` Remarks: ${remarks}` : ""}`,
      ip: req.ip,
    });

    return res.json({ message: `Account status updated to ${newStatus}.` });
  } catch (err) { next(err); }
}

export async function resetUserPassword(req, res, next) {
  try {
    const userId = req.params.id;
    const pool = getPool();

    const tempPassword = "ChangeMe2026!";
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    await pool.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [passwordHash, userId]);

    await logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      action: "ADMIN_RESET_PASSWORD",
      details: `Password reset by admin for User #${userId}`,
      ip: req.ip,
    });

    return res.json({ message: `Password reset to temporary password: ${tempPassword}` });
  } catch (err) { next(err); }
}

export async function getRoles(req, res, next) {
  try {
    const pool = getPool();
    const [roles] = await pool.query(`SELECT id, name FROM roles ORDER BY id ASC`);

    const [rp] = await pool.query(
      `SELECT rp.role_id, p.key_name
       FROM role_permissions rp
       JOIN permissions p ON rp.permission_id = p.id`
    );

    const items = roles.map(r => ({
      id: r.id,
      name: r.name,
      permissions: rp.filter(x => x.role_id === r.id).map(x => x.key_name),
    }));

    return res.json({ items });
  } catch (err) { next(err); }
}

export async function updateRolePermissions(req, res, next) {
  try {
    const roleId = req.params.id;
    const { permissions } = req.body; // array of key_name
    const pool = getPool();

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(`DELETE FROM role_permissions WHERE role_id = ?`, [roleId]);

      if (Array.isArray(permissions) && permissions.length) {
        const [pRows] = await conn.query(
          `SELECT id, key_name FROM permissions WHERE key_name IN (?)`,
          [permissions]
        );
        for (const p of pRows) {
          await conn.query(
            `INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
            [roleId, p.id]
          );
        }
      }

      await conn.commit();

      await logAudit({
        userId: req.user.id,
        userEmail: req.user.email,
        action: "UPDATE_PERMISSIONS",
        details: `Updated permissions for Role #${roleId}`,
        ip: req.ip,
      });

      return res.json({ message: "Permissions updated successfully." });
    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }
  } catch (err) { next(err); }
}

export async function getPermissions(req, res, next) {
  try {
    const pool = getPool();
    const [rows] = await pool.query(`SELECT key_name AS \`key\`, label FROM permissions ORDER BY id ASC`);
    return res.json({ items: rows });
  } catch (err) { next(err); }
}

export async function getSettings(req, res, next) {
  try {
    const pool = getPool();
    const [rows] = await pool.query(`SELECT * FROM system_settings WHERE id = 1 LIMIT 1`);
    const s = rows[0] || {};
    return res.json({
      settings: {
        institutionName: s.institution_name || "Metropolitan University of Technology",
        applicationFee: s.application_fee ? Number(s.application_fee).toFixed(2) : "75.00",
        currency: s.currency || "USD",
        applicationDeadline: s.application_deadline ? new Date(s.application_deadline).toISOString().split("T")[0] : "",
        maxUploadMb: s.max_upload_mb || 5,
        registrationOpen: Boolean(s.registration_open),
        policies: s.policies || "",
      },
    });
  } catch (err) { next(err); }
}

export async function updateSettings(req, res, next) {
  try {
    const {
      institutionName, applicationFee, currency, applicationDeadline,
      maxUploadMb, registrationOpen, policies
    } = req.body;

    const pool = getPool();
    await pool.query(
      `INSERT INTO system_settings (id, institution_name, application_fee, currency, application_deadline, max_upload_mb, registration_open, policies)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         institution_name = VALUES(institution_name),
         application_fee = VALUES(application_fee),
         currency = VALUES(currency),
         application_deadline = VALUES(application_deadline),
         max_upload_mb = VALUES(max_upload_mb),
         registration_open = VALUES(registration_open),
         policies = VALUES(policies)`,
      [
        institutionName,
        applicationFee ? parseFloat(applicationFee) : 75.0,
        currency || "USD",
        applicationDeadline || null,
        maxUploadMb ? parseInt(maxUploadMb, 10) : 5,
        registrationOpen === true || registrationOpen === "true" || registrationOpen === 1 ? 1 : 0,
        policies || ""
      ]
    );

    await logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      action: "SETTINGS_UPDATE",
      details: "System settings updated by administrator",
      ip: req.ip,
    });

    return res.json({ message: "Settings saved successfully." });
  } catch (err) { next(err); }
}

export async function getAuditLogs(req, res, next) {
  try {
    const pool = getPool();
    const { q, page = 1, limit = 10 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

    let whereSql = "WHERE 1=1";
    const params = [];
    if (q) {
      whereSql += " AND (user_email LIKE ? OR action LIKE ? OR details LIKE ?)";
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM audit_logs ${whereSql}`, params);
    const [rows] = await pool.query(
      `SELECT id, user_email AS user, action, details, ip_address AS ip, created_at AS createdAt
       FROM audit_logs
       ${whereSql}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit, 10), offset]
    );

    return res.json({
      items: rows,
      total: countRows[0].total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  } catch (err) { next(err); }
}

export async function getReports(req, res, next) {
  try {
    const pool = getPool();
    const { from, to, format } = req.query;

    const [totalUsers] = await pool.query(`SELECT COUNT(*) AS count FROM users`);
    const [totalApps] = await pool.query(`SELECT COUNT(*) AS count FROM admission_applications WHERE is_submitted = TRUE`);
    const [totalRevenue] = await pool.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM payment_transactions WHERE status = 'Paid'`);
    const [approved] = await pool.query(`SELECT COUNT(*) AS count FROM admission_applications WHERE status = 'Approved'`);

    const [progRows] = await pool.query(
      `SELECT COALESCE(program, 'Unspecified') AS Program,
              COUNT(*) AS Enrolled,
              SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) AS Approved
       FROM admission_applications
       WHERE is_submitted = TRUE
       GROUP BY program`
    );

    if (format === "csv") {
      let csv = "Program,Enrolled,Approved\n";
      progRows.forEach(r => {
        csv += `"${r.Program}",${r.Enrolled},${r.Approved}\n`;
      });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="admin_report.csv"');
      return res.send(csv);
    }

    const appCount = totalApps[0].count;
    const appRate = appCount > 0 ? Math.round((approved[0].count / appCount) * 100) : 0;

    return res.json({
      summary: {
        "Total Users Registered": `${totalUsers[0].count}`,
        "Submitted Applications": `${totalApps[0].count}`,
        "Total Fee Revenue": `$${Number(totalRevenue[0].total).toFixed(2)}`,
        "Overall Approval Rate": `${appRate}%`,
      },
      rows: progRows,
    });
  } catch (err) { next(err); }
}
