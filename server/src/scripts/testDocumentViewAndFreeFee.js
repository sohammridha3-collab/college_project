import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storePath = path.resolve(__dirname, "../../data/store.json");
const storeBackup = storePath + ".doc_test_bak";

const BASE_URL = "http://localhost:3000";

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName, details = "") {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ❌ FAIL: ${testName} -> details: ${JSON.stringify(details)}`);
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
  } else if (contentType.includes("text/")) {
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
  return { status: res.status, headers: res.headers, data, cookie, rawRes: res };
}

async function run() {
  console.log("=======================================================");
  console.log("🚀 TESTING DOCUMENT VIEW/DOWNLOAD & FREE FEE POLICIES");
  console.log("=======================================================\n");

  if (fs.existsSync(storePath)) {
    fs.copyFileSync(storePath, storeBackup);
  }

  let serverProcess = null;
  const initialCheck = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  if (!initialCheck || !initialCheck.ok) {
    await import("../server.js");
  }

  try {
    // 1. Health check
    console.log("▶ TEST SCENARIO 1: System Health & Base Configuration");
    const health = await request("/api/health");
    assert(health.status === 200 && health.data?.status === "UP", "Health endpoint responds with UP status");

    // 2. Student Registration & Free Fee Verification
    console.log("\n▶ TEST SCENARIO 2: Free Admission Fee (₹0.00) Policy");
    const studentEmail = `student_${Date.now()}@example.com`;
    const regRes = await request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Kavita Sharma",
        email: studentEmail,
        phone: "+91 98765 43210",
        password: "Password123!",
      }),
    });
    assert(regRes.status === 201, "New student registers successfully");
    const studentToken = regRes.data?.token;
    const studentCookie = regRes.cookie;

    // 2a. Check /api/student/fee returns 0.00 and isFree: true
    const feeRes = await request("/api/student/fee", { token: studentToken, cookie: studentCookie });
    assert(
      feeRes.status === 200 &&
      feeRes.data?.amount === "0.00" &&
      feeRes.data?.isFree === true &&
      feeRes.data?.status === "Fee Waived",
      "New student sees FREE (₹0.00) fee with status 'Fee Waived'",
      { status: feeRes.status, data: feeRes.data }
    );

    // 2b. Check student dashboard stats shows 'Fee Waived'
    const dashRes = await request("/api/student/dashboard", { token: studentToken, cookie: studentCookie });
    assert(
      dashRes.status === 200 && dashRes.data?.stats?.["Fee Payment"] === "Fee Waived",
      "Student dashboard reflects 'Fee Waived' instead of 'Pending'"
    );

    // 2c. Check checkoutFee when fee is 0 returns isFree notification without requiring payment
    const checkoutRes = await request("/api/student/payments/checkout", {
      method: "POST",
      token: studentToken,
      cookie: studentCookie,
    });
    assert(
      checkoutRes.status === 200 && checkoutRes.data?.isFree === true,
      "Checkout on zero fee returns isFree response without gateway redirect",
      { status: checkoutRes.status, data: checkoutRes.data }
    );

    // 3. Document Upload (PDF & PNG)
    console.log("\n▶ TEST SCENARIO 3: Document Upload & Persistent Storage");
    const scratchDir = path.resolve(__dirname, "../../scratch");
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

    // 3a. Upload PDF document
    const pdfPath = path.join(scratchDir, "sample_marksheets.pdf");
    fs.writeFileSync(pdfPath, "%PDF-1.4 Official Higher Secondary Marksheet Content for Kavita Sharma");

    const pdfBoundary = "----BoundaryPDF" + Date.now();
    const pdfBody = Buffer.concat([
      Buffer.from(
        `--${pdfBoundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\nAcademic transcript\r\n` +
        `--${pdfBoundary}\r\nContent-Disposition: form-data; name="file"; filename="marksheets.pdf"\r\nContent-Type: application/pdf\r\n\r\n`
      ),
      fs.readFileSync(pdfPath),
      Buffer.from(`\r\n--${pdfBoundary}--\r\n`),
    ]);

    const uploadPdfRes = await request("/api/student/documents", {
      method: "POST",
      token: studentToken,
      cookie: studentCookie,
      headers: { "Content-Type": `multipart/form-data; boundary=${pdfBoundary}` },
      body: pdfBody,
    });
    assert(uploadPdfRes.status === 201, "Student uploads PDF marksheet successfully");

    // 3b. Upload PNG document
    const pngPath = path.join(scratchDir, "sample_photo.png");
    // Standard 1x1 PNG header
    const samplePngBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    fs.writeFileSync(pngPath, samplePngBuffer);

    const pngBoundary = "----BoundaryPNG" + Date.now();
    const pngBody = Buffer.concat([
      Buffer.from(
        `--${pngBoundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\nPassport photo\r\n` +
        `--${pngBoundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\n`
      ),
      samplePngBuffer,
      Buffer.from(`\r\n--${pngBoundary}--\r\n`),
    ]);

    const uploadPngRes = await request("/api/student/documents", {
      method: "POST",
      token: studentToken,
      cookie: studentCookie,
      headers: { "Content-Type": `multipart/form-data; boundary=${pngBoundary}` },
      body: pngBody,
    });
    assert(uploadPngRes.status === 201, "Student uploads PNG photo successfully");

    // Retrieve uploaded documents
    const docList = await request("/api/student/documents", { token: studentToken, cookie: studentCookie });
    const docs = docList.data?.items || [];
    assert(docs.length >= 2, "Both uploaded documents listed in student profile");
    const pdfDoc = docs.find(d => d.type === "Academic transcript");
    const pngDoc = docs.find(d => d.type === "Passport photo");

    // 4. Document Viewing & Downloading
    console.log("\n▶ TEST SCENARIO 4: Document Viewing, Streaming & Downloading");

    // 4a. View PDF document
    const viewPdfRes = await request(`/api/documents/${pdfDoc.id}/view`, { token: studentToken, cookie: studentCookie });
    assert(
      viewPdfRes.status === 200 &&
      viewPdfRes.headers.get("content-type")?.includes("application/pdf") &&
      viewPdfRes.headers.get("content-disposition")?.includes("inline"),
      "Student views PDF document (Content-Type: application/pdf, Content-Disposition: inline)"
    );

    // 4b. View PDF document using token query parameter (cross-origin window.open simulation)
    const viewQueryRes = await request(`/api/documents/${pdfDoc.id}/view?token=${encodeURIComponent(studentToken)}`);
    assert(
      viewQueryRes.status === 200 && viewQueryRes.headers.get("content-type")?.includes("application/pdf"),
      "Student views document via URL query token (cross-origin tab simulation)"
    );

    // 4c. View PNG document
    const viewPngRes = await request(`/api/documents/${pngDoc.id}/view`, { token: studentToken, cookie: studentCookie });
    assert(
      viewPngRes.status === 200 &&
      viewPngRes.headers.get("content-type")?.includes("image/png") &&
      viewPngRes.headers.get("content-disposition")?.includes("inline"),
      "Student views PNG document (Content-Type: image/png, Content-Disposition: inline)"
    );

    // 4d. Download document
    const downloadRes = await request(`/api/documents/${pdfDoc.id}/download`, { token: studentToken, cookie: studentCookie });
    assert(
      downloadRes.status === 200 &&
      downloadRes.headers.get("content-disposition")?.includes("attachment"),
      "Student downloads document (Content-Disposition: attachment)"
    );

    // 5. Officer & Admin Document Access + Cross-User Protection
    console.log("\n▶ TEST SCENARIO 5: Role-Based Authorization & Security Boundaries");

    // 5a. Officer logs in and views student's document
    const officerLogin = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "officer@example.com", password: "Password123" }),
    });
    const officerToken = officerLogin.data?.token;
    const officerCookie = officerLogin.cookie;

    const officerView = await request(`/api/documents/${pdfDoc.id}/view`, { token: officerToken, cookie: officerCookie });
    assert(officerView.status === 200, "Authorized Admission Officer can view applicant document");

    // 5b. Another student cannot view Kavita's document
    const student2Login = await request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Rahul Verma",
        email: `rahul_${Date.now()}@example.com`,
        phone: "+91 91234 56789",
        password: "Password123!",
      }),
    });
    const otherStudentToken = student2Login.data?.token;

    const unauthorizedView = await request(`/api/documents/${pdfDoc.id}/view`, { token: otherStudentToken });
    assert(unauthorizedView.status === 403, "Other student is strictly blocked (403 Forbidden) from viewing Kavita's document", {
      status: unauthorizedView.status,
      data: unauthorizedView.data,
      docId: pdfDoc.id,
      otherStudentToken: !!otherStudentToken
    });

    // 5c. Unauthenticated request rejected
    const unauthenticatedView = await request(`/api/documents/${pdfDoc.id}/view`);
    assert(unauthenticatedView.status === 401, "Unauthenticated access rejected with 401 Unauthorized");

    // 6. Ephemeral Server Restart / Cloud Redeployment Simulation
    console.log("\n▶ TEST SCENARIO 6: Ephemeral Storage Recovery Simulation");
    // Simulate Render container restart where disk files are wiped
    const storeRaw = JSON.parse(fs.readFileSync(storePath, "utf8"));
    const storedDoc = storeRaw.uploaded_documents.find(d => String(d.id) === String(pdfDoc.id));
    const currentFilePath = storedDoc?.file_path;
    let wiped = false;
    if (currentFilePath && fs.existsSync(currentFilePath)) {
      try {
        fs.unlinkSync(currentFilePath);
        wiped = true;
      } catch {}
    }
    // Now request document - backend should automatically re-hydrate file from database file_data
    const rehydratedView = await request(`/api/documents/${pdfDoc.id}/view`, { token: studentToken, cookie: studentCookie });
    assert(
      rehydratedView.status === 200,
      "Document remains accessible after disk file wipe (auto-restored from persistent database storage)",
      { status: rehydratedView.status, data: rehydratedView.data, wiped, currentFilePath }
    );

    // 7. Complete Application Submission Without Paying
    console.log("\n▶ TEST SCENARIO 7: Application Submission Without Fee Payment");
    // Save application details
    await request("/api/student/application", {
      method: "PUT",
      token: studentToken,
      cookie: studentCookie,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        program: "Computer Science & Engineering B.Tech",
        prevInstitution: "Delhi Public School",
        qualification: "Senior Secondary (10+2)",
        score: "95.5",
        statement: "Aspiring software engineer.",
      }),
    });

    // Submit application (No payment required!)
    const submitRes = await request("/api/student/application/submit", {
      method: "POST",
      token: studentToken,
      cookie: studentCookie,
    });
    assert(
      submitRes.status === 200 && submitRes.data?.referenceNumber,
      `Student successfully submits application without payment (Ref: ${submitRes.data?.referenceNumber})`
    );

    // Verify application status timeline
    const statusRes = await request("/api/student/application/status", { token: studentToken, cookie: studentCookie });
    assert(
      statusRes.status === 200 && statusRes.data?.status === "Submitted",
      "Application status transitions to 'Submitted'"
    );

    // 8. Admin Settings & Revenue Calculation Verification
    console.log("\n▶ TEST SCENARIO 8: Admin Governance & Revenue Isolation");
    const adminLogin = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "Password123" }),
    });
    const adminToken = adminLogin.data?.token;
    const adminCookie = adminLogin.cookie;

    const adminSettings = await request("/api/admin/settings", { token: adminToken, cookie: adminCookie });
    assert(
      adminSettings.status === 200 &&
      Number(adminSettings.data?.settings?.applicationFee) === 0 &&
      adminSettings.data?.settings?.currency === "INR",
      "Admin settings confirm applicationFee is 0.00 and currency is INR"
    );

    // Clean scratch files
    try { fs.unlinkSync(pdfPath); } catch {}
    try { fs.unlinkSync(pngPath); } catch {}

    console.log("\n=======================================================");
    console.log(`🏁 TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log("=======================================================");
  } finally {
    if (fs.existsSync(storeBackup)) {
      fs.copyFileSync(storeBackup, storePath);
      try { fs.unlinkSync(storeBackup); } catch {}
    }
  }

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch(err => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
