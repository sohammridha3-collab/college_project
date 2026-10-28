# Student Admission Portal — Full-Stack Production Documentation

A secure, full-stack web application designed for higher-education institutions to manage the student admission lifecycle end-to-end: student registration, online application form completion, protected document uploads, application fee payment processing, admission officer reviews, entrance examination score recording, automated admission committee decisions, and administrative governance.

---

## 1. Technology Stack

- **Frontend**:
  - Semantic HTML5, Vanilla CSS3 (Custom Responsive Design System with zero external framework dependencies), Modern ES6+ JavaScript modules.
  - Dynamic API configuration layer with cross-origin cookie management (`credentials: "include"`).
  - Lucide Icons for responsive UI indicators.
- **Backend**:
  - Node.js (v18+) with Express.js REST API architecture.
  - Modular layered structure: `controllers`, `services`, `routes`, `middleware`, `config`, and `scripts`.
  - Authentication: JWT (JSON Web Tokens) with HTTP-only, secure, `SameSite=Lax` session cookies.
  - Password Security: `bcryptjs` (salt rounds: 10).
  - File Uploads: `multer` with strict 5MB file-size limit and restricted MIME-type validation.
  - Security Headers & Protection: Custom security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `X-XSS-Protection`, `Referrer-Policy`) and in-memory brute-force rate limiting.
- **Database Engine**:
  - **Primary**: MySQL 8.0+ with normalized 15-table relational schema ([server/src/config/schema.sql](server/src/config/schema.sql)), foreign keys, cascading constraints, and indexed lookups.
  - **Zero-Config Persistent Engine**: Built-in dual-engine adapter ([server/src/config/localStore.js](server/src/config/localStore.js)) providing immediate file-backed relational persistence ([server/data/store.json](server/data/store.json)) if MySQL root credentials are not yet configured in `.env`.

---

## 2. Directory Structure

```
college_project/
├── index.html                   # Public portal landing page
├── auth.html                    # Unified authentication view (login, register, forgot, reset)
├── portal.html                  # Role-based authenticated single-page portal
├── styles.css                   # Core responsive styling tokens and utilities
├── css/
│   └── styles.css               # Mirror copy for directory-level asset resolution
├── js/
│   ├── api.js                   # Central API configuration and fetch wrapper
│   ├── app.js                   # Portal views, dashboard controllers, routing, workflows
│   ├── auth.js                  # Authentication controller, form binders, reset handler
│   └── ui.js                    # UI components (dialogs, tables, notifications, validation)
├── README.md                    # This complete documentation
└── server/                      # Express Backend
    ├── package.json             # Backend dependencies and test scripts
    ├── .env                     # Local active environment configuration
    ├── .env.example             # Template for production environment configuration
    ├── uploads/                 # Protected server storage directory for uploaded files
    ├── data/
    │   └── store.json           # Relational persistent data store
    └── src/
        ├── server.js            # Express application entrypoint, CORS, security headers
        ├── config/
        │   ├── db.js            # Database connection pool and schema initializer
        │   ├── localStore.js    # Persistent query emulation engine
        │   └── schema.sql       # 15-table normalized MySQL schema
        ├── controllers/
        │   ├── adminController.js    # User management, roles, settings, audit logs, reports
        │   ├── authController.js     # Register, login, logout, me, password reset
        │   ├── officerController.js  # Applications list, doc verification, exams, decisions
        │   └── studentController.js  # Application form, fee checkout, document upload
        ├── middleware/
        │   ├── auth.js          # JWT authentication and requireRole authorization
        │   ├── errorHandler.js  # Centralized error handler and database error traps
        │   ├── rateLimiter.js   # In-memory brute-force rate limiter for sensitive routes
        │   └── upload.js        # Multer configuration (storage, size limits, types)
        ├── routes/
        │   ├── adminRoutes.js
        │   ├── authRoutes.js
        │   ├── documentRoutes.js # Protected, strictly authenticated file streaming
        │   ├── healthRoutes.js
        │   ├── officerRoutes.js
        │   └── studentRoutes.js
        ├── scripts/
        │   ├── seed.js          # Database seeding script for default roles & demo users
        │   └── testJourneys.js  # 48-point automated end-to-end integration test runner
        └── services/
            ├── auditService.js   # Audit log recorder
            └── paymentService.js # Payment gateway abstraction & verification engine
```

---

## 3. Database Schema (15 Tables)

The database schema is fully defined in [server/src/config/schema.sql](server/src/config/schema.sql):

1. **`roles`**: System roles (`admin`, `officer`, `student`).
2. **`permissions`**: Granular system permissions (`manage_users`, `verify_docs`, `decide_application`, etc.).
3. **`role_permissions`**: Many-to-many role-to-permission mapping.
4. **`users`**: User credentials (`email`, `password_hash`, `role_id`, `status`, `reset_token`, timestamps).
5. **`student_profiles`**: Personal details (`full_name`, `phone`, `dob`, `gender`, `address`).
6. **`admission_officers`**: Staff profiles (`full_name`, `department`).
7. **`admission_applications`**: Academic admissions records (`reference_number`, `program`, `qualification`, `score`, `statement`, `status`, `is_submitted`, `submitted_at`, `decided_at`).
8. **`uploaded_documents`**: File metadata (`type`, `original_name`, `stored_filename`, `file_path`, `file_size`, `mime_type`, `status`, `remarks`, `verified_by`).
9. **`application_status_history`**: Audit trail of application milestones and committee actions.
10. **`entrance_exam_results`**: Entrance exam evaluation (`score`, `result`, `exam_date`, `notes`, `recorded_by`).
11. **`payment_transactions`**: Fee payments (`transaction_reference`, `amount`, `currency`, `gateway`, `status`, `paid_at`).
12. **`notifications`**: User alerts for verification updates and decisions (`title`, `message`, `is_read`).
13. **`application_assignments`**: Assignment mapping of applications to admission officers.
14. **`system_settings`**: Global institution configuration (`institution_name`, `application_fee`, `deadline`, `max_upload_mb`, `registration_open`).
15. **`audit_logs`**: System audit trail logging all sensitive administrative and verification actions.

---

## 4. API Endpoints Reference

### Health & System
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | System status, database engine, uptime |

### Authentication
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public (Rate Limited) | Register new student applicant account |
| `POST` | `/api/auth/login` | Public (Rate Limited) | Authenticate user, issue JWT cookie |
| `POST` | `/api/auth/logout` | Authenticated | Invalidate session cookie |
| `GET` | `/api/auth/me` | Authenticated | Retrieve current user profile and role |
| `POST` | `/api/auth/forgot-password` | Public (Rate Limited) | Initiate password reset token |
| `POST` | `/api/auth/reset-password` | Public (Rate Limited) | Update password with token |

### Student Applicant
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/student/dashboard` | Student | Applicant overview & application status |
| `GET` | `/api/student/application` | Student | Fetch current application draft |
| `PUT` | `/api/student/application` | Student | Save application draft |
| `POST` | `/api/student/application/submit` | Student | Submit final application |
| `GET` | `/api/student/application/status` | Student | View timeline and committee remarks |
| `GET` | `/api/student/documents` | Student | List uploaded documents |
| `POST` | `/api/student/documents` | Student | Upload required document (multipart) |
| `DELETE`| `/api/student/documents/:id` | Student | Delete draft document |
| `GET` | `/api/student/fee` | Student | Check application fee payment status |
| `POST` | `/api/student/payments/checkout` | Student | Create fee checkout session |
| `GET` | `/api/student/payments/verify-gateway` | Public | Gateway return & verification callback |
| `GET` | `/api/student/notifications` | Student | Retrieve user notifications |
| `POST` | `/api/student/notifications/:id/read` | Student | Mark notification as read |

### Protected Documents (Ownership Enforced)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/documents/:id/view` | Authenticated | Stream document inline (owner/officer only) |
| `GET` | `/api/documents/:id/download` | Authenticated | Download original document (owner/officer only) |

### Admission Officer
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/officer/dashboard` | Officer/Admin | Officer application statistics |
| `GET` | `/api/officer/applications` | Officer/Admin | Paginated list of submitted applications |
| `GET` | `/api/officer/applications/:id` | Officer/Admin | Application details, documents & profile |
| `POST` | `/api/officer/applications/:appId/documents/:docId/verify` | Officer/Admin | Verify or reject document |
| `POST` | `/api/officer/applications/:id/review` | Officer/Admin | Save preliminary review notes |
| `GET` | `/api/officer/exam-results` | Officer/Admin | List entrance examination results |
| `PUT` | `/api/officer/applications/:id/exam-result` | Officer/Admin | Record score and pass/fail result |
| `POST` | `/api/officer/applications/:id/decision` | Officer/Admin | Record final admission approval/rejection |
| `GET` | `/api/officer/reports` | Officer/Admin | View summary reports & CSV export |

### System Administrator
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/dashboard` | Admin | System-wide statistics and counts |
| `GET` | `/api/admin/users` | Admin | List all system users across roles |
| `POST` | `/api/admin/users` | Admin | Create new student/officer account |
| `PUT` | `/api/admin/users/:id` | Admin | Update user information |
| `PATCH`| `/api/admin/users/:id/status` | Admin | Suspend or activate account |
| `POST` | `/api/admin/users/:id/reset-password` | Admin | Admin-initiated temporary password reset |
| `GET` | `/api/admin/roles` | Admin | List roles and assigned permissions |
| `PUT` | `/api/admin/roles/:id` | Admin | Update permissions for role |
| `GET` | `/api/admin/settings` | Admin | Retrieve institution system settings |
| `PUT` | `/api/admin/settings` | Admin | Update system fee, deadline, and policies |
| `GET` | `/api/admin/audit-logs` | Admin | View immutable system audit logs |
| `GET` | `/api/admin/reports` | Admin | Admission reports, revenue & CSV export |

---

## 5. Security Architecture

1. **Authentication & Session Tokens**:
   - Passwords hashed with `bcryptjs` (cost factor 10).
   - Sessions encoded via signed JWTs stored in `httpOnly` cookies with `sameSite: "lax"`.
   - In production (`NODE_ENV=production`), cookies automatically enforce `secure: true`.
2. **Access Control (RBAC)**:
   - Server-enforced middleware `authenticate` and `requireRole(...)`.
   - Ownership validation: Students can only view or modify their own applications and documents.
3. **File Security & URL Guessing Prevention**:
   - The uploads folder (`./uploads`) is **not** exposed statically through `express.static`. Direct guessing of filenames in `/uploads/...` returns HTTP 404.
   - Files are uniquely named using cryptographic hashes on disk and streamed exclusively through `/api/documents/:id/view` following strict session validation.
4. **Injection & Attack Prevention**:
   - SQL queries are executed with parameterized placeholders (`?`).
   - In-memory rate limiting throttles authentication endpoints (`/api/auth/*`) to prevent brute force attacks.
   - Central error handler sanitizes stack traces in production environments (`NODE_ENV=production`).
   - Client double-click prevention (`disabled = true`, `data-submitting = "true"`).

---

## 6. Local Setup and Execution

### Prerequisites
- Node.js (version 18 or later)
- MySQL 8.0+ (optional; the built-in persistent storage runs automatically if MySQL is not yet configured)

### 1. Install Backend Dependencies
```powershell
cd "c:\Users\Sayan Mridha\Desktop\college_project\server"
npm install
```

### 2. Configure Environment (`server/.env`)
Copy `.env.example` to `.env` (or use the preconfigured `.env`):
```env
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password_here
DB_NAME=admission_portal
JWT_SECRET=dev_jwt_secret_student_portal_2026_xyz!
SESSION_COOKIE_NAME=portal_token
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000
CLIENT_URL=http://localhost:5173
UPLOAD_DIR=./uploads
MAX_UPLOAD_MB=5
```

### 3. Initialize MySQL Database (If Using MySQL Service)
Ensure MySQL is running, then run the database seed script:
```powershell
npm run seed
```

### 4. Start Backend Server
```powershell
npm start
```
*Backend runs on `http://localhost:3000` (Health check: `http://localhost:3000/api/health`).*

### 5. Start Frontend HTTP Server
Open a separate terminal in the project root:
```powershell
cd "c:\Users\Sayan Mridha\Desktop\college_project"
npx --yes serve -l 5173 .
```
*(Or `python -m http.server 5173`)*

Visit `http://localhost:5173/index.html` in your web browser.

### 6. Run Full-Stack Automated Tests
```powershell
cd "c:\Users\Sayan Mridha\Desktop\college_project\server"
npm test
```
*Executes all 48 end-to-end integration tests.*

---

## 7. Pre-configured Credentials

| Role | Email | Password |
| :--- | :--- | :--- |
| **System Administrator** | `admin@example.com` | `Password123` |
| **Admission Officer** | `officer@example.com` | `Password123` |
| **Student Applicant** | `student@example.com` | `Password123` |

*New applicants can register at `http://localhost:5173/auth.html#register`.*

---

## 8. Production Deployment Guide

### A. Backend Deployment (Render, Railway, or VPS)
1. **Host Setup**:
   - Provision a Node.js 18+ runtime service (e.g. Render Web Service, Railway, AWS EC2, or DigitalOcean Droplet).
2. **Environment Variables**:
   - Set `NODE_ENV=production`
   - Set `PORT=3000` (or host-assigned `$PORT`)
   - Set `JWT_SECRET` to a cryptographically random 64-character hex string:
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
   - Set `CORS_ORIGIN` to your production frontend domain (e.g., `https://admissions.yourcollege.edu`).
   - Set `CLIENT_URL` to your production frontend URL (e.g., `https://admissions.yourcollege.edu`).
3. **Database Setup**:
   - Provision a MySQL 8.0 instance (AWS RDS, DigitalOcean Managed Database, or Railway MySQL).
   - Set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.
   - Run `npm run seed` once to initialize the schema and roles.
4. **Process Management**:
   - Use `pm2` on a VPS:
     ```bash
     npm install -g pm2
     pm2 start src/server.js --name "admission-api"
     pm2 save
     pm2 startup
     ```

### B. Frontend Deployment (Vercel, Netlify, Cloudflare Pages, S3/CloudFront)
1. Deploy the root directory files (`index.html`, `auth.html`, `portal.html`, `styles.css`, `js/`, `css/`).
2. **API Endpoint Configuration**:
   - If deploying on a different domain than the API, configure the API URL by adding a runtime script in `<head>` of your HTML files or setting `window.__API_BASE_URL__`:
     ```html
     <script>window.__API_BASE_URL__ = "https://api.admissions.yourcollege.edu/api";</script>
     ```
   - Alternatively, if deploying behind a reverse proxy (Nginx or Cloudflare), proxy `/api/*` directly to the Express backend so both live on the same origin.

### C. Nginx Reverse Proxy Configuration (Combined Architecture)
```nginx
server {
    listen 443 ssl http2;
    server_name admissions.yourcollege.edu;

    ssl_certificate /etc/letsencrypt/live/admissions.yourcollege.edu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admissions.yourcollege.edu/privkey.pem;

    # Frontend Static Files
    root /var/www/college_project;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### D. Production Payment Gateway Integration
The application implements an extensible payment service interface (`PaymentGatewayInterface` in [server/src/services/paymentService.js](server/src/services/paymentService.js)).
To activate live card processing via Stripe in production:
1. Obtain Stripe API keys from your Stripe Dashboard (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).
2. Implement `StripePaymentGateway` implementing `createCheckoutSession` and server-side webhook verification.
3. Update `activePaymentGateway` in `paymentService.js` to select provider based on `process.env.PAYMENT_GATEWAY_PROVIDER`.

---

## 9. Known Limitations & Recommendations

1. **MySQL Root Password Setup**:
   - The application is currently functioning seamlessly on its verified persistent storage engine. To transition to the running Windows MySQL service, input the MySQL root password into `server/.env` and execute `npm run seed`.
2. **Live Email Delivery**:
   - Password reset tokens are generated and recorded securely in `users.reset_token`. In local development (`NODE_ENV=development`), the token is returned in the API response and logged to the console. In production, configure an SMTP provider (SendGrid, AWS SES, Nodemailer) to email the reset link directly to the applicant.
3. **Clustered File Storage**:
   - For single-server deployments, local file storage in `./uploads` with authorized streaming is secure and performant. For multi-server or containerized Kubernetes deployments, swap disk storage for an S3-compatible object store (AWS S3, MinIO, Cloudflare R2) with pre-signed short-lived URLs.
