import { getPool } from "../config/db.js";
import { logAudit } from "../services/auditService.js";

export async function getDashboard(req, res, next) {
  try {
    const pool = getPool();

    const [totalApps] = await pool.query(`SELECT COUNT(*) AS total FROM admission_applications WHERE is_submitted = TRUE`);
    const [pendingDocs] = await pool.query(`SELECT COUNT(*) AS count FROM uploaded_documents WHERE status = 'Pending'`);
    const [pendingExams] = await pool.query(
      `SELECT COUNT(*) AS count FROM admission_applications a
       LEFT JOIN entrance_exam_results e ON a.id = e.application_id
       WHERE a.is_submitted = TRUE AND e.id IS NULL`
    );
    const [approvedApps] = await pool.query(`SELECT COUNT(*) AS count FROM admission_applications WHERE status = 'Approved'`);
    const [rejectedApps] = await pool.query(`SELECT COUNT(*) AS count FROM admission_applications WHERE status = 'Rejected'`);

    return res.json({
      stats: {
        "Assigned Applications": `${totalApps[0].total}`,
        "Pending Document Verifications": `${pendingDocs[0].count}`,
        "Pending Entrance Results": `${pendingExams[0].count}`,
        "Approved Applications": `${approvedApps[0].count}`,
        "Rejected Applications": `${rejectedApps[0].count}`,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getApplications(req, res, next) {
  try {
    const pool = getPool();
    const { q, status, page = 1, limit = 10, sort = "id", dir = "asc" } = req.query;

    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const validDir = dir.toLowerCase() === "desc" ? "DESC" : "ASC";
    const sortField = sort === "applicantName" ? "sp.full_name" : sort === "program" ? "a.program" : sort === "status" ? "a.status" : "a.id";

    let whereSql = "WHERE a.is_submitted = TRUE";
    const params = [];

    if (q) {
      whereSql += " AND (sp.full_name LIKE ? OR a.program LIKE ? OR u.email LIKE ? OR a.reference_number LIKE ?)";
      const pattern = `%${q}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    if (status) {
      whereSql += " AND a.status = ?";
      params.push(status);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM admission_applications a
       JOIN users u ON a.user_id = u.id
       JOIN student_profiles sp ON u.id = sp.user_id
       ${whereSql}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT a.id, sp.full_name AS applicantName, a.program, a.status,
              a.submitted_at AS submittedAt, a.reference_number AS referenceNumber
       FROM admission_applications a
       JOIN users u ON a.user_id = u.id
       JOIN student_profiles sp ON u.id = sp.user_id
       ${whereSql}
       ORDER BY ${sortField} ${validDir}
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit, 10), offset]
    );

    return res.json({
      items: rows,
      total: countRows[0].total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  } catch (err) {
    next(err);
  }
}

export async function getApplicationDetail(req, res, next) {
  try {
    const appId = req.params.id;
    const pool = getPool();

    const [apps] = await pool.query(
      `SELECT a.id, a.user_id, sp.full_name AS applicantName, u.email, sp.phone, sp.dob, sp.gender, sp.address,
              a.program, a.prev_institution AS prevInstitution, a.qualification, a.score, a.statement,
              a.status, a.remarks, a.reference_number AS referenceNumber, a.submitted_at AS submittedAt
       FROM admission_applications a
       JOIN users u ON a.user_id = u.id
       JOIN student_profiles sp ON u.id = sp.user_id
       WHERE a.id = ? LIMIT 1`,
      [appId]
    );

    if (!apps.length) {
      return res.status(404).json({ message: "Application not found." });
    }

    const app = apps[0];

    const [docs] = await pool.query(
      `SELECT id, type, original_name AS name, status, remarks, verified_at AS verifiedAt
       FROM uploaded_documents
       WHERE application_id = ?
       ORDER BY id ASC`,
      [appId]
    );
    app.documents = docs;

    const [examRows] = await pool.query(
      `SELECT score, result, exam_date AS examDate, notes
       FROM entrance_exam_results
       WHERE application_id = ?
       ORDER BY id DESC LIMIT 1`,
      [appId]
    );
    app.examResult = examRows[0] || null;

    const [timeline] = await pool.query(
      `SELECT step, status, remarks, created_at AS date
       FROM application_status_history
       WHERE application_id = ?
       ORDER BY id ASC`,
      [appId]
    );
    app.timeline = timeline;

    return res.json(app);
  } catch (err) {
    next(err);
  }
}

export async function getDocuments(req, res, next) {
  try {
    const pool = getPool();
    const { q, status, page = 1, limit = 10 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

    let whereSql = "WHERE 1=1";
    const params = [];

    if (q) {
      whereSql += " AND (sp.full_name LIKE ? OR d.type LIKE ? OR d.original_name LIKE ?)";
      const pattern = `%${q}%`;
      params.push(pattern, pattern, pattern);
    }

    if (status) {
      whereSql += " AND d.status = ?";
      params.push(status);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM uploaded_documents d
       JOIN admission_applications a ON d.application_id = a.id
       JOIN student_profiles sp ON a.user_id = sp.user_id
       ${whereSql}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT d.id, d.application_id AS applicationId, sp.full_name AS applicantName,
              d.type, d.original_name AS name, d.status, d.remarks
       FROM uploaded_documents d
       JOIN admission_applications a ON d.application_id = a.id
       JOIN student_profiles sp ON a.user_id = sp.user_id
       ${whereSql}
       ORDER BY d.id DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit, 10), offset]
    );

    return res.json({
      items: rows,
      total: countRows[0].total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyDocument(req, res, next) {
  try {
    const { appId, docId } = req.params;
    const { status, remarks } = req.body;

    const s = String(status || "").toLowerCase();
    const newStatus = s.includes("verif") ? "Verified" : s.includes("correct") ? "Needs Correction" : "Rejected";
    const pool = getPool();

    const [docs] = await pool.query(
      `SELECT d.*, a.user_id FROM uploaded_documents d
       JOIN admission_applications a ON d.application_id = a.id
       WHERE d.id = ? AND d.application_id = ? LIMIT 1`,
      [docId, appId]
    );

    if (!docs.length) {
      return res.status(404).json({ message: "Document not found." });
    }

    const doc = docs[0];

    await pool.query(
      `UPDATE uploaded_documents
       SET status = ?, remarks = ?, verified_by = ?, verified_at = NOW()
       WHERE id = ?`,
      [newStatus, remarks || null, req.user.id, docId]
    );

    await pool.query(
      `INSERT INTO notifications (user_id, title, message)
       VALUES (?, ?, ?)`,
      [
        doc.user_id,
        `Document ${newStatus}: ${doc.type}`,
        `Your document "${doc.original_name}" has been marked as ${newStatus}.${remarks ? ` Remarks: ${remarks}` : ""}`
      ]
    );

    await logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      action: "DOCUMENT_VERIFY",
      details: `Document #${docId} on App #${appId} set to ${newStatus}`,
      ip: req.ip,
    });

    return res.json({ message: `Document marked as ${newStatus}.` });
  } catch (err) {
    next(err);
  }
}

export async function saveReview(req, res, next) {
  try {
    const appId = req.params.id;
    const { notes } = req.body;
    const pool = getPool();

    await pool.query(
      `UPDATE admission_applications SET remarks = ?, status = 'Under review' WHERE id = ?`,
      [notes || "", appId]
    );

    await pool.query(
      `INSERT INTO application_status_history (application_id, step, status, remarks, created_by)
       VALUES (?, 'Officer Review', 'Under review', ?, ?)`,
      [appId, notes || "Reviewed by admission officer.", req.user.id]
    );

    await logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      action: "APPLICATION_REVIEW",
      details: `Review notes saved for Application #${appId}`,
      ip: req.ip,
    });

    return res.json({ message: "Review notes saved successfully." });
  } catch (err) {
    next(err);
  }
}

export async function getExamResults(req, res, next) {
  try {
    const pool = getPool();
    const { q, page = 1, limit = 10 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

    let whereSql = "WHERE a.is_submitted = TRUE";
    const params = [];

    if (q) {
      whereSql += " AND (sp.full_name LIKE ? OR a.program LIKE ?)";
      params.push(`%${q}%`, `%${q}%`);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM admission_applications a
       JOIN users u ON a.user_id = u.id
       JOIN student_profiles sp ON u.id = sp.user_id
       LEFT JOIN entrance_exam_results e ON a.id = e.application_id
       ${whereSql}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT a.id AS applicationId, sp.full_name AS applicantName,
              COALESCE(e.score, '–') AS score, COALESCE(e.result, 'Pending') AS result,
              e.exam_date AS examDate, e.notes
       FROM admission_applications a
       JOIN users u ON a.user_id = u.id
       JOIN student_profiles sp ON u.id = sp.user_id
       LEFT JOIN entrance_exam_results e ON a.id = e.application_id
       ${whereSql}
       ORDER BY a.id DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit, 10), offset]
    );

    return res.json({
      items: rows,
      total: countRows[0].total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  } catch (err) {
    next(err);
  }
}

export async function recordExamResult(req, res, next) {
  try {
    const appId = req.params.id;
    const { score, result, examDate, notes } = req.body;

    if (!score || !result) {
      return res.status(400).json({ message: "Exam score and result are required." });
    }

    const pool = getPool();
    const [apps] = await pool.query(`SELECT user_id FROM admission_applications WHERE id = ? LIMIT 1`, [appId]);
    if (!apps.length) {
      return res.status(404).json({ message: "Application not found." });
    }

    await pool.query(
      `INSERT INTO entrance_exam_results (application_id, score, result, exam_date, notes, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         score = VALUES(score),
         result = VALUES(result),
         exam_date = VALUES(exam_date),
         notes = VALUES(notes),
         recorded_by = VALUES(recorded_by)`,
      [appId, parseFloat(score), result, examDate || null, notes || null, req.user.id]
    );

    await pool.query(
      `INSERT INTO application_status_history (application_id, step, status, remarks, created_by)
       VALUES (?, 'Entrance Examination', ?, ?, ?)`,
      [appId, result, `Score: ${score}. Notes: ${notes || "None"}`, req.user.id]
    );

    await logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      action: "EXAM_RECORD",
      details: `Exam result recorded for Application #${appId}: ${result} (${score})`,
      ip: req.ip,
    });

    return res.json({ message: "Entrance exam result recorded." });
  } catch (err) {
    next(err);
  }
}

export async function decideApplication(req, res, next) {
  try {
    const appId = req.params.id;
    const { decision, remarks } = req.body;

    const newStatus = decision === "approved" || decision === "Approved" ? "Approved" : "Rejected";

    if (newStatus === "Rejected" && (!remarks || !remarks.trim())) {
      return res.status(400).json({ message: "Remarks are mandatory when rejecting an application." });
    }

    const pool = getPool();

    const [apps] = await pool.query(`SELECT user_id, reference_number FROM admission_applications WHERE id = ? LIMIT 1`, [appId]);
    if (!apps.length) {
      return res.status(404).json({ message: "Application not found." });
    }

    const app = apps[0];

    await pool.query(
      `UPDATE admission_applications
       SET status = ?, remarks = ?, decided_at = NOW()
       WHERE id = ?`,
      [newStatus, remarks || null, appId]
    );

    await pool.query(
      `INSERT INTO application_status_history (application_id, step, status, remarks, created_by)
       VALUES (?, 'Committee Decision', ?, ?, ?)`,
      [appId, newStatus, remarks || `Application has been ${newStatus.toLowerCase()}.`, req.user.id]
    );

    await pool.query(
      `INSERT INTO notifications (user_id, title, message)
       VALUES (?, ?, ?)`,
      [
        app.user_id,
        `Admission Decision: Application ${newStatus}`,
        `Your admission application #${app.reference_number || appId} has been ${newStatus.toLowerCase()}.${remarks ? ` Decision remarks: ${remarks}` : ""}`
      ]
    );

    await logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      action: "APPLICATION_DECISION",
      details: `Application #${appId} decided as ${newStatus}`,
      ip: req.ip,
    });

    return res.json({ message: `Application ${newStatus.toLowerCase()} successfully.` });
  } catch (err) {
    next(err);
  }
}

export async function getReports(req, res, next) {
  try {
    const pool = getPool();
    const { from, to, format } = req.query;

    const [reviewed] = await pool.query(`SELECT COUNT(*) AS count FROM admission_applications WHERE status IN ('Approved', 'Rejected')`);
    const [approved] = await pool.query(`SELECT COUNT(*) AS count FROM admission_applications WHERE status = 'Approved'`);
    const [rejected] = await pool.query(`SELECT COUNT(*) AS count FROM admission_applications WHERE status = 'Rejected'`);
    const [pending] = await pool.query(`SELECT COUNT(*) AS count FROM admission_applications WHERE status = 'Under review' OR status = 'Submitted'`);

    const [progRows] = await pool.query(
      `SELECT COALESCE(program, 'Unspecified') AS Program,
              COUNT(*) AS Applied,
              SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) AS Approved,
              CONCAT(ROUND(SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) / COUNT(*) * 100), '%') AS PassRate
       FROM admission_applications
       WHERE is_submitted = TRUE
       GROUP BY program`
    );

    if (format === "csv") {
      let csv = "Program,Applied,Approved,PassRate\n";
      progRows.forEach(r => {
        csv += `"${r.Program}",${r.Applied},${r.Approved},"${r.PassRate}"\n`;
      });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="officer_report.csv"');
      return res.send(csv);
    }

    return res.json({
      summary: {
        "Applications Reviewed": `${reviewed[0].count}`,
        "Approved": `${approved[0].count}`,
        "Rejected": `${rejected[0].count}`,
        "Pending Processing": `${pending[0].count}`,
      },
      rows: progRows,
    });
  } catch (err) {
    next(err);
  }
}
