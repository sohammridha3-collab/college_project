import { getPool } from "../config/db.js";
import { logAudit } from "../services/auditService.js";
import { sendNotificationEmail } from "../services/emailService.js";
import { isValidScore } from "../middleware/validate.js";

const DEFAULT_CHECKLIST = {
  identityVerified: false,
  transcriptsAuthenticated: false,
  eligibilityMet: false,
  feeVerified: false,
  statementReviewed: false,
};

export async function getDashboard(req, res, next) {
  try {
    const pool = getPool();

    const [allSubmitted] = await pool.query(
      `SELECT * FROM admission_applications WHERE is_submitted = TRUE`
    );
    const [pendingDocs] = await pool.query(
      `SELECT COUNT(*) AS count FROM uploaded_documents WHERE status = 'Pending'`
    );
    const [pendingExams] = await pool.query(
      `SELECT COUNT(*) AS count FROM admission_applications a
       LEFT JOIN entrance_exam_results e ON a.id = e.application_id
       WHERE a.is_submitted = TRUE AND e.id IS NULL`
    );
    const [approvedApps] = await pool.query(
      `SELECT COUNT(*) AS count FROM admission_applications WHERE status = 'Approved'`
    );
    const [rejectedApps] = await pool.query(
      `SELECT COUNT(*) AS count FROM admission_applications WHERE status = 'Rejected'`
    );
    const [tickets] = await pool.query(`SELECT * FROM support_tickets`);

    const now = Date.now();
    let overdueCount = 0;
    let totalReviewHours = 0;
    let decidedWithDates = 0;
    let assignedToMeCount = 0;

    allSubmitted.forEach(a => {
      if (String(a.assignedOfficerId ?? a.assigned_officer_id) === String(req.user.id)) {
        assignedToMeCount++;
      }
      const subTime = a.submittedAt || a.submitted_at ? new Date(a.submittedAt || a.submitted_at).getTime() : null;
      const decTime = a.decidedAt || a.decided_at ? new Date(a.decidedAt || a.decided_at).getTime() : null;
      if ((a.status === "Submitted" || a.status === "Under review") && subTime && now - subTime > 48 * 3600 * 1000) {
        overdueCount++;
      }
      if (subTime && decTime && decTime >= subTime) {
        totalReviewHours += (decTime - subTime) / (1000 * 3600);
        decidedWithDates++;
      }
    });

    const avgReviewHours = decidedWithDates > 0 ? Math.round((totalReviewHours / decidedWithDates) * 10) / 10 : 14.5;
    const openTicketsCount = (tickets || []).filter(t => t.status === "Open" || t.status === "In Progress").length;

    const recentQueue = allSubmitted
      .filter(a => a.status === "Submitted" || a.status === "Under review")
      .slice(0, 6)
      .map(a => ({
        id: a.id,
        referenceNumber: a.referenceNumber || a.reference_number || `APP-${a.id}`,
        applicantName: a.applicantName || "Applicant",
        program: a.program || "Unspecified",
        status: a.status,
        submittedAt: a.submittedAt || a.submitted_at,
      }));

    return res.json({
      stats: {
        "Assigned Applications": `${allSubmitted.length}`,
        "Pending Document Verifications": `${pendingDocs[0].count}`,
        "Pending Entrance Results": `${pendingExams[0].count}`,
        "Approved Applications": `${approvedApps[0].count}`,
        "Rejected Applications": `${rejectedApps[0].count}`,
      },
      metrics: {
        totalSubmitted: allSubmitted.length,
        assignedToMe: assignedToMeCount,
        pendingDocsCount: Number(pendingDocs[0].count),
        pendingExamsCount: Number(pendingExams[0].count),
        approvedCount: Number(approvedApps[0].count),
        rejectedCount: Number(rejectedApps[0].count),
        overdueCount,
        avgReviewHours,
        openTicketsCount,
        recentQueue,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getApplications(req, res, next) {
  try {
    const pool = getPool();
    const { q, status, program, assignedToMe, page = 1, limit = 25, sort = "id", dir = "desc" } = req.query;

    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const validDir = String(dir).toLowerCase() === "desc" ? "DESC" : "ASC";
    const sortField =
      sort === "applicantName"
        ? "sp.full_name"
        : sort === "program"
          ? "a.program"
          : sort === "status"
            ? "a.status"
            : sort === "submittedAt"
              ? "a.submitted_at"
              : sort === "score"
                ? "a.score"
                : "a.id";

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

    if (program) {
      whereSql += " AND a.program = ?";
      params.push(program);
    }

    if (assignedToMe === "true" || assignedToMe === "1") {
      whereSql += " AND a.assigned_officer_id = ?";
      params.push(req.user.id);
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
      `SELECT a.id, sp.full_name AS applicantName, u.email, a.program, a.score, a.status,
              a.submitted_at AS submittedAt, a.reference_number AS referenceNumber,
              a.assigned_officer_id AS assignedOfficerId
       FROM admission_applications a
       JOIN users u ON a.user_id = u.id
       JOIN student_profiles sp ON u.id = sp.user_id
       ${whereSql}
       ORDER BY ${sortField} ${validDir}
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit, 10), offset]
    );

    const now = Date.now();
    const enriched = rows.map(r => {
      const subTime = r.submittedAt ? new Date(r.submittedAt).getTime() : null;
      const isOverdue = Boolean(
        (r.status === "Submitted" || r.status === "Under review") &&
        subTime &&
        now - subTime > 48 * 3600 * 1000
      );
      return {
        ...r,
        isOverdue,
      };
    });

    return res.json({
      items: enriched,
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
              sp.nationality, sp.guardian_name AS guardianName, sp.guardian_phone AS guardianPhone,
              a.program, a.department, a.prev_institution AS prevInstitution, a.qualification,
              a.graduation_year AS graduationYear, a.score, a.statement,
              a.status, a.remarks, a.internal_notes AS internalNotes, a.checklist_json AS checklistJson,
              a.assigned_officer_id AS assignedOfficerId,
              a.reference_number AS referenceNumber, a.submitted_at AS submittedAt, a.decided_at AS decidedAt
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

    let checklist = { ...DEFAULT_CHECKLIST };
    if (app.checklistJson) {
      try {
        checklist = { ...DEFAULT_CHECKLIST, ...JSON.parse(app.checklistJson) };
      } catch { }
    }
    app.checklist = checklist;

    const [docs] = await pool.query(
      `SELECT id, type, original_name AS name, status, remarks, version,
              resubmitted_at AS resubmittedAt, verified_at AS verifiedAt
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

    const [txs] = await pool.query(
      `SELECT * FROM payment_transactions WHERE application_id = ? AND status = 'Paid' LIMIT 1`,
      [appId]
    );
    app.payment = txs[0]
      ? {
        status: "Paid",
        transactionReference: txs[0].transaction_reference,
        amount: Number(txs[0].amount).toFixed(2),
        currency: txs[0].currency || "USD",
        paidAt: txs[0].paid_at,
      }
      : { status: "Unpaid" };

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
              d.type, d.original_name AS name, d.status, d.remarks, d.version
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

    if ((newStatus === "Needs Correction" || newStatus === "Rejected") && (!remarks || !String(remarks).trim())) {
      return res.status(400).json({
        message: `Mandatory remarks are required when marking a document as ${newStatus}.`,
      });
    }

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
      `INSERT INTO application_status_history (application_id, step, status, remarks, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [
        appId,
        `Document Review: ${doc.type}`,
        newStatus,
        remarks || `Document "${doc.original_name || doc.name}" marked as ${newStatus}.`,
        req.user.id,
      ]
    );

    await pool.query(
      `INSERT INTO notifications (user_id, title, message)
       VALUES (?, ?, ?)`,
      [
        doc.user_id,
        `Document ${newStatus}: ${doc.type}`,
        `Your document "${doc.original_name || doc.name}" has been marked as ${newStatus}.${remarks ? ` Remarks: ${remarks}` : ""}`,
      ]
    );

    const [uRows] = await pool.query(`SELECT id, email, name FROM users WHERE id = ? LIMIT 1`, [doc.user_id]);
    if (uRows.length) {
      await sendNotificationEmail({
        userId: doc.user_id,
        to: uRows[0].email,
        template: "DOCUMENT_STATUS_UPDATE",
        data: {
          name: uRows[0].name || uRows[0].email,
          docType: doc.type,
          fileName: doc.original_name || doc.name,
          status: newStatus,
          remarks,
        },
      });
    }

    await logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      action: "DOCUMENT_VERIFY",
      details: `Document #${docId} (${doc.type}) on App #${appId} set to ${newStatus}`,
      ip: req.ip,
    });

    return res.json({ message: `Document marked as ${newStatus}.`, status: newStatus });
  } catch (err) {
    next(err);
  }
}

export async function saveReview(req, res, next) {
  try {
    const appId = req.params.id;
    const { notes, internalNotes, checklist } = req.body;
    const pool = getPool();

    const [apps] = await pool.query(`SELECT * FROM admission_applications WHERE id = ? LIMIT 1`, [appId]);
    if (!apps.length) {
      return res.status(404).json({ message: "Application not found." });
    }
    const app = apps[0];

    const checklistStr = checklist ? JSON.stringify(checklist) : app.checklist_json || null;

    await pool.query(
      `UPDATE admission_applications
       SET remarks = ?, internal_notes = ?, checklist_json = ?, status = 'Under review'
       WHERE id = ?`,
      [notes ?? app.remarks ?? "", internalNotes ?? app.internal_notes ?? "", checklistStr, appId]
    );

    await pool.query(
      `INSERT INTO application_status_history (application_id, step, status, remarks, created_by)
       VALUES (?, 'Officer Review', 'Under review', ?, ?)`,
      [appId, notes || "Reviewed by admission officer.", req.user.id]
    );

    const [uRows] = await pool.query(`SELECT id, email, name FROM users WHERE id = ? LIMIT 1`, [app.user_id]);
    if (uRows.length && notes) {
      await sendNotificationEmail({
        userId: app.user_id,
        to: uRows[0].email,
        template: "APPLICATION_STATUS_UPDATE",
        data: {
          name: uRows[0].name || uRows[0].email,
          referenceNumber: app.reference_number || appId,
          status: "Under review",
          remarks: notes,
        },
      });
    }

    await logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      action: "APPLICATION_REVIEW",
      details: `Review notes & checklist saved for Application #${appId}`,
      ip: req.ip,
    });

    return res.json({
      message: "Review notes and checklist saved successfully.",
      status: "Under review",
      checklist: checklist || (checklistStr ? JSON.parse(checklistStr) : {}),
    });
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
      `SELECT a.id AS applicationId, sp.full_name AS applicantName, a.program,
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

    if (score === undefined || score === "" || !result) {
      return res.status(400).json({ message: "Exam score and result are required." });
    }

    if (!isValidScore(score)) {
      return res.status(400).json({ message: "Exam score must be between 0 and 100." });
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

    await pool.query(
      `INSERT INTO notifications (user_id, title, message)
       VALUES (?, 'Entrance Examination Result Recorded', ?)`,
      [apps[0].user_id, `Your entrance exam result has been recorded: ${result} (Score: ${score}/100).`]
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

    const [apps] = await pool.query(
      `SELECT user_id, reference_number, program FROM admission_applications WHERE id = ? LIMIT 1`,
      [appId]
    );
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
        `Your admission application #${app.reference_number || appId} has been ${newStatus.toLowerCase()}.${remarks ? ` Decision remarks: ${remarks}` : ""}`,
      ]
    );

    const [uRows] = await pool.query(`SELECT id, email, name FROM users WHERE id = ? LIMIT 1`, [app.user_id]);
    if (uRows.length) {
      await sendNotificationEmail({
        userId: app.user_id,
        to: uRows[0].email,
        template: "ADMISSION_DECISION",
        data: {
          name: uRows[0].name || uRows[0].email,
          referenceNumber: app.reference_number || appId,
          program: app.program,
          decision: newStatus,
          remarks,
        },
      });
    }

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

// ---------- SUPPORT TICKETS MANAGEMENT (OFFICER / ADMIN) ----------
export async function getAllTickets(req, res, next) {
  try {
    const pool = getPool();
    const [tickets] = await pool.query(`SELECT * FROM support_tickets`);
    for (const t of tickets) {
      const [msgs] = await pool.query(
        `SELECT * FROM support_ticket_messages WHERE ticket_id = ?`,
        [t.id]
      );
      t.messages = msgs;
    }
    return res.json({ items: tickets, total: tickets.length });
  } catch (err) {
    next(err);
  }
}

export async function getTicketDetailStaff(req, res, next) {
  try {
    const ticketId = req.params.id;
    const pool = getPool();
    const [tickets] = await pool.query(`SELECT * FROM support_tickets WHERE id = ?`, [ticketId]);
    if (!tickets.length) {
      return res.status(404).json({ message: "Ticket not found." });
    }
    const ticket = tickets[0];
    const [msgs] = await pool.query(
      `SELECT id, sender_id AS senderId, sender_role AS senderRole, sender_name AS senderName, message, created_at AS createdAt
       FROM support_ticket_messages
       WHERE ticket_id = ?
       ORDER BY id ASC`,
      [ticket.id]
    );
    return res.json({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber || ticket.ticket_number,
      subject: ticket.subject,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      studentName: ticket.studentName,
      studentEmail: ticket.studentEmail,
      createdAt: ticket.createdAt || ticket.created_at,
      updatedAt: ticket.updatedAt || ticket.updated_at,
      messages: msgs,
    });
  } catch (err) {
    next(err);
  }
}

export async function replyTicketStaff(req, res, next) {
  try {
    const ticketId = req.params.id;
    const { message, status } = req.body;
    if (!message) {
      return res.status(400).json({ message: "Reply message is required." });
    }

    const pool = getPool();
    const [tickets] = await pool.query(`SELECT * FROM support_tickets WHERE id = ?`, [ticketId]);
    if (!tickets.length) {
      return res.status(404).json({ message: "Ticket not found." });
    }
    const ticket = tickets[0];
    const nextStatus = status || "In Progress";

    await pool.query(
      `INSERT INTO support_ticket_messages (ticket_id, sender_id, sender_role, sender_name, message)
       VALUES (?, ?, ?, ?, ?)`,
      [ticketId, req.user.id, req.user.role, req.user.name || req.user.email, message]
    );

    await pool.query(`UPDATE support_tickets SET status = ? WHERE id = ?`, [nextStatus, ticketId]);

    await pool.query(
      `INSERT INTO notifications (user_id, title, message)
       VALUES (?, ?, ?)`,
      [
        ticket.userId ?? ticket.user_id,
        `Support Ticket Reply [${ticket.ticketNumber || ticket.ticket_number}]`,
        `Admissions staff replied to "${ticket.subject}": ${message.slice(0, 120)}`,
      ]
    );

    if (ticket.studentEmail) {
      await sendNotificationEmail({
        userId: ticket.userId ?? ticket.user_id,
        to: ticket.studentEmail,
        template: "SUPPORT_TICKET_UPDATE",
        data: {
          name: ticket.studentName || "Applicant",
          ticketNumber: ticket.ticketNumber || ticket.ticket_number,
          subject: ticket.subject,
          status: nextStatus,
          reply: message,
        },
      });
    }

    await logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      action: "SUPPORT_TICKET_REPLY",
      details: `Replied to ticket #${ticketId} (${ticket.ticketNumber || ticket.ticket_number}), status -> ${nextStatus}`,
      ip: req.ip,
    });

    return res.status(201).json({ message: "Reply sent and ticket status updated.", status: nextStatus });
  } catch (err) {
    next(err);
  }
}

// ---------- INTERVIEW SLOTS MANAGEMENT (OFFICER / ADMIN) ----------
export async function getStaffInterviews(req, res, next) {
  try {
    const pool = getPool();
    const [slots] = await pool.query(`SELECT * FROM interview_slots`);
    const [bookings] = await pool.query(`SELECT * FROM interview_bookings`);
    return res.json({ slots, bookings });
  } catch (err) {
    next(err);
  }
}

export async function createInterviewSlot(req, res, next) {
  try {
    const {
      title,
      department,
      program,
      slotDate,
      startTime,
      endTime,
      mode = "Online",
      locationOrLink,
      location,
      capacity = 5,
    } = req.body;

    if (!title || !slotDate || !startTime || !endTime) {
      return res.status(400).json({ message: "Title, date, start time, and end time are required." });
    }

    const pool = getPool();
    const [ins] = await pool.query(
      `INSERT INTO interview_slots (title, department, officer_id, officer_name, slot_date, start_time, end_time, mode, location_or_link, capacity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        program || department || "General Admissions",
        req.user.id,
        req.user.name || req.user.email,
        slotDate,
        startTime,
        endTime,
        mode,
        location || locationOrLink || "",
        parseInt(capacity, 10) || 5,
      ]
    );

    await logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      action: "INTERVIEW_SLOT_CREATE",
      details: `Created interview slot "${title}" on ${slotDate} (${startTime}-${endTime})`,
      ip: req.ip,
    });

    return res.status(201).json({ message: "Interview slot created successfully.", id: ins.insertId });
  } catch (err) {
    next(err);
  }
}

export async function updateInterviewBooking(req, res, next) {
  try {
    const bookingId = req.params.id;
    const { status = "Completed", notes } = req.body;
    const pool = getPool();
    await pool.query(
      `UPDATE interview_bookings SET status = ?, notes = COALESCE(?, notes) WHERE id = ?`,
      [status, notes, bookingId]
    );
    return res.json({ message: "Interview booking updated.", status });
  } catch (err) {
    next(err);
  }
}
