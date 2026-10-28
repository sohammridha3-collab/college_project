import bcrypt from "bcryptjs";
import { getPool, initDatabase } from "../config/db.js";

async function seed() {
  console.log("🌱 Starting development database seeding...");

  await initDatabase();
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1. Seed Roles
    const roles = [
      { name: "admin", desc: "System Administrator" },
      { name: "officer", desc: "Admission Officer" },
      { name: "student", desc: "Student Applicant" },
    ];
    for (const r of roles) {
      await conn.query(
        `INSERT INTO roles (name, description) VALUES (?, ?) ON DUPLICATE KEY UPDATE description = VALUES(description)`,
        [r.name, r.desc]
      );
    }

    // 2. Seed Permissions
    const permissions = [
      { key: "manage_users", label: "Manage Users" },
      { key: "manage_roles", label: "Manage Roles & Permissions" },
      { key: "system_settings", label: "System Settings" },
      { key: "view_audit", label: "View Audit Logs" },
      { key: "export_reports", label: "Export Reports" },
      { key: "verify_docs", label: "Verify Documents" },
      { key: "record_exams", label: "Record Examination Results" },
      { key: "decide_application", label: "Decide Applications" },
      { key: "submit_application", label: "Submit Application" },
      { key: "upload_docs", label: "Upload Documents" },
      { key: "pay_fee", label: "Pay Application Fee" },
    ];
    for (const p of permissions) {
      await conn.query(
        `INSERT INTO permissions (key_name, label) VALUES (?, ?) ON DUPLICATE KEY UPDATE label = VALUES(label)`,
        [p.key, p.label]
      );
    }

    // 3. Map Role Permissions
    const [roleRows] = await conn.query(`SELECT id, name FROM roles`);
    const [permRows] = await conn.query(`SELECT id, key_name FROM permissions`);

    const adminRole = roleRows.find(r => r.name === "admin");
    const officerRole = roleRows.find(r => r.name === "officer");
    const studentRole = roleRows.find(r => r.name === "student");

    for (const p of permRows) {
      // Admin has all
      await conn.query(`INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`, [adminRole.id, p.id]);

      // Officer permissions
      if (["verify_docs", "record_exams", "decide_application", "export_reports"].includes(p.key_name)) {
        await conn.query(`INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`, [officerRole.id, p.id]);
      }

      // Student permissions
      if (["submit_application", "upload_docs", "pay_fee"].includes(p.key_name)) {
        await conn.query(`INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`, [studentRole.id, p.id]);
      }
    }

    // 4. Seed System Settings
    await conn.query(
      `INSERT INTO system_settings (id, institution_name, application_fee, currency, application_deadline, max_upload_mb, registration_open, policies)
       VALUES (1, 'Metropolitan University of Technology', 75.00, 'USD', '2026-12-31', 5, 1, 'Official university admission rules and policies.')
       ON DUPLICATE KEY UPDATE institution_name = VALUES(institution_name)`
    );

    // 5. Common test password: Password123
    const passwordHash = await bcrypt.hash("Password123", 10);

    // 5a. Admin Account
    const [adminUser] = await conn.query(
      `INSERT INTO users (email, password_hash, role_id, status)
       VALUES ('admin@example.com', ?, ?, 'active')
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
      [passwordHash, adminRole.id]
    );

    // 5b. Officer Account
    const [officerUser] = await conn.query(
      `INSERT INTO users (email, password_hash, role_id, status)
       VALUES ('officer@example.com', ?, ?, 'active')
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
      [passwordHash, officerRole.id]
    );
    const [officerRows] = await conn.query(`SELECT id FROM users WHERE email = 'officer@example.com'`);
    await conn.query(
      `INSERT INTO admission_officers (user_id, full_name, department)
       VALUES (?, 'Dr. Evelyn Reed', 'Faculty Admissions')
       ON DUPLICATE KEY UPDATE full_name = VALUES(full_name)`,
      [officerRows[0].id]
    );

    // 5c. Student Account
    await conn.query(
      `INSERT INTO users (email, password_hash, role_id, status)
       VALUES ('student@example.com', ?, ?, 'active')
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
      [passwordHash, studentRole.id]
    );
    const [studentRows] = await conn.query(`SELECT id FROM users WHERE email = 'student@example.com'`);
    const studentUserId = studentRows[0].id;

    await conn.query(
      `INSERT INTO student_profiles (user_id, full_name, phone, dob, gender, address)
       VALUES (?, 'Jane Doe', '+1 555-0199', '2004-05-15', 'Female', '45 Academic Avenue')
       ON DUPLICATE KEY UPDATE full_name = VALUES(full_name)`,
      [studentUserId]
    );

    // Sample student application
    const [existingApp] = await conn.query(`SELECT id FROM admission_applications WHERE user_id = ?`, [studentUserId]);
    let appId;
    if (!existingApp.length) {
      const [appRes] = await conn.query(
        `INSERT INTO admission_applications (user_id, reference_number, program, prev_institution, qualification, score, statement, status, is_submitted, submitted_at)
         VALUES (?, 'APP-2026-1001', 'Computer Science B.Sc.', 'Oakridge High', 'High School Diploma', 92.50, 'Passionate about computing.', 'Submitted', TRUE, NOW())`,
        [studentUserId]
      );
      appId = appRes.insertId;

      // Status history
      await conn.query(
        `INSERT INTO application_status_history (application_id, step, status, remarks)
         VALUES (?, 'Account Created', 'Complete', 'Student account initialized.'),
                (?, 'Application Submitted', 'Submitted', 'Application submitted with reference #APP-2026-1001')`,
        [appId, appId]
      );

      // Sample paid transaction
      await conn.query(
        `INSERT INTO payment_transactions (application_id, transaction_reference, amount, currency, status, paid_at)
         VALUES (?, 'TX-SEED-001', 75.00, 'USD', 'Paid', NOW())`,
        [appId]
      );

      // Sample notification
      await conn.query(
        `INSERT INTO notifications (user_id, title, message)
         VALUES (?, 'Welcome to Student Admission Portal', 'Your account has been set up with demo data. You can log in and explore.')`,
        [studentUserId]
      );
    }

    await conn.commit();
    console.log("✅ Database seeded successfully!");
    console.log("\n📋 Development Credentials:");
    console.log("--------------------------------------------------");
    console.log("Admin:   admin@example.com   / Password123");
    console.log("Officer: officer@example.com / Password123");
    console.log("Student: student@example.com / Password123");
    console.log("--------------------------------------------------\n");
    process.exit(0);
  } catch (err) {
    await conn.rollback();
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  } finally {
    conn.release();
  }
}

seed();
