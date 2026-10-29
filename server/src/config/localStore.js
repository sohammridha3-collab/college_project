import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../../data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const DEFAULT_PROGRAMS = [
  { code: "CS-BSC", name: "Computer Science B.Sc.", department: "School of Computing & AI", seats: 120, duration: "4 Years", minScore: 75 },
  { code: "DS-BSC", name: "Data Science & AI B.Tech.", department: "School of Computing & AI", seats: 80, duration: "4 Years", minScore: 80 },
  { code: "ME-BSC", name: "Mechanical Engineering B.Sc.", department: "Faculty of Engineering", seats: 90, duration: "4 Years", minScore: 70 },
  { code: "EE-BSC", name: "Electrical & Electronics B.Eng.", department: "Faculty of Engineering", seats: 85, duration: "4 Years", minScore: 72 },
  { code: "BA-BBA", name: "Business Administration B.B.A.", department: "School of Management", seats: 150, duration: "3 Years", minScore: 65 },
  { code: "BIO-BSC", name: "Biotechnology & Life Sciences B.Sc.", department: "Faculty of Sciences", seats: 60, duration: "4 Years", minScore: 70 }
];

let store = null;

function saveStore() {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    try {
      setTimeout(() => {
        try { fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8"); } catch {}
      }, 50);
    } catch {}
  }
}

export async function initLocalStore() {
  if (fs.existsSync(STORE_PATH)) {
    try {
      store = JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
      // Ensure free admission policy in system_settings if still on legacy USD 75
      if (store.system_settings && store.system_settings[0]) {
        if (store.system_settings[0].application_fee === 75 || store.system_settings[0].currency === "USD") {
          store.system_settings[0].application_fee = 0.00;
          store.system_settings[0].currency = "INR";
          saveStore();
        }
      }
      return store;
    } catch (e) {}
  }

  const pwHash = await bcrypt.hash("Password123", 10);

  store = {
    roles: [
      { id: 1, name: "admin", description: "System Administrator" },
      { id: 2, name: "officer", description: "Admission Officer" },
      { id: 3, name: "student", description: "Student Applicant" },
    ],
    permissions: [
      { id: 1, key_name: "manage_users", label: "Manage Users" },
      { id: 2, key_name: "manage_roles", label: "Manage Roles & Permissions" },
      { id: 3, key_name: "system_settings", label: "System Settings" },
      { id: 4, key_name: "view_audit", label: "View Audit Logs" },
      { id: 5, key_name: "export_reports", label: "Export Reports" },
      { id: 6, key_name: "verify_docs", label: "Verify Documents" },
      { id: 7, key_name: "record_exams", label: "Record Examination Results" },
      { id: 8, key_name: "decide_application", label: "Decide Applications" },
      { id: 9, key_name: "submit_application", label: "Submit Application" },
      { id: 10, key_name: "upload_docs", label: "Upload Documents" },
      { id: 11, key_name: "pay_fee", label: "Pay Application Fee" },
    ],
    role_permissions: [
      { role_id: 1, permission_id: 1 }, { role_id: 1, permission_id: 2 }, { role_id: 1, permission_id: 3 },
      { role_id: 1, permission_id: 4 }, { role_id: 1, permission_id: 5 }, { role_id: 1, permission_id: 6 },
      { role_id: 1, permission_id: 7 }, { role_id: 1, permission_id: 8 }, { role_id: 1, permission_id: 9 },
      { role_id: 1, permission_id: 10 }, { role_id: 1, permission_id: 11 },
      { role_id: 2, permission_id: 6 }, { role_id: 2, permission_id: 7 }, { role_id: 2, permission_id: 8 }, { role_id: 2, permission_id: 5 },
      { role_id: 3, permission_id: 9 }, { role_id: 3, permission_id: 10 }, { role_id: 3, permission_id: 11 },
    ],
    users: [
      { id: 1, email: "admin@example.com", password_hash: pwHash, role_id: 1, status: "active", reset_token: null, reset_token_expires_at: null, created_at: new Date().toISOString() },
      { id: 2, email: "officer@example.com", password_hash: pwHash, role_id: 2, status: "active", reset_token: null, reset_token_expires_at: null, created_at: new Date().toISOString() },
      { id: 3, email: "student@example.com", password_hash: pwHash, role_id: 3, status: "active", reset_token: null, reset_token_expires_at: null, created_at: new Date().toISOString() },
    ],
    student_profiles: [
      { id: 1, user_id: 3, full_name: "Jane Doe", phone: "+1 555-0199", dob: "2004-05-15", gender: "Female", address: "45 Academic Avenue", created_at: new Date().toISOString() },
    ],
    admission_officers: [
      { id: 1, user_id: 2, full_name: "Dr. Evelyn Reed", department: "Faculty Admissions", created_at: new Date().toISOString() },
    ],
    admission_applications: [
      {
        id: 1, user_id: 3, reference_number: "APP-2026-1001", program: "Computer Science B.Sc.",
        prev_institution: "Oakridge High", qualification: "High School Diploma", score: 92.5,
        statement: "Passionate about software and computer science.", status: "Submitted", remarks: "",
        is_submitted: true, submitted_at: new Date().toISOString(), decided_at: null, created_at: new Date().toISOString()
      },
    ],
    uploaded_documents: [],
    application_status_history: [
      { id: 1, application_id: 1, step: "Account Created", status: "Complete", remarks: "Account registered.", created_at: new Date().toISOString() },
      { id: 2, application_id: 1, step: "Application Submitted", status: "Submitted", remarks: "Application received.", created_at: new Date().toISOString() },
    ],
    entrance_exam_results: [],
    payment_transactions: [
      { id: 1, application_id: 1, transaction_reference: "TX-INIT-001", amount: 75.00, currency: "USD", gateway: "MockGateway", status: "Paid", paid_at: new Date().toISOString(), created_at: new Date().toISOString() }
    ],
    notifications: [
      { id: 1, user_id: 3, title: "Welcome to Student Admission Portal", message: "Your demo student account is ready.", is_read: false, created_at: new Date().toISOString() }
    ],
    system_settings: [
      { id: 1, institution_name: "Metropolitan University of Technology", application_fee: 0.00, currency: "INR", application_deadline: "2026-12-31", max_upload_mb: 5, registration_open: 1, policies: "Admission is completely free for all applicants. All applicants must submit high school transcripts and verified government ID." }
    ],
    audit_logs: [
      { id: 1, user_id: 1, user_email: "admin@example.com", action: "SYSTEM_INIT", details: "Portal initialized", ip_address: "127.0.0.1", created_at: new Date().toISOString() }
    ],
  };

  saveStore();
  return store;
}

// SQL query emulation engine
export async function executeLocalQuery(sql, params = []) {
  if (!store) await initLocalStore();

  const clean = sql.trim().replace(/\s+/g, " ");

  // 1. SELECT registration_open FROM system_settings
  if (/SELECT registration_open FROM system_settings/i.test(clean)) {
    return [[store.system_settings[0]], []];
  }

  // 2. SELECT * FROM system_settings
  if (/SELECT \* FROM system_settings/i.test(clean) || /SELECT application_fee/i.test(clean)) {
    const s = store.system_settings[0] || {};
    return [[{ ...s, amount: s.application_fee }], []];
  }

  // 3. UPDATE system_settings / INSERT ON DUPLICATE KEY UPDATE
  if (/INSERT INTO system_settings/i.test(clean) || /UPDATE system_settings/i.test(clean)) {
    const s = store.system_settings[0];
    if (params.length >= 7) {
      s.institution_name = params[0] || s.institution_name;
      s.application_fee = params[1] || s.application_fee;
      s.currency = params[2] || s.currency;
      s.application_deadline = params[3] || s.application_deadline;
      s.max_upload_mb = params[4] || s.max_upload_mb;
      s.registration_open = params[5] ? 1 : 0;
      s.policies = params[6] || s.policies;
    }
    saveStore();
    return [{ affectedRows: 1 }, []];
  }

  // 4. SELECT id FROM users WHERE LOWER(email) = LOWER(?)
  if (/SELECT id FROM users WHERE LOWER\(email\) = LOWER\(\?\)/i.test(clean)) {
    const em = (params[0] || "").toLowerCase();
    const found = store.users.filter(u => u.email.toLowerCase() === em);
    return [found, []];
  }

  // 5. SELECT u.id, u.email, u.password_hash ... FROM users
  if (/FROM users\b/i.test(clean)) {
    let rows = store.users.map(u => {
      const role = store.roles.find(r => r.id === u.role_id)?.name || "student";
      const sp = store.student_profiles.find(p => p.user_id === u.id);
      const ao = store.admission_officers.find(a => a.user_id === u.id);
      const name = sp?.full_name || ao?.full_name || (role === "admin" ? "Admin" : u.email.split("@")[0]);
      return {
        id: u.id, email: u.email, password_hash: u.password_hash, status: u.status,
        role_id: u.role_id, role, name, full_name: name, created_at: u.created_at
      };
    });

    if (/LOWER\((?:u\.)?email\) = LOWER\(\?\)/i.test(clean)) {
      const em = (params[0] || "").toLowerCase();
      rows = rows.filter(r => r.email.toLowerCase() === em);
    } else if (/(?:u\.)?id = \?/i.test(clean)) {
      rows = rows.filter(r => String(r.id) === String(params[0]));
    } else if (/r\.name = \?/i.test(clean)) {
      rows = rows.filter(r => r.role === params[0]);
    } else if (/reset_token = \?/i.test(clean)) {
      const now = new Date();
      rows = store.users.filter(u => u.reset_token === params[0] && (!u.reset_token_expires_at || new Date(u.reset_token_expires_at) > now));
    }

    if (/SELECT COUNT\(\*\)/i.test(clean)) {
      return [[{ count: rows.length, total: rows.length }], []];
    }
    return [rows, []];
  }

  // 6. SELECT roles
  if (/FROM roles/i.test(clean)) {
    let r = store.roles;
    if (/WHERE name = \?/i.test(clean)) {
      r = r.filter(x => x.name === params[0]);
    } else if (/WHERE name = '([^']+)'/i.test(clean)) {
      const match = clean.match(/WHERE name = '([^']+)'/i);
      r = r.filter(x => x.name === match[1]);
    }
    return [r, []];
  }

  // 7. SELECT permissions
  if (/SELECT rp\.role_id, p\.key_name FROM role_permissions/i.test(clean)) {
    const list = store.role_permissions.map(rp => {
      const p = store.permissions.find(x => x.id === rp.permission_id);
      return { role_id: rp.role_id, key_name: p ? p.key_name : "" };
    });
    return [list, []];
  }
  if (/SELECT key_name AS `key`, label FROM permissions/i.test(clean) || /FROM permissions/i.test(clean)) {
    return [store.permissions.map(p => ({ key: p.key_name, key_name: p.key_name, label: p.label, id: p.id })), []];
  }

  // 8. INSERT INTO users
  if (/INSERT INTO users/i.test(clean)) {
    const nextId = Math.max(0, ...store.users.map(u => u.id)) + 1;
    const u = {
      id: nextId, email: params[0], password_hash: params[1], role_id: params[2],
      status: params[3] || "active", reset_token: null, reset_token_expires_at: null, created_at: new Date().toISOString()
    };
    store.users.push(u);
    saveStore();
    return [{ insertId: nextId, affectedRows: 1 }, []];
  }

  // 9. UPDATE users
  if (/UPDATE users/i.test(clean)) {
    if (/SET status = \?/i.test(clean)) {
      const u = store.users.find(x => String(x.id) === String(params[1]));
      if (u) u.status = params[0];
    } else if (/SET password_hash = \?/i.test(clean)) {
      const u = store.users.find(x => String(x.id) === String(params[params.length - 1]));
      if (u) {
        u.password_hash = params[0];
        if (/reset_token = NULL/i.test(clean)) {
          u.reset_token = null;
          u.reset_token_expires_at = null;
        }
      }
    } else if (/SET reset_token = \?/i.test(clean)) {
      const u = store.users.find(x => String(x.id) === String(params[2]));
      if (u) { u.reset_token = params[0]; u.reset_token_expires_at = params[1]; }
    }
    saveStore();
    return [{ affectedRows: 1 }, []];
  }

  // 10. Student profiles
  if (/INSERT INTO student_profiles/i.test(clean)) {
    const nextId = Math.max(0, ...store.student_profiles.map(p => p.id)) + 1;
    store.student_profiles.push({ id: nextId, user_id: params[0], full_name: params[1], phone: params[2] || "", created_at: new Date().toISOString() });
    saveStore();
    return [{ insertId: nextId, affectedRows: 1 }, []];
  }
  if (/SELECT.*FROM student_profiles WHERE user_id = \?/i.test(clean)) {
    const p = store.student_profiles.filter(x => String(x.user_id) === String(params[0]));
    return [p.map(x => ({ fullName: x.full_name, phone: x.phone, dob: x.dob, gender: x.gender, address: x.address })), []];
  }
  if (/UPDATE student_profiles/i.test(clean)) {
    const p = store.student_profiles.find(x => String(x.user_id) === String(params[params.length - 1]));
    if (p) {
      if (params[0]) p.full_name = params[0];
      if (params[1]) p.phone = params[1];
      if (params[2]) p.dob = params[2];
      if (params[3]) p.gender = params[3];
      if (params[4]) p.address = params[4];
    }
    saveStore();
    return [{ affectedRows: 1 }, []];
  }

  // 11. Admission applications
  if (/INSERT INTO admission_applications/i.test(clean)) {
    const nextId = Math.max(0, ...store.admission_applications.map(a => a.id)) + 1;
    const a = {
      id: nextId, user_id: params[0], reference_number: null, program: null, prev_institution: null,
      qualification: null, score: null, statement: null, status: params[1] || "Draft",
      is_submitted: false, submitted_at: null, remarks: null, created_at: new Date().toISOString()
    };
    store.admission_applications.push(a);
    saveStore();
    return [{ insertId: nextId, affectedRows: 1 }, []];
  }
  if (/SELECT.*FROM admission_applications WHERE user_id = \?/i.test(clean)) {
    const a = store.admission_applications.filter(x => String(x.user_id) === String(params[0]));
    return [a, []];
  }
  if (/SELECT.*FROM admission_applications WHERE id = \?/i.test(clean)) {
    const a = store.admission_applications.filter(x => String(x.id) === String(params[0]));
    return [a, []];
  }
  if (/UPDATE admission_applications/i.test(clean)) {
    const id = params[params.length - 1];
    const app = store.admission_applications.find(x => String(x.id) === String(id));
    if (app) {
      if (/SET program = \?/i.test(clean)) {
        app.program = params[0]; app.prev_institution = params[1]; app.qualification = params[2];
        app.score = params[3]; app.statement = params[4]; app.status = params[5];
      } else if (/SET status = 'Submitted'/i.test(clean)) {
        app.status = "Submitted"; app.is_submitted = true; app.reference_number = params[0]; app.submitted_at = params[1];
      } else if (/SET remarks = \?, status = 'Under review'/i.test(clean)) {
        app.remarks = params[0]; app.status = "Under review";
      } else if (/SET status = \?, remarks = \?, decided_at = NOW\(\)/i.test(clean)) {
        app.status = params[0]; app.remarks = params[1]; app.decided_at = new Date().toISOString();
      }
    }
    saveStore();
    return [{ affectedRows: 1 }, []];
  }

  // 12. Officer applications list: FROM admission_applications
  if (/FROM admission_applications/i.test(clean)) {
    if (/GROUP BY program/i.test(clean)) {
      const programs = {};
      store.admission_applications.filter(a => a.is_submitted).forEach(a => {
        const prog = a.program || "Unspecified";
        if (!programs[prog]) programs[prog] = { Program: prog, Applied: 0, Enrolled: 0, Approved: 0, PassRate: "0%" };
        programs[prog].Applied++;
        programs[prog].Enrolled++;
        if (a.status === "Approved") programs[prog].Approved++;
      });
      const rows = Object.values(programs);
      rows.forEach(r => {
        r.PassRate = `${r.Applied ? Math.round((r.Approved / r.Applied) * 100) : 0}%`;
      });
      return [rows, []];
    }

    let list = store.admission_applications.map(a => {
      const sp = store.student_profiles.find(p => p.user_id === a.user_id);
      const u = store.users.find(x => x.id === a.user_id);
      return {
        id: a.id, user_id: a.user_id, applicantName: sp?.full_name || "Applicant", email: u?.email || "",
        phone: sp?.phone || "", dob: sp?.dob || "", gender: sp?.gender || "", address: sp?.address || "",
        program: a.program, prevInstitution: a.prev_institution, qualification: a.qualification,
        score: a.score, statement: a.statement, status: a.status, remarks: a.remarks,
        submittedAt: a.submitted_at, referenceNumber: a.reference_number, is_submitted: a.is_submitted
      };
    });

    if (/(?:a\.)?is_submitted = TRUE/i.test(clean)) list = list.filter(x => x.is_submitted);
    if (/(?:a\.)?status = \?/i.test(clean)) list = list.filter(x => x.status === params[0]);
    if (/(?:a\.)?status = 'Approved'/i.test(clean)) list = list.filter(x => x.status === "Approved");
    if (/(?:a\.)?status = 'Rejected'/i.test(clean)) list = list.filter(x => x.status === "Rejected");
    if (/status IN \('Approved', 'Rejected'\)/i.test(clean)) list = list.filter(x => x.status === "Approved" || x.status === "Rejected");
    if (/status = 'Under review' OR status = 'Submitted'/i.test(clean)) list = list.filter(x => x.status === "Under review" || x.status === "Submitted");
    if (/(?:a\.)?id = \?/i.test(clean)) list = list.filter(x => String(x.id) === String(params[0]));

    if (/SELECT COUNT\(\*\)/i.test(clean)) return [[{ total: list.length, count: list.length }], []];
    return [list, []];
  }

  // 13. Uploaded documents
  if (/INSERT INTO uploaded_documents/i.test(clean)) {
    const nextId = Math.max(0, ...store.uploaded_documents.map(d => d.id)) + 1;
    let status = "Pending";
    let fileData = null;
    if (params.length >= 9) {
      status = params[7] || "Pending";
      fileData = params[8] || null;
    } else {
      status = "Pending";
      fileData = params[7] || null;
    }
    const doc = {
      id: nextId, application_id: params[0], type: params[1], original_name: params[2],
      stored_filename: params[3], file_path: params[4], file_size: params[5], mime_type: params[6],
      status, remarks: null, file_data: fileData, created_at: new Date().toISOString()
    };
    store.uploaded_documents.push(doc);
    saveStore();
    return [{ insertId: nextId, affectedRows: 1 }, []];
  }
  if (/SELECT.*FROM uploaded_documents/i.test(clean)) {
    let docs = store.uploaded_documents.map(d => {
      const app = store.admission_applications.find(a => String(a.id) === String(d.application_id));
      const sp = app ? store.student_profiles.find(p => String(p.user_id) === String(app.user_id)) : null;
      return {
        id: d.id, applicationId: d.application_id, application_id: d.application_id, user_id: app?.user_id,
        applicantName: sp?.full_name || "Applicant", type: d.type, name: d.original_name,
        original_name: d.original_name, stored_filename: d.stored_filename, file_path: d.file_path,
        file_size: d.file_size, mime_type: d.mime_type, status: d.status, remarks: d.remarks, file_data: d.file_data || null
      };
    });
    const hasDocId = /\b(?:d\.)?id\s*=\s*\?/i.test(clean);
    const hasAppId = /(?:d\.)?application_id\s*=\s*\?/i.test(clean);

    if (hasDocId && hasAppId) {
      docs = docs.filter(d => String(d.id) === String(params[0]) && String(d.application_id) === String(params[1]));
    } else if (hasAppId) {
      docs = docs.filter(d => String(d.application_id) === String(params[0]));
    } else if (hasDocId) {
      docs = docs.filter(d => String(d.id) === String(params[0]));
    }
    if (/SELECT COUNT\(\*\)/i.test(clean)) return [[{ total: docs.length, count: docs.length }], []];
    return [docs, []];
  }
  if (/UPDATE uploaded_documents/i.test(clean)) {
    const id = params[params.length - 1];
    const doc = store.uploaded_documents.find(x => String(x.id) === String(id));
    if (doc) { doc.status = params[0]; doc.remarks = params[1]; }
    saveStore();
    return [{ affectedRows: 1 }, []];
  }
  if (/DELETE FROM uploaded_documents/i.test(clean)) {
    store.uploaded_documents = store.uploaded_documents.filter(x => String(x.id) !== String(params[0]));
    saveStore();
    return [{ affectedRows: 1 }, []];
  }

  // 14. Status history / timeline
  if (/INSERT INTO application_status_history/i.test(clean)) {
    const nextId = Math.max(0, ...store.application_status_history.map(h => h.id)) + 1;
    store.application_status_history.push({
      id: nextId, application_id: params[0], step: params[1], status: params[2], remarks: params[3] || null, created_at: new Date().toISOString()
    });
    saveStore();
    return [{ insertId: nextId, affectedRows: 1 }, []];
  }
  if (/SELECT.*FROM application_status_history/i.test(clean)) {
    const rows = store.application_status_history.filter(h => String(h.application_id) === String(params[0]));
    return [rows.map(r => ({ step: r.step, status: r.status, remarks: r.remarks, date: r.created_at, created_at: r.created_at })), []];
  }

  // 15. Entrance exams
  if (/INSERT INTO entrance_exam_results/i.test(clean)) {
    const existing = store.entrance_exam_results.find(e => String(e.application_id) === String(params[0]));
    if (existing) {
      existing.score = params[1]; existing.result = params[2]; existing.exam_date = params[3]; existing.notes = params[4];
    } else {
      const nextId = Math.max(0, ...store.entrance_exam_results.map(e => e.id)) + 1;
      store.entrance_exam_results.push({ id: nextId, application_id: params[0], score: params[1], result: params[2], exam_date: params[3], notes: params[4], created_at: new Date().toISOString() });
    }
    saveStore();
    return [{ affectedRows: 1 }, []];
  }
  if (/FROM entrance_exam_results/i.test(clean) || /LEFT JOIN entrance_exam_results/i.test(clean)) {
    const list = store.admission_applications.filter(a => a.is_submitted).map(a => {
      const sp = store.student_profiles.find(p => p.user_id === a.user_id);
      const ex = store.entrance_exam_results.find(e => e.application_id === a.id);
      return {
        applicationId: a.id, applicantName: sp?.full_name || "Applicant", score: ex?.score || "–",
        result: ex?.result || "Pending", examDate: ex?.exam_date || null, notes: ex?.notes || null
      };
    });
    if (/SELECT COUNT\(\*\)/i.test(clean)) return [[{ total: list.length, count: list.length }], []];
    return [list, []];
  }

  // 16. Payment transactions
  if (/INSERT INTO payment_transactions/i.test(clean)) {
    const nextId = Math.max(0, ...store.payment_transactions.map(t => t.id)) + 1;
    store.payment_transactions.push({
      id: nextId, application_id: params[0], transaction_reference: params[1], amount: params[2],
      currency: params[3], gateway: params[4] || "MockGateway", gateway_transaction_id: params[5],
      status: params[6] || "Pending", paid_at: null, created_at: new Date().toISOString()
    });
    saveStore();
    return [{ insertId: nextId, affectedRows: 1 }, []];
  }
  if (/SELECT.*FROM payment_transactions/i.test(clean)) {
    if (/SUM\(amount\)/i.test(clean)) {
      const paidTxs = store.payment_transactions.filter(t => t.status === "Paid");
      const sum = paidTxs.reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);
      return [[{ total: sum }], []];
    }
    let rows = store.payment_transactions;
    if (/transaction_reference = \?/i.test(clean)) rows = rows.filter(t => t.transaction_reference === params[0]);
    if (/application_id = \?/i.test(clean)) rows = rows.filter(t => String(t.application_id) === String(params[0]));
    if (/status = 'Paid'/i.test(clean)) rows = rows.filter(t => t.status === "Paid");
    return [rows, []];
  }
  if (/UPDATE payment_transactions SET status = 'Paid'/i.test(clean)) {
    const tx = store.payment_transactions.find(t => String(t.id) === String(params[0]));
    if (tx) { tx.status = "Paid"; tx.paid_at = new Date().toISOString(); }
    saveStore();
    return [{ affectedRows: 1 }, []];
  }

  // 17. Notifications
  if (/INSERT INTO notifications/i.test(clean)) {
    const nextId = Math.max(0, ...store.notifications.map(n => n.id)) + 1;
    store.notifications.push({ id: nextId, user_id: params[0], title: params[1], message: params[2], is_read: false, created_at: new Date().toISOString() });
    saveStore();
    return [{ insertId: nextId, affectedRows: 1 }, []];
  }
  if (/SELECT.*FROM notifications WHERE user_id = \?/i.test(clean)) {
    const rows = store.notifications.filter(n => String(n.user_id) === String(params[0])).reverse();
    return [rows.map(r => ({ id: r.id, title: r.title, message: r.message, read: r.is_read, is_read: r.is_read, createdAt: r.created_at })), []];
  }
  if (/UPDATE notifications SET is_read = TRUE/i.test(clean)) {
    const n = store.notifications.find(x => String(x.id) === String(params[0]));
    if (n) n.is_read = true;
    saveStore();
    return [{ affectedRows: 1 }, []];
  }

  // 18. Audit logs
  if (/INSERT INTO audit_logs/i.test(clean)) {
    const nextId = Math.max(0, ...store.audit_logs.map(l => l.id)) + 1;
    store.audit_logs.push({ id: nextId, user_id: params[0], user_email: params[1], action: params[2], details: params[3], ip_address: params[4], created_at: new Date().toISOString() });
    saveStore();
    return [{ insertId: nextId, affectedRows: 1 }, []];
  }
  if (/FROM audit_logs/i.test(clean)) {
    const rows = store.audit_logs.slice().reverse();
    if (/SELECT COUNT\(\*\)/i.test(clean)) return [[{ total: rows.length }], []];
    return [rows.map(r => ({ id: r.id, user: r.user_email || "System", action: r.action, details: r.details, ip: r.ip_address, createdAt: r.created_at })), []];
  }

  // 19. Admission officers
  if (/INSERT INTO admission_officers/i.test(clean)) {
    const nextId = Math.max(0, ...store.admission_officers.map(a => a.id)) + 1;
    store.admission_officers.push({ id: nextId, user_id: params[0], full_name: params[1], department: "Admissions", created_at: new Date().toISOString() });
    saveStore();
    return [{ insertId: nextId, affectedRows: 1 }, []];
  }
  if (/UPDATE admission_officers/i.test(clean)) {
    const a = store.admission_officers.find(x => String(x.user_id) === String(params[1]));
    if (a) a.full_name = params[0];
    saveStore();
    return [{ affectedRows: 1 }, []];
  }

  // 20. Role permissions
  if (/DELETE FROM role_permissions WHERE role_id = \?/i.test(clean)) {
    store.role_permissions = store.role_permissions.filter(rp => String(rp.role_id) !== String(params[0]));
    saveStore();
    return [{ affectedRows: 1 }, []];
  }
  if (/INSERT INTO role_permissions/i.test(clean)) {
    store.role_permissions.push({ role_id: params[0], permission_id: params[1] });
    saveStore();
    return [{ affectedRows: 1 }, []];
  }

  // Default fallback for any unhandled query
  return [[], []];
}

export function getLocalPool() {
  return {
    query: executeLocalQuery,
    async getConnection() {
      return {
        query: executeLocalQuery,
        async beginTransaction() {},
        async commit() {},
        async rollback() {},
        release() {},
      };
    },
  };
}
