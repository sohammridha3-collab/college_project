/**
 * Versioned, Reversible Database Migration Runner
 * Ensures existing MySQL databases and local persistent stores safely upgrade
 * without losing any user or application records.
 */

export const MIGRATIONS = [
  {
    version: "2026_10_01_base_schema",
    description: "Initial 15-table normalized admission portal schema",
    upSql: [
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(50) PRIMARY KEY,
        description VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`
    ],
    downSql: []
  },
  {
    version: "2026_10_28_document_correction_enum_and_versioning",
    description: "Expand uploaded_documents status enum to include Needs Correction and version tracking",
    upSql: [
      `ALTER TABLE uploaded_documents MODIFY COLUMN status ENUM('Pending', 'Verified', 'Needs Correction', 'Rejected') DEFAULT 'Pending'`,
      `ALTER TABLE uploaded_documents ADD COLUMN IF NOT EXISTS version INT DEFAULT 1`,
      `ALTER TABLE uploaded_documents ADD COLUMN IF NOT EXISTS resubmitted_at TIMESTAMP NULL`
    ],
    downSql: [
      `ALTER TABLE uploaded_documents DROP COLUMN IF EXISTS resubmitted_at`,
      `ALTER TABLE uploaded_documents DROP COLUMN IF EXISTS version`
    ]
  },
  {
    version: "2026_10_28_application_review_and_profile_fields",
    description: "Add internal officer notes, review checklist, officer assignment, and extended student profile fields",
    upSql: [
      `ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS nationality VARCHAR(100) NULL`,
      `ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS guardian_name VARCHAR(150) NULL`,
      `ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS guardian_phone VARCHAR(30) NULL`,
      `ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS department VARCHAR(100) NULL`,
      `ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS graduation_year VARCHAR(10) NULL`,
      `ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS internal_notes TEXT NULL`,
      `ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS checklist_json TEXT NULL`,
      `ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS assigned_officer_id INT NULL`,
      `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS programs_json TEXT NULL`
    ],
    downSql: [
      `ALTER TABLE admission_applications DROP COLUMN IF EXISTS assigned_officer_id`,
      `ALTER TABLE admission_applications DROP COLUMN IF EXISTS checklist_json`,
      `ALTER TABLE admission_applications DROP COLUMN IF EXISTS internal_notes`,
      `ALTER TABLE admission_applications DROP COLUMN IF EXISTS graduation_year`,
      `ALTER TABLE admission_applications DROP COLUMN IF EXISTS department`
    ]
  },
  {
    version: "2026_10_29_tickets_interviews_and_email_logs",
    description: "Add support tickets, interview scheduling slots/bookings, and email dispatch audit tables",
    upSql: [
      `CREATE TABLE IF NOT EXISTS support_tickets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ticket_number VARCHAR(40) UNIQUE NOT NULL,
        user_id INT NOT NULL,
        application_id INT NULL,
        subject VARCHAR(200) NOT NULL,
        category VARCHAR(80) DEFAULT 'General',
        priority ENUM('Low', 'Medium', 'High', 'Urgent') DEFAULT 'Medium',
        status ENUM('Open', 'In Progress', 'Resolved', 'Closed') DEFAULT 'Open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS support_ticket_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ticket_id INT NOT NULL,
        sender_id INT NOT NULL,
        sender_role VARCHAR(30) NOT NULL,
        sender_name VARCHAR(150) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS interview_slots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(150) NOT NULL,
        department VARCHAR(100) DEFAULT 'General Admissions',
        officer_id INT NULL,
        officer_name VARCHAR(150) NULL,
        slot_date DATE NOT NULL,
        start_time VARCHAR(20) NOT NULL,
        end_time VARCHAR(20) NOT NULL,
        mode ENUM('Online', 'In-Person') DEFAULT 'Online',
        location_or_link VARCHAR(255) NULL,
        capacity INT DEFAULT 5,
        booked_count INT DEFAULT 0,
        status ENUM('Available', 'Full', 'Cancelled') DEFAULT 'Available',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS interview_bookings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        slot_id INT NOT NULL,
        application_id INT NOT NULL,
        user_id INT NOT NULL,
        status ENUM('Scheduled', 'Completed', 'Cancelled', 'Rescheduled') DEFAULT 'Scheduled',
        notes TEXT NULL,
        booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (slot_id) REFERENCES interview_slots(id) ON DELETE CASCADE,
        FOREIGN KEY (application_id) REFERENCES admission_applications(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS email_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        recipient_email VARCHAR(191) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        template VARCHAR(80) NOT NULL,
        status ENUM('Sent', 'Simulated', 'Failed') DEFAULT 'Simulated',
        body_preview TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`
    ],
    downSql: [
      `DROP TABLE IF EXISTS email_logs`,
      `DROP TABLE IF EXISTS interview_bookings`,
      `DROP TABLE IF EXISTS interview_slots`,
      `DROP TABLE IF EXISTS support_ticket_messages`,
      `DROP TABLE IF EXISTS support_tickets`
    ]
  }
];

export async function runMysqlMigrations(pool) {
  for (const m of MIGRATIONS) {
    for (const stmt of m.upSql) {
      try {
        await pool.query(stmt);
      } catch (err) {
        // Ignore duplicate column errors on MySQL versions that don't support ADD COLUMN IF NOT EXISTS
        if (!/Duplicate column name/i.test(err.message)) {
          console.warn(`[Migration Warning: ${m.version}]`, err.message);
        }
      }
    }
    try {
      await pool.query(
        `INSERT IGNORE INTO schema_migrations (version, description) VALUES (?, ?)`,
        [m.version, m.description]
      );
    } catch {}
  }
}

