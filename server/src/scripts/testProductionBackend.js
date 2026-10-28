import assert from "node:assert";

const PROD_URL = "https://college-project-backend-1.onrender.com";

async function req(path, { method = "GET", token, body } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  const res = await fetch(`${PROD_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, ok: res.ok, data: json, text };
}

async function runProductionTests() {
  console.log("=======================================================");
  console.log(`🌐 TESTING LIVE DEPLOYED BACKEND: ${PROD_URL}`);
  console.log("=======================================================\n");

  let passed = 0;
  let failed = 0;

  function test(label, condition) {
    if (condition) {
      console.log(`  ✅ PASS: ${label}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${label}`);
      failed++;
    }
  }

  // 1. Health Endpoint
  console.log("▶ TEST 1: System Health");
  const health = await req("/api/health");
  test("Health endpoint responds with UP status", health.status === 200 && health.data?.status === "UP");

  // 2. Student Workflow
  console.log("\n▶ TEST 2: Student Authentication & Dashboard");
  const studentLogin = await req("/api/auth/login", {
    method: "POST",
    body: { email: "student@example.com", password: "Password123" },
  });
  test("Student login succeeds with JWT token", studentLogin.status === 200 && studentLogin.data?.token);
  const studentToken = studentLogin.data?.token;

  const studentMe = await req("/api/auth/me", { token: studentToken });
  test("Student session verification returns student role", studentMe.status === 200 && studentMe.data?.user?.role === "student");

  const studentApp = await req("/api/student/application", { token: studentToken });
  test("Student fetches application dossier", studentApp.status === 200 && studentApp.data?.fullName);

  const studentStatus = await req("/api/student/application/status", { token: studentToken });
  test("Student checks application status", studentStatus.status === 200 && studentStatus.data?.status);

  const studentNotifs = await req("/api/student/notifications", { token: studentToken });
  test("Student receives notifications list", studentNotifs.status === 200 && Array.isArray(studentNotifs.data?.items));

  // 3. Admission Officer Workflow
  console.log("\n▶ TEST 3: Admission Officer Review & Queue");
  const officerLogin = await req("/api/auth/login", {
    method: "POST",
    body: { email: "officer@example.com", password: "Password123" },
  });
  test("Officer login succeeds with JWT token", officerLogin.status === 200 && officerLogin.data?.token);
  const officerToken = officerLogin.data?.token;

  const officerDash = await req("/api/officer/dashboard", { token: officerToken });
  test("Officer dashboard returns statistics", officerDash.status === 200 && officerDash.data?.stats);

  const officerApps = await req("/api/officer/applications", { token: officerToken });
  test("Officer retrieves assigned applications queue", officerApps.status === 200 && Array.isArray(officerApps.data?.items));

  // 4. Administrator Workflow
  console.log("\n▶ TEST 4: Administrator Governance, Settings & Logs");
  const adminLogin = await req("/api/auth/login", {
    method: "POST",
    body: { email: "admin@example.com", password: "Password123" },
  });
  test("Admin login succeeds with JWT token", adminLogin.status === 200 && adminLogin.data?.token);
  const adminToken = adminLogin.data?.token;

  const adminDash = await req("/api/admin/dashboard", { token: adminToken });
  test("Admin dashboard returns system metrics", adminDash.status === 200 && adminDash.data?.stats);

  const adminUsers = await req("/api/admin/users", { token: adminToken });
  test("Admin retrieves system users list", adminUsers.status === 200 && Array.isArray(adminUsers.data?.items));

  const adminSettings = await req("/api/admin/settings", { token: adminToken });
  test("Admin retrieves system settings", adminSettings.status === 200 && adminSettings.data?.settings);

  const adminLogs = await req("/api/admin/audit-logs", { token: adminToken });
  test("Admin retrieves audit logs", adminLogs.status === 200 && Array.isArray(adminLogs.data?.items));

  // 5. Role-Based Access Control (RBAC) Enforcement
  console.log("\n▶ TEST 5: Role-Based Authorization Security");
  const studentToOfficer = await req("/api/officer/applications", { token: studentToken });
  test("Student is blocked from Officer routes (403 Forbidden)", studentToOfficer.status === 403);

  const studentToAdmin = await req("/api/admin/users", { token: studentToken });
  test("Student is blocked from Admin routes (403 Forbidden)", studentToAdmin.status === 403);

  const officerToAdmin = await req("/api/admin/users", { token: officerToken });
  test("Officer is blocked from Admin routes (403 Forbidden)", officerToAdmin.status === 403);

  const unauthAccess = await req("/api/admin/dashboard");
  test("Unauthenticated requests are rejected (401 Unauthorized)", unauthAccess.status === 401);

  console.log("\n=======================================================");
  console.log(`🏁 PRODUCTION LIVE TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=======================================================");

  if (failed > 0) process.exit(1);
}

runProductionTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
