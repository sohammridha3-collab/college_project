import { Router } from "express";
import { testConnection, getPool } from "../config/db.js";
import { DEFAULT_PROGRAMS } from "../config/localStore.js";
import { MIGRATIONS } from "../config/migrations.js";

const router = Router();

router.get("/health", async (req, res) => {
  const isMysql = await testConnection();
  res.status(200).json({
    status: "UP",
    database: isMysql ? "CONNECTED_MYSQL" : "LOCAL_PERSISTENT_STORE",
    mysqlConfigured: isMysql,
    migrationsCount: MIGRATIONS.length,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// Public institution metadata for landing page, deadline countdown, and programme catalog
router.get("/public/institution", async (req, res, next) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(`SELECT * FROM system_settings WHERE id = 1 LIMIT 1`);
    const s = rows[0] || {};
    let programs = DEFAULT_PROGRAMS;
    if (s.programs_json) {
      try {
        const parsed = JSON.parse(s.programs_json);
        if (Array.isArray(parsed) && parsed.length) programs = parsed;
      } catch { }
    }

    res.json({
      institutionName: s.institution_name || "Metropolitan University of Technology",
      applicationFee: s.application_fee ? Number(s.application_fee).toFixed(2) : "75.00",
      currency: s.currency || "USD",
      applicationDeadline: s.application_deadline ? new Date(s.application_deadline).toISOString().split("T")[0] : "2026-12-31",
      maxUploadMb: s.max_upload_mb || 5,
      registrationOpen: s.registration_open !== undefined ? Boolean(s.registration_open) : true,
      policies: s.policies || "All applicants must submit official transcripts and government photo ID before the deadline.",
      programs,
    });
  } catch (err) {
    next(err);
  }
});

// Secure backend verification endpoint for Application Acknowledgment QR / Reference ID
router.get("/verify/:referenceNumber", async (req, res, next) => {
  try {
    const ref = String(req.params.referenceNumber || "").trim();
    if (!ref) {
      return res.status(400).json({ verified: false, message: "Reference number is required." });
    }

    const pool = getPool();
    const [apps] = await pool.query(
      `SELECT * FROM admission_applications WHERE reference_number = ? LIMIT 1`,
      [ref]
    );

    if (!apps.length || (!apps[0].is_submitted && apps[0].status === "Draft")) {
      return res.status(404).json({
        verified: false,
        message: "No submitted application found matching this reference number.",
      });
    }

    const app = apps[0];
    const [settings] = await pool.query(`SELECT * FROM system_settings WHERE id = 1 LIMIT 1`);
    const instName = settings[0]?.institution_name || "Metropolitan University of Technology";
    const [profiles] = await pool.query(
      `SELECT full_name AS fullName FROM student_profiles WHERE user_id = ? LIMIT 1`,
      [app.user_id]
    );
    const [txs] = await pool.query(
      `SELECT * FROM payment_transactions WHERE application_id = ? AND status = 'Paid' LIMIT 1`,
      [app.id]
    );
    const rawName = profiles[0]?.fullName || "Verified Applicant";
    const parts = rawName.split(" ");
    const applicantMask = parts.map((p, idx) => (idx === 0 ? p : `${p.charAt(0)}.`)).join(" ");

    return res.json({
      verified: true,
      referenceNumber: app.reference_number,
      applicantMask,
      institutionName: instName,
      program: app.program || "Unspecified",
      status: app.status,
      feePaid: Boolean(txs.length),
      submittedAt: app.submitted_at || app.submittedAt,
      verifiedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// Policy-Grounded Optional AI / Rule-Based Admission FAQ Assistant
// Strictly answers ONLY from verified institution settings & programme catalog; never invents rules or decides admissions.
router.post("/faq/ask", async (req, res, next) => {
  try {
    const question = String(req.body?.question || "").trim();
    if (!question) {
      return res.status(400).json({ message: "Please provide a question." });
    }

    const pool = getPool();
    const [rows] = await pool.query(`SELECT * FROM system_settings WHERE id = 1 LIMIT 1`);
    const s = rows[0] || {};
    const inst = s.institution_name || "Metropolitan University of Technology";
    const fee = `${s.currency || "USD"} ${Number(s.application_fee || 75).toFixed(2)}`;
    const deadline = s.application_deadline ? new Date(s.application_deadline).toISOString().split("T")[0] : "2026-12-31";
    const maxMb = s.max_upload_mb || 5;
    const regOpen = s.registration_open !== undefined ? Boolean(s.registration_open) : true;
    const policies = s.policies || "Official transcripts and government-issued ID are required.";

    let programs = DEFAULT_PROGRAMS;
    if (s.programs_json) {
      try {
        const parsed = JSON.parse(s.programs_json);
        if (Array.isArray(parsed) && parsed.length) programs = parsed;
      } catch { }
    }

    const q = question.toLowerCase();
    let answer = "";
    let topic = "General Policy";

    if (/approve|accept me|reject|decide|can you admit|chance|will i get in/.test(q)) {
      topic = "Admission Decision Policy";
      answer = `As an automated Admission FAQ Assistant for ${inst}, I cannot evaluate individual eligibility or make admission decisions. All applications are reviewed by authorized Admission Officers and the Admissions Committee based on your verified documents, academic qualification, and entrance examination results.`;
    } else if (/fee|cost|price|payment|pay|refund|currency/.test(q)) {
      topic = "Application Fee";
      answer = `According to verified ${inst} settings, the official application fee is ${fee}. Payment must be completed through the portal's Application Fee section before you can submit your final application.`;
    } else if (/deadline|last date|due date|when.*close|open|registration/.test(q)) {
      topic = "Application Deadlines";
      answer = `The official application deadline for ${inst} is ${deadline}. Registration is currently ${regOpen ? "OPEN" : "CLOSED"}.`;
    } else if (/document|upload|pdf|photo|transcript|size|format|id proof|resubmit|correction/.test(q)) {
      topic = "Document Requirements";
      answer = `Applicants must upload required documents (ID Proof, Academic Transcript, Passport Photo, Certificate) in PDF, JPG, or PNG format up to ${maxMb} MB per file. If an officer marks a document as "Needs Correction", you can upload a replacement directly in the Documents section.`;
    } else if (/program|course|degree|major|department|seat|eligibility|score/.test(q)) {
      topic = "Available Programmes";
      const progList = programs.map(p => `• ${p.name} (${p.department}) — Seats: ${p.seats}, Min Score Guide: ${p.minScore}%`).join("\n");
      answer = `Here are the verified programmes currently configured at ${inst}:\n${progList}`;
    } else if (/interview|slot|schedule|verification/.test(q)) {
      topic = "Interviews & Verification";
      answer = `Applicants can view and book available verification/interview slots under the "Interviews & Slots" section of the student portal once slots are published by the Admissions Office.`;
    } else if (/ticket|help|support|contact|issue/.test(q)) {
      topic = "Student Support";
      answer = `If you need assistance with your application, documents, or fee payment, open the "Support Tickets" tab in your portal to submit a ticket directly to Admission Officers and Administrators.`;
    } else {
      topic = "Institution Admission Summary";
      answer = `Verified ${inst} Admission Information:\n• Application Fee: ${fee}\n• Application Deadline: ${deadline}\n• Registration Status: ${regOpen ? "Open" : "Closed"}\n• Max Document Size: ${maxMb} MB (PDF, JPG, PNG)\n• Institution Policy: ${policies}\n\nAsk about fees, deadlines, programmes, documents, interviews, or support tickets for specific policy details.`;
    }

    return res.json({
      question,
      topic,
      answer,
      source: `Verified Institution Policy (${inst})`,
      disclaimer: "Answers are strictly derived from live institution settings. Admission decisions are made solely by authorized Admission Officers.",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
