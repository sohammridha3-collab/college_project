const BASE_URL = "http://localhost:3000";

let passed = 0;
let failed = 0;

function assert(condition, testName, details = "") {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName} ${details ? `(${details})` : ""}`);
    failed++;
  }
}

// Client simulation mimicking the exact api.js browser implementation
class BrowserClient {
  constructor() {
    this.token = null;
    this.user = null;
  }

  async request(path, options = {}) {
    const headers = options.headers || {};
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    const res = await fetch(`${BASE_URL}/api${path}`, {
      ...options,
      headers,
    });
    const contentType = res.headers.get("content-type") || "";
    let data = null;
    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      data = await res.text();
    }
    return { status: res.status, data };
  }

  async register(fullName, email, phone, password) {
    const res = await this.request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email, phone, password }),
    });
    if (res.status === 201 && res.data?.token) {
      this.token = res.data.token;
      this.user = res.data.user;
    }
    return res;
  }

  async login(email, password) {
    const res = await this.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.status === 200 && res.data?.token) {
      this.token = res.data.token;
      this.user = res.data.user;
    }
    return res;
  }

  async getMe() {
    return await this.request("/auth/me");
  }

  logout() {
    this.token = null;
    this.user = null;
  }
}

async function runBrowserSimulation() {
  const initialCheck = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  if (!initialCheck || !initialCheck.ok) {
    await import("../server.js");
  }

  console.log("=======================================================");
  console.log("🧪 TESTING REGISTRATION & LOGIN TO DASHBOARD WORKFLOWS");
  console.log("=======================================================\n");

  const client = new BrowserClient();

  // Test Case A: Registration -> Immediate Session -> Student Dashboard
  console.log("▶ Case A: Student Registration Directly Opens Dashboard");
  const studentEmail = `browser_student_${Date.now()}@example.com`;
  const regRes = await client.register("Samantha Reed", studentEmail, "+1 555-0988", "Password123!");
  assert(regRes.status === 201, "Registration succeeds with HTTP 201");
  assert(Boolean(client.token), "Registration issues authenticated session token immediately");
  assert(client.user?.role === "student", "Registered account role is confirmed as student");

  // Portal boot verification
  const meRes = await client.getMe();
  assert(meRes.status === 200 && meRes.data?.role === "student", "Portal boot verifies active student session");

  // Load student dashboard data
  const studentDash = await client.request("/student/dashboard");
  assert(
    studentDash.status === 200 && studentDash.data?.stats?.["Application Status"] === "Draft",
    "Student Dashboard loads initial application metrics successfully"
  );

  // Test Case B: Refresh persistence
  console.log("\n▶ Case B: Page Refresh Preserves Authenticated Session");
  const refreshMe = await client.getMe();
  assert(refreshMe.status === 200 && refreshMe.data?.email === studentEmail, "Page refresh keeps user authenticated");
  const refreshDash = await client.request("/student/dashboard");
  assert(refreshDash.status === 200, "Dashboard data re-loads seamlessly on refresh");

  // Test Case C: Logout clears session
  console.log("\n▶ Case C: Logout Invalidation");
  client.logout();
  const unauthMe = await client.getMe();
  assert(unauthMe.status === 401, "Protected /api/auth/me rejects unauthenticated request with 401");
  const unauthDash = await client.request("/student/dashboard");
  assert(unauthDash.status === 401, "Student dashboard rejects unauthenticated request with 401");

  // Test Case D: Login with newly registered student account
  console.log("\n▶ Case D: Login With Newly Created Account");
  const loginRes = await client.login(studentEmail, "Password123!");
  assert(loginRes.status === 200, "Login succeeds with HTTP 200");
  assert(Boolean(client.token), "Login establishes authenticated session token");
  const loginDash = await client.request("/student/dashboard");
  assert(loginDash.status === 200, "Student Dashboard loads after login");

  // Test Case E: Officer Login -> Officer Dashboard
  console.log("\n▶ Case E: Officer Login -> Officer Dashboard");
  const officerClient = new BrowserClient();
  const officerLogin = await officerClient.login("officer@example.com", "Password123");
  assert(officerLogin.status === 200 && officerClient.user?.role === "officer", "Officer logs in successfully");
  const officerDash = await officerClient.request("/officer/dashboard");
  assert(officerDash.status === 200 && officerDash.data?.stats?.["Assigned Applications"] !== undefined, "Officer Dashboard data loads");
  const officerBlockedStudent = await officerClient.request("/student/dashboard");
  assert(officerBlockedStudent.status === 403, "Officer blocked from student-only dashboard (403)");

  // Test Case F: Admin Login -> Admin Dashboard
  console.log("\n▶ Case F: Admin Login -> Admin Dashboard");
  const adminClient = new BrowserClient();
  const adminLogin = await adminClient.login("admin@example.com", "Password123");
  assert(adminLogin.status === 200 && adminClient.user?.role === "admin", "Admin logs in successfully");
  const adminDash = await adminClient.request("/admin/dashboard");
  assert(adminDash.status === 200 && adminDash.data?.stats?.["Total Applicants"] !== undefined, "Admin Dashboard data loads");

  // Test Case G: Invalid Credentials Error Handling
  console.log("\n▶ Case G: Invalid Credentials Rejection");
  const badLoginClient = new BrowserClient();
  const badLogin = await badLoginClient.login("officer@example.com", "WrongPassword!");
  assert(badLogin.status === 401, "Login with wrong password rejected with 401");
  assert(!badLoginClient.token, "No session token issued for failed login");

  // Test Case H: Duplicate Registration Prevention
  console.log("\n▶ Case H: Duplicate Email Registration Rejection");
  const dupReg = await client.register("Duplicate User", studentEmail, "+1 555-0988", "Password123!");
  assert(dupReg.status === 409, "Duplicate registration rejected with 409 Conflict");

  console.log("\n=======================================================");
  console.log(`🏁 WORKFLOW TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=======================================================");

  process.exit(failed > 0 ? 1 : 0);
}

runBrowserSimulation().catch(err => {
  console.error("Simulation error:", err);
  process.exit(1);
});
