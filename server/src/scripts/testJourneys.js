import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = "http://localhost:3000";

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName, details = "") {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ❌ FAIL: ${testName} ${details ? `(${details})` : ""}`);
    testsFailed++;
  }
}

async function request(url, options = {}) {
  const headers = options.headers || {};
  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }
  if (options.cookie) {
    headers["Cookie"] = options.cookie;
  }
  const res = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers,
  });
  let data = null;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    try {
      data = await res.text();
    } catch {
      data = null;
    }
  }
  const setCookie = res.headers.get("set-cookie");
  let cookie = null;
  if (setCookie) {
    const match = setCookie.match(/portal_token=([^;]+)/);
    if (match) {
      cookie = `portal_token=${match[1]}`;
    }
  }
  return { status: res.status, headers: res.headers, data, cookie };
}

async function run() {
  console.log("=======================================================");
  console.log("🚀 STARTING FULL-STACK USER JOURNEYS & INTEGRATION TESTS");
  console.log("=======================================================\n");

  // 1. Health check
  console.log("▶ TEST SUITE 1: System Health & Base Configuration");
  const health = await request("/api/health");
  assert(health.status === 200 && health.data?.status === "UP", "Health endpoint responds with UP status");

  // 2. Authentication & Student Registration
  console.log("\n▶ TEST SUITE 2: Authentication & Student Registration");
  const studentEmail = `alex_${Date.now()}@example.com`;
  const studentPassword = "Password123!";

  // 2a. Missing fields
  const regMissing = await request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: studentEmail }),
  });
  assert(regMissing.status === 400, "Registration rejects missing password/name with 400 Bad Request");

  // 2b. Valid registration
  const reg = await request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName: "Alex Rivera",
      email: studentEmail,
      password: studentPassword,
      phone: "+1 555-0144",
    }),
  });
  assert(reg.status === 201, "Registration succeeds with 201 Created", JSON.stringify(reg.data));

  // 2c. Duplicate registration
  const regDup = await request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName: "Alex Rivera",
      email: studentEmail,
      phone: "+1 555-0144",
      password: studentPassword,
    }),
  });
  assert(regDup.status === 409, "Duplicate email registration rejected with 409 Conflict");

  // 2d. Invalid login
  const badLogin = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: studentEmail, password: "WrongPassword!" }),
  });
  assert(badLogin.status === 401, "Login with wrong password rejected with 401 Unauthorized");

  // 2e. Successful login
  const studentLogin = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: studentEmail, password: studentPassword }),
  });
  const studentCookie = studentLogin.cookie;
  const studentToken = studentLogin.data?.token;
  assert(studentLogin.status === 200 && (studentCookie || studentToken), "Student login succeeds with auth token / cookie");

  // 2f. GET /api/auth/me
  const me = await request("/api/auth/me", { cookie: studentCookie, token: studentToken });
  assert(me.status === 200 && me.data?.email === studentEmail && me.data?.role === "student", "Auth session verifies student identity & role");

  // 3. Student Application Lifecycle
  console.log("\n▶ TEST SUITE 3: Student Application Draft & Profile Management");
  const initApp = await request("/api/student/application", { cookie: studentCookie, token: studentToken });
  assert(initApp.status === 200, "Student fetches initial draft application");

  // 3a. Save draft application
  const saveDraft = await request("/api/student/application", {
    method: "PUT",
    cookie: studentCookie,
    token: studentToken,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName: "Alex Rivera",
      phone: "+1 555-0144",
      dob: "2003-08-20",
      gender: "Male",
      address: "100 University Boulevard",
      program: "Mechanical Engineering B.Sc.",
      prevInstitution: "Westlake Science Academy",
      qualification: "High School Diploma with Honors",
      score: "94.2",
      statement: "I am passionate about robotics and automotive design.",
      draft: true,
    }),
  });
  assert(saveDraft.status === 200, "Student saves application draft successfully");

  // 3b. Verify updated fields
  const updatedApp = await request("/api/student/application", { cookie: studentCookie, token: studentToken });
  assert(
    updatedApp.data?.program === "Mechanical Engineering B.Sc." && updatedApp.data?.qualification === "High School Diploma with Honors",
    "Application draft updates persisted and returned accurately"
  );

  // 3c. Attempt premature submission before docs and payment
  const earlySubmit = await request("/api/student/application/submit", {
    method: "POST",
    cookie: studentCookie,
    token: studentToken,
  });
  assert(earlySubmit.status === 422, "Early submission blocked before documents and fee payment (422)");

  // 4. Document Upload & Security
  console.log("\n▶ TEST SUITE 4: Document Uploads & URL Guessing Prevention");
  // Create a sample test document
  const testDocDir = path.resolve(__dirname, "../../scratch");
  if (!fs.existsSync(testDocDir)) fs.mkdirSync(testDocDir, { recursive: true });
  const sampleFilePath = path.join(testDocDir, "sample_transcript.pdf");
  fs.writeFileSync(sampleFilePath, "%PDF-1.4 Mock Transcript Content for Alex Rivera");

  const formData = new FormData();
  const fileBlob = new Blob([fs.readFileSync(sampleFilePath)], { type: "application/pdf" });
  formData.append("file", fileBlob, "sample_transcript.pdf");
  formData.append("type", "High School Transcript");

  const uploadRes = await fetch(`${BASE_URL}/api/student/documents`, {
    method: "POST",
    headers: {
      Cookie: studentCookie,
      Authorization: `Bearer ${studentToken}`,
    },
    body: formData,
  });
  const uploadJson = await uploadRes.json();
  assert(uploadRes.status === 201, "Student uploads required document successfully", JSON.stringify(uploadJson));

  // 4a. Get documents list
  const docList = await request("/api/student/documents", { cookie: studentCookie, token: studentToken });
  const uploadedDoc = docList.data?.items?.[0];
  assert(uploadedDoc && uploadedDoc.status === "Pending", "Uploaded document listed with status Pending");

  // 4b. Security Check: Direct guessing in /uploads/
  const directGuess = await request(`/uploads/${uploadedDoc?.stored_filename || "sample.pdf"}`);
  assert(directGuess.status === 404, "Direct URL guessing of /uploads/ is rejected with 404 Not Found");

  // 4c. Security Check: Unauthenticated access to /api/documents/:id/view
  const unauthView = await request(`/api/documents/${uploadedDoc.id}/view`);
  assert(unauthView.status === 401, "Unauthenticated access to document view rejected with 401 Unauthorized");

  // 4d. Security Check: Authorized student can view their own document
  const authView = await request(`/api/documents/${uploadedDoc.id}/view`, { cookie: studentCookie, token: studentToken });
  assert(authView.status === 200, "Authorized student can view and stream their own document");

  // 5. Fee Payment Lifecycle
  console.log("\n▶ TEST SUITE 5: Fee Payment & Server-Side Verification");
  const feeInfo = await request("/api/student/fee", { cookie: studentCookie, token: studentToken });
  assert(feeInfo.status === 200 && feeInfo.data?.status === "Unpaid", "Initial application fee is Unpaid");

  // 5a. Checkout initiation
  const checkout = await request("/api/student/payments/checkout", {
    method: "POST",
    cookie: studentCookie,
    token: studentToken,
  });
  assert(checkout.status === 200 && checkout.data?.checkoutUrl, "Payment checkout session created with verification URL");

  // 5b. Server-side payment verification (simulate gateway return)
  const checkoutUrlObj = new URL(checkout.data.checkoutUrl);
  const verifyPath = `${checkoutUrlObj.pathname}${checkoutUrlObj.search}`;
  const gatewayVerify = await request(verifyPath, { redirect: "manual" });
  assert(gatewayVerify.status === 302 || gatewayVerify.status === 200, "Payment gateway verified server-side");

  // 5c. Confirm fee is now Paid
  const feePaid = await request("/api/student/fee", { cookie: studentCookie, token: studentToken });
  assert(feePaid.data?.status === "Paid", "Application fee status is updated to Paid");

  // 6. Application Submission
  console.log("\n▶ TEST SUITE 6: Final Application Submission & Tracking");
  const finalSubmit = await request("/api/student/application/submit", {
    method: "POST",
    cookie: studentCookie,
    token: studentToken,
  });
  assert(finalSubmit.status === 200 && finalSubmit.data?.referenceNumber, "Application submitted with reference number", JSON.stringify(finalSubmit.data));

  // 6a. Check status and timeline
  const statusCheck = await request("/api/student/application/status", { cookie: studentCookie, token: studentToken });
  assert(
    statusCheck.data?.status === "Submitted" && statusCheck.data?.timeline?.length >= 2,
    "Status timeline records Application Submitted milestone"
  );

  // 6b. Prevent double-submission
  const reSubmit = await request("/api/student/application/submit", {
    method: "POST",
    cookie: studentCookie,
    token: studentToken,
  });
  assert(reSubmit.status === 400, "Double-submission rejected with 400 Bad Request");

  // 7. Admission Officer Review & Decision
  console.log("\n▶ TEST SUITE 7: Admission Officer Review, Exam Recording & Decision");
  const officerLogin = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "officer@example.com", password: "Password123" }),
  });
  const officerCookie = officerLogin.cookie;
  const officerToken = officerLogin.data?.token;
  assert(officerLogin.status === 200, "Officer logs in successfully");

  // 7a. Officer dashboard
  const officerDash = await request("/api/officer/dashboard", { cookie: officerCookie, token: officerToken });
  assert(officerDash.status === 200 && officerDash.data?.stats, "Officer dashboard loads application statistics");

  // 7b. List applications and find Alex's application
  const appList = await request("/api/officer/applications", { cookie: officerCookie, token: officerToken });
  const alexApp = appList.data?.items?.find(a => a.email === studentEmail);
  assert(alexApp && alexApp.status === "Submitted", "Officer views assigned application for Alex Rivera");

  const appId = alexApp.id;

  // 7c. Officer verifies document
  const verifyDoc = await request(`/api/officer/applications/${appId}/documents/${uploadedDoc.id}/verify`, {
    method: "POST",
    cookie: officerCookie,
    token: officerToken,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "Verified", remarks: "Official transcript verified and authenticated." }),
  });
  assert(verifyDoc.status === 200, "Officer marks student document as Verified");

  // 7d. Officer records entrance examination result
  const recordExam = await request(`/api/officer/applications/${appId}/exam-result`, {
    method: "PUT",
    cookie: officerCookie,
    token: officerToken,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ score: "91.5", result: "Pass", examDate: "2026-10-25", notes: "Excellent performance in math & physics." }),
  });
  assert(recordExam.status === 200, "Officer records entrance exam result (Score: 91.5, Result: Pass)");

  // 7e. Officer records admission decision
  const decideApp = await request(`/api/officer/applications/${appId}/decision`, {
    method: "POST",
    cookie: officerCookie,
    token: officerToken,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "Approved", remarks: "Admitted into Mechanical Engineering B.Sc. with Dean's distinction." }),
  });
  assert(decideApp.status === 200, "Officer approves admission application");

  // 8. Student Sees Updated Decision & Notifications
  console.log("\n▶ TEST SUITE 8: Student Verification of Decision & Notification Feed");
  const studentUpdatedStatus = await request("/api/student/application/status", { cookie: studentCookie, token: studentToken });
  assert(
    studentUpdatedStatus.data?.status === "Approved" && studentUpdatedStatus.data?.remarks.includes("Admitted"),
    "Student status reflects Approved with officer remarks"
  );

  const notifications = await request("/api/student/notifications", { cookie: studentCookie, token: studentToken });
  assert(
    notifications.data?.items?.some(n => (n.title || "").includes("Approved")),
    "Student receives automated admission decision notification"
  );

  // 9. Admin User Management, Audit Logs & Reports
  console.log("\n▶ TEST SUITE 9: Admin Management, Settings, Audit Logs & Reports");
  const adminLogin = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "Password123" }),
  });
  const adminCookie = adminLogin.cookie;
  const adminToken = adminLogin.data?.token;
  assert(adminLogin.status === 200, "Admin logs in successfully");

  // 9a. Admin dashboard
  const adminDash = await request("/api/admin/dashboard", { cookie: adminCookie, token: adminToken });
  assert(adminDash.status === 200 && adminDash.data?.stats, "Admin dashboard loads user and application metrics");

  // 9b. Admin users list
  const usersList = await request("/api/admin/users", { cookie: adminCookie, token: adminToken });
  assert(usersList.status === 200 && usersList.data?.items?.length >= 3, "Admin views all system users across roles");

  // 9c. Admin system settings
  const settings = await request("/api/admin/settings", { cookie: adminCookie, token: adminToken });
  assert(settings.status === 200 && settings.data?.settings?.institutionName, "Admin fetches system settings");

  // 9d. Admin update settings
  const updateSettings = await request("/api/admin/settings", {
    method: "PUT",
    cookie: adminCookie,
    token: adminToken,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...settings.data.settings,
      institutionName: "Metropolitan University of Technology & Sciences",
    }),
  });
  assert(updateSettings.status === 200, "Admin updates system settings");

  // 9e. Admin audit logs
  const auditLogs = await request("/api/admin/audit-logs", { cookie: adminCookie, token: adminToken });
  assert(
    auditLogs.status === 200 && auditLogs.data?.items?.some(l => l.action === "APPLICATION_DECISION"),
    "Audit logs capture officer application decision"
  );

  // 9f. Admin reports
  const reports = await request("/api/admin/reports", { cookie: adminCookie, token: adminToken });
  assert(reports.status === 200 && reports.data?.summary, "Admin generates admission summary report");

  // 10. Role-Based Access Control (RBAC) Security Tests
  console.log("\n▶ TEST SUITE 10: Role-Based Authorization Enforcement");
  // 10a. Student accessing Officer endpoint
  const studentBlocked = await request("/api/officer/dashboard", { cookie: studentCookie, token: studentToken });
  assert(studentBlocked.status === 403, "Student cannot access Officer routes (403 Forbidden)");

  // 10b. Student accessing Admin endpoint
  const studentBlockedAdmin = await request("/api/admin/settings", { cookie: studentCookie, token: studentToken });
  assert(studentBlockedAdmin.status === 403, "Student cannot access Admin routes (403 Forbidden)");

  // 10c. Officer accessing Admin endpoint
  const officerBlockedAdmin = await request("/api/admin/settings", { cookie: officerCookie, token: officerToken });
  assert(officerBlockedAdmin.status === 403, "Officer cannot access Admin routes (403 Forbidden)");

  // 11. Production Security & Penetration Checks
  console.log("\n▶ TEST SUITE 11: Production Security, SQLi Defense & Data Isolation");

  // 11a. Security Headers
  const secCheck = await request("/api/health");
  assert(
    secCheck.headers.get("x-content-type-options") === "nosniff" &&
    secCheck.headers.get("x-frame-options") === "SAMEORIGIN",
    "Security headers present: nosniff and SAMEORIGIN"
  );

  // 11b. SQL Injection Defense Check
  const sqliAttempt = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "' OR '1'='1' --", password: "' OR '1'='1" }),
  });
  assert(sqliAttempt.status === 401, "SQL injection attempt safely rejected with 401 Unauthorized");

  // 11c. Cross-Student Document Isolation Check
  const student2Email = `student2_${Date.now()}@example.com`;
  await request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName: "Bob Vance",
      email: student2Email,
      phone: "+1 555-0999",
      password: "Password123!",
    }),
  });
  const student2Login = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: student2Email, password: "Password123!" }),
  });
  const crossDocAccess = await request(`/api/documents/${uploadedDoc.id}/view`, {
    cookie: student2Login.cookie,
    token: student2Login.data?.token,
  });
  assert(crossDocAccess.status === 403, "Cross-student document viewing strictly blocked with 403 Forbidden");

  // 11d. Password Recovery & Reset Flow
  const forgotRes = await request("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: student2Email }),
  });
  const resetToken = forgotRes.data?.devResetToken;
  assert(forgotRes.status === 200 && resetToken, "Password reset token generated and dispatched");

  const resetRes = await request("/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: resetToken, password: "NewPassword2026!" }),
  });
  assert(resetRes.status === 200, "Password successfully reset with valid token");

  const reLoginWithNewPw = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: student2Email, password: "NewPassword2026!" }),
  });
  assert(reLoginWithNewPw.status === 200, "Login successful with newly reset password");

  // 11e. Logout test
  const logoutRes = await request("/api/auth/logout", {
    method: "POST",
    cookie: studentCookie,
    token: studentToken,
  });
  assert(logoutRes.status === 200, "Logout endpoint clears session credentials");

  // Clean up test file
  try {
    fs.unlinkSync(sampleFilePath);
  } catch {}

  console.log("\n=======================================================");
  console.log(`🏁 INTEGRATION TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log("=======================================================");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
