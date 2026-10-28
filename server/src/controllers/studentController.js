import fs from "fs";
import { getPool } from "../config/db.js";
import { activePaymentGateway } from "../services/paymentService.js";

// Helper to get student's active application
async function getStudentApp(userId) {
  const pool = getPool();
  let [apps] = await pool.query(
    `SELECT * FROM admission_applications WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  if (!apps.length) {
    const [res] = await pool.query(
      `INSERT INTO admission_applications (user_id, status) VALUES (?, 'Draft')`,
      [userId]
    );
    [apps] = await pool.query(`SELECT * FROM admission_applications WHERE id = ?`, [res.insertId]);
  }
  return apps[0];
}

export async function getDashboard(req, res, next) {
  try {
    const pool = getPool();
    const app = await getStudentApp(req.user.id);

    const [docCount] = await pool.query(
      `SELECT COUNT(*) AS total FROM uploaded_documents WHERE application_id = ?`,
      [app.id]
    );

    const [payment] = await pool.query(
      `SELECT status FROM payment_transactions WHERE application_id = ? AND status = 'Paid' LIMIT 1`,
      [app.id]
    );

    const [unread] = await pool.query(
      `SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = FALSE`,
      [req.user.id]
    );

    return res.json({
      stats: {
        "Application Status": app.status,
        "Documents Uploaded": `${docCount[0].total}`,
        "Fee Payment": payment.length ? "Paid" : "Pending",
        "Unread Notifications": `${unread[0].count}`,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getApplication(req, res, next) {
  try {
    const pool = getPool();
    const app = await getStudentApp(req.user.id);

    const [profiles] = await pool.query(
      `SELECT full_name AS fullName, phone, dob, gender, address FROM student_profiles WHERE user_id = ? LIMIT 1`,
      [req.user.id]
    );
    const p = profiles[0] || {};

    return res.json({
      fullName: p.fullName || "",
      dob: p.dob ? new Date(p.dob).toISOString().split("T")[0] : "",
      gender: p.gender || "",
      phone: p.phone || "",
      address: p.address || "",
      program: app.program || "",
      prevInstitution: app.prev_institution || "",
      qualification: app.qualification || "",
      score: app.score ? String(app.score) : "",
      statement: app.statement || "",
      status: app.status,
      referenceNumber: app.reference_number,
    });
  } catch (err) {
    next(err);
  }
}

export async function saveApplication(req, res, next) {
  try {
    const pool = getPool();
    const app = await getStudentApp(req.user.id);

    if (app.is_submitted) {
      return res.status(400).json({ message: "Your application has already been submitted and cannot be modified." });
    }

    const {
      fullName, dob, gender, phone, address,
      program, prevInstitution, qualification, score, statement, draft
    } = req.body;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `UPDATE student_profiles
         SET full_name = COALESCE(?, full_name),
             phone = COALESCE(?, phone),
             dob = ?,
             gender = ?,
             address = ?
         WHERE user_id = ?`,
        [fullName || null, phone || null, dob || null, gender || null, address || null, req.user.id]
      );

      await connection.query(
        `UPDATE admission_applications
         SET program = ?,
             prev_institution = ?,
             qualification = ?,
             score = ?,
             statement = ?,
             status = ?
         WHERE id = ?`,
        [
          program || null,
          prevInstitution || null,
          qualification || null,
          score ? parseFloat(score) : null,
          statement || null,
          draft ? "Draft" : "Draft",
          app.id
        ]
      );

      await connection.commit();
      return res.json({ message: draft ? "Draft saved successfully." : "Application saved successfully." });
    } catch (txErr) {
      await connection.rollback();
      throw txErr;
    } finally {
      connection.release();
    }
  } catch (err) {
    next(err);
  }
}

export async function submitApplication(req, res, next) {
  try {
    const pool = getPool();
    const app = await getStudentApp(req.user.id);

    if (app.is_submitted) {
      return res.status(400).json({ message: "Application is already submitted." });
    }

    // Validation: program, score, qualification
    if (!app.program || !app.qualification) {
      return res.status(422).json({ message: "Please complete all required application details before submitting." });
    }

    // Require at least one uploaded document
    const [docs] = await pool.query(`SELECT id FROM uploaded_documents WHERE application_id = ?`, [app.id]);
    if (!docs.length) {
      return res.status(422).json({ message: "Please upload at least one required document before submitting." });
    }

    // Check fee payment
    const [txs] = await pool.query(
      `SELECT id FROM payment_transactions WHERE application_id = ? AND status = 'Paid' LIMIT 1`,
      [app.id]
    );
    if (!txs.length) {
      return res.status(422).json({ message: "Please complete the application fee payment before final submission." });
    }

    const ref = `APP-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date();

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `UPDATE admission_applications
         SET status = 'Submitted', is_submitted = TRUE, reference_number = ?, submitted_at = ?
         WHERE id = ?`,
        [ref, now, app.id]
      );

      await connection.query(
        `INSERT INTO application_status_history (application_id, step, status, remarks)
         VALUES (?, 'Application Submitted', 'Submitted', 'Application submitted by student.')`,
        [app.id]
      );

      await connection.query(
        `INSERT INTO notifications (user_id, title, message)
         VALUES (?, 'Application Submitted Successfully', ?)`,
        [req.user.id, `Your application #${ref} has been received and queued for officer verification.`]
      );

      await connection.commit();

      return res.json({
        referenceNumber: ref,
        submittedAt: now.toISOString(),
      });
    } catch (txErr) {
      await connection.rollback();
      throw txErr;
    } finally {
      connection.release();
    }
  } catch (err) {
    next(err);
  }
}

export async function getStatus(req, res, next) {
  try {
    const pool = getPool();
    const app = await getStudentApp(req.user.id);

    const [timeline] = await pool.query(
      `SELECT step, status, remarks, created_at AS date
       FROM application_status_history
       WHERE application_id = ?
       ORDER BY id ASC`,
      [app.id]
    );

    const [exams] = await pool.query(
      `SELECT score, result, exam_date AS examDate, notes
       FROM entrance_exam_results
       WHERE application_id = ?
       ORDER BY id DESC LIMIT 1`,
      [app.id]
    );

    return res.json({
      status: app.status,
      remarks: app.remarks || "",
      referenceNumber: app.reference_number || null,
      program: app.program || null,
      submittedAt: app.submitted_at || null,
      examResult: exams[0] || null,
      timeline,
    });
  } catch (err) {
    next(err);
  }
}

export async function getDocuments(req, res, next) {
  try {
    const pool = getPool();
    const app = await getStudentApp(req.user.id);

    const [docs] = await pool.query(
      `SELECT id, type, original_name AS name, status, remarks
       FROM uploaded_documents
       WHERE application_id = ?
       ORDER BY id DESC`,
      [app.id]
    );

    return res.json({ items: docs });
  } catch (err) {
    next(err);
  }
}

export async function uploadDocument(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No document file was selected." });
    }

    const { type } = req.body;
    if (!type) {
      return res.status(400).json({ message: "Document type is required." });
    }

    const pool = getPool();
    const app = await getStudentApp(req.user.id);

    await pool.query(
      `INSERT INTO uploaded_documents (application_id, type, original_name, stored_filename, file_path, file_size, mime_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [
        app.id,
        type,
        req.file.originalname,
        req.file.filename,
        req.file.path,
        req.file.size,
        req.file.mimetype,
      ]
    );

    return res.status(201).json({ message: "Document uploaded successfully." });
  } catch (err) {
    next(err);
  }
}

export async function deleteDocument(req, res, next) {
  try {
    const docId = req.params.id;
    const pool = getPool();
    const app = await getStudentApp(req.user.id);

    const [docs] = await pool.query(
      `SELECT * FROM uploaded_documents WHERE id = ? AND application_id = ? LIMIT 1`,
      [docId, app.id]
    );

    if (!docs.length) {
      return res.status(404).json({ message: "Document not found." });
    }

    const doc = docs[0];
    if (fs.existsSync(doc.file_path)) {
      try { fs.unlinkSync(doc.file_path); } catch {}
    }

    await pool.query(`DELETE FROM uploaded_documents WHERE id = ?`, [docId]);

    return res.json({ message: "Document deleted successfully." });
  } catch (err) {
    next(err);
  }
}

export async function getFee(req, res, next) {
  try {
    const pool = getPool();
    const app = await getStudentApp(req.user.id);

    const [settings] = await pool.query(
      `SELECT application_fee AS amount, currency FROM system_settings WHERE id = 1 LIMIT 1`
    );
    const feeConfig = settings[0] || { amount: 75.0, currency: "USD" };

    const [txs] = await pool.query(
      `SELECT status FROM payment_transactions WHERE application_id = ? AND status = 'Paid' LIMIT 1`,
      [app.id]
    );

    return res.json({
      amount: Number(feeConfig.amount).toFixed(2),
      currency: feeConfig.currency,
      status: txs.length ? "Paid" : "Unpaid",
    });
  } catch (err) {
    next(err);
  }
}

export async function checkoutFee(req, res, next) {
  try {
    const pool = getPool();
    const app = await getStudentApp(req.user.id);

    const [settings] = await pool.query(
      `SELECT application_fee AS amount, currency FROM system_settings WHERE id = 1 LIMIT 1`
    );
    const feeConfig = settings[0] || { amount: 75.0, currency: "USD" };

    const host = req.get("host");
    const protocol = req.protocol;
    const clientBaseUrl = `${protocol}://${host}`;

    const session = await activePaymentGateway.createCheckoutSession({
      applicationId: app.id,
      amount: feeConfig.amount,
      currency: feeConfig.currency,
      clientBaseUrl,
    });

    return res.json({
      checkoutUrl: session.checkoutUrl,
      transactionReference: session.transactionReference,
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyGatewayCallback(req, res, next) {
  try {
    const { ref, token } = req.query;
    if (!ref || !token) {
      return res.status(400).send("Invalid payment verification parameters.");
    }

    await activePaymentGateway.verifyTransactionServerSide(ref, token);

    // Redirect to frontend portal payment view
    const clientBase = process.env.CLIENT_URL || "http://localhost:5173";
    return res.redirect(`${clientBase.replace(/\/$/, "")}/portal.html#/payment`);
  } catch (err) {
    return res.status(400).send(`Payment verification failed: ${err.message}`);
  }
}

export async function getNotifications(req, res, next) {
  try {
    const pool = getPool();
    const [items] = await pool.query(
      `SELECT id, title, message, is_read AS \`read\`, created_at AS createdAt
       FROM notifications
       WHERE user_id = ?
       ORDER BY id DESC LIMIT 50`,
      [req.user.id]
    );

    return res.json({ items });
  } catch (err) {
    next(err);
  }
}

export async function markNotificationRead(req, res, next) {
  try {
    const pool = getPool();
    await pool.query(
      `UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.id]
    );
    return res.json({ message: "Notification marked as read." });
  } catch (err) {
    next(err);
  }
}
