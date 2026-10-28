# Student Admission Portal - Backend API

Production-ready, modular REST API server built with **Node.js**, **Express.js**, and **MySQL**.

---

## 🏗️ Architecture & Folder Structure

```
server/
├── .env.example              # Template environment variables
├── .env                      # Local configuration (set your DB_PASSWORD here)
├── package.json              # Backend dependencies and npm scripts
├── uploads/                  # Secure uploaded document storage
└── src/
    ├── config/
    │   ├── db.js             # MySQL connection pool & auto-migration
    │   └── schema.sql        # 15 normalized MySQL relational tables
    ├── middleware/
    │   ├── auth.js           # JWT authentication & role-based authorization
    │   ├── upload.js         # Multer file upload (PDF/JPG/PNG, size limit)
    │   └── errorHandler.js   # Centralized error handler
    ├── services/
    │   ├── auditService.js   # Audit trail logger
    │   └── paymentService.js # Server-side payment gateway verification
    ├── controllers/
    │   ├── authController.js    # Register, login, logout, password recovery
    │   ├── studentController.js # Dashboard, application, documents, fee
    │   ├── officerController.js # Verification, review, exam, decisions, reports
    │   └── adminController.js   # Users, roles, settings, audit, reports
    ├── routes/
    │   ├── authRoutes.js
    │   ├── studentRoutes.js
    │   ├── officerRoutes.js
    │   ├── adminRoutes.js
    │   └── healthRoutes.js   # GET /api/health
    ├── scripts/
    │   └── seed.js           # Database seeder with demo accounts
    └── server.js             # Express app entry point
```

---

## 🗄️ Database Schema

The normalized MySQL schema (`src/config/schema.sql`) implements:
1. `roles` (student, officer, admin)
2. `permissions` (fine-grained access controls)
3. `role_permissions` (junction table)
4. `users` (bcrypt hashed passwords, session status, reset tokens)
5. `student_profiles` (full name, phone, dob, gender, address)
6. `admission_officers` (full name, department)
7. `admission_applications` (program, scores, statement, status lifecycle)
8. `uploaded_documents` (file metadata, verification status, remarks)
9. `application_status_history` (audit timeline of application state changes)
10. `entrance_exam_results` (scores, pass/fail results, notes)
11. `payment_transactions` (server-side verified transaction references)
12. `officer_assignments` (application-to-officer routing)
13. `notifications` (in-portal notifications with read tracking)
14. `system_settings` (institution name, fee, deadline, upload limit, policy)
15. `audit_logs` (administrative action logging with IP addresses)

---

## 🚀 Setup & Running Instructions

### 1. Configure Environment
Copy `.env.example` to `.env` (if not already done) and set your local MySQL password:
```ini
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=admission_portal
PORT=3000
```

### 2. Seed Database
Run the seeder to automatically create tables, settings, permissions, and test accounts:
```bash
npm run seed
```

### 3. Start Backend Server
```bash
npm start
```
The server will run at `http://localhost:3000`.

### 4. Health Check
Verify the server and database status:
```bash
curl http://localhost:3000/api/health
```

---

## 🔑 Development Test Accounts

| Role | Email | Password |
|---|---|---|
| **Admin** | `admin@example.com` | `Password123` |
| **Admission Officer** | `officer@example.com` | `Password123` |
| **Student** | `student@example.com` | `Password123` |
