-- Student Admission Portal Database Schema
CREATE DATABASE IF NOT EXISTS admission_portal;
USE admission_portal;

-- 1. Roles
CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Permissions
CREATE TABLE IF NOT EXISTS permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  key_name VARCHAR(100) UNIQUE NOT NULL,
  label VARCHAR(150) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. Role-Permissions
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT NOT NULL,
  permission_id INT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. Users
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(191) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role_id INT NOT NULL,
  status ENUM('active', 'suspended') DEFAULT 'active',
  reset_token VARCHAR(255) NULL,
  reset_token_expires_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

-- 5. Student Profiles
CREATE TABLE IF NOT EXISTS student_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNIQUE NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  dob DATE NULL,
  gender VARCHAR(30) NULL,
  address TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 6. Admission Officers
CREATE TABLE IF NOT EXISTS admission_officers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNIQUE NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  department VARCHAR(100) DEFAULT 'Admissions',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 7. Admission Applications
CREATE TABLE IF NOT EXISTS admission_applications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  reference_number VARCHAR(50) UNIQUE NULL,
  program VARCHAR(150) NULL,
  prev_institution VARCHAR(150) NULL,
  qualification VARCHAR(150) NULL,
  score DECIMAL(5,2) NULL,
  statement TEXT NULL,
  status ENUM('Draft', 'Submitted', 'Under review', 'Approved', 'Rejected') DEFAULT 'Draft',
  remarks TEXT NULL,
  is_submitted BOOLEAN DEFAULT FALSE,
  submitted_at TIMESTAMP NULL,
  decided_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_app_user (user_id),
  INDEX idx_app_status (status),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 8. Uploaded Documents
CREATE TABLE IF NOT EXISTS uploaded_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  application_id INT NOT NULL,
  type VARCHAR(100) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(255) NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  file_size INT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  status ENUM('Pending', 'Verified', 'Rejected') DEFAULT 'Pending',
  remarks TEXT NULL,
  verified_by INT NULL,
  verified_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES admission_applications(id) ON DELETE CASCADE,
  FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 9. Application Status History (Timeline)
CREATE TABLE IF NOT EXISTS application_status_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  application_id INT NOT NULL,
  step VARCHAR(150) NOT NULL,
  status VARCHAR(50) NOT NULL,
  remarks TEXT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES admission_applications(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 10. Entrance Examination Results
CREATE TABLE IF NOT EXISTS entrance_exam_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  application_id INT UNIQUE NOT NULL,
  score DECIMAL(5,2) NOT NULL,
  result ENUM('Pass', 'Fail', 'Absent', 'Exempt') NOT NULL,
  exam_date DATE NULL,
  notes TEXT NULL,
  recorded_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES admission_applications(id) ON DELETE CASCADE,
  FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 11. Payment Transactions
CREATE TABLE IF NOT EXISTS payment_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  application_id INT NOT NULL,
  transaction_reference VARCHAR(100) UNIQUE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  gateway VARCHAR(50) DEFAULT 'MockGateway',
  gateway_transaction_id VARCHAR(150) NULL,
  status ENUM('Pending', 'Paid', 'Failed', 'Refunded') DEFAULT 'Pending',
  paid_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES admission_applications(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 12. Officer Assignments
CREATE TABLE IF NOT EXISTS officer_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  application_id INT NOT NULL,
  officer_id INT NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_assignment (application_id, officer_id),
  FOREIGN KEY (application_id) REFERENCES admission_applications(id) ON DELETE CASCADE,
  FOREIGN KEY (officer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 13. Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 14. System Settings
CREATE TABLE IF NOT EXISTS system_settings (
  id INT PRIMARY KEY DEFAULT 1,
  institution_name VARCHAR(200) DEFAULT 'Metropolitan University of Technology',
  application_fee DECIMAL(10,2) DEFAULT 75.00,
  currency VARCHAR(10) DEFAULT 'USD',
  application_deadline DATE DEFAULT '2026-12-31',
  max_upload_mb INT DEFAULT 5,
  registration_open BOOLEAN DEFAULT TRUE,
  policies TEXT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 15. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  user_email VARCHAR(191) NULL,
  action VARCHAR(100) NOT NULL,
  details TEXT NULL,
  ip_address VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
