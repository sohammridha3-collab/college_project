import { api, ENDPOINTS as E, MAX_UPLOAD_MB, clearToken } from "./api.js";
import { $, esc, toast, confirmDialog, formDialog, fieldsHtml, readForm, loading, errorBox, empty, badge, icons, initThemeToggle } from "./ui.js";
import { getMe, logout } from "./auth.js";

const F = (name, label, type = "text", req = true, opt, attrs) => ({ name, label, type, req, opt, attrs });
const view = $("#view");
const fmt = d => d ? esc(new Date(d).toLocaleDateString()) : "–";
const fmtT = d => d ? esc(new Date(d).toLocaleString()) : "–";
const stats = o => Object.keys(o || {}).length ? `<div class="grid">${Object.entries(o).map(([k, v]) => `<div class="card stat"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join("")}</div>` : "";

/* Runs a request with button disabled + error toast. Returns result (or true) on success, undefined on failure. */
async function act(btn, fn, ok) {
  if (btn) btn.disabled = true;
  try { const r = await fn(); if (ok) toast(ok); return r ?? true; }
  catch (e) { toast(e.message, "err"); }
  finally { if (btn) btn.disabled = false; }
}
/* Title + spinner, GET path, render(data, box); errors show a retry box. */
async function load(el, title, path, render, query) {
  el.innerHTML = `<h1>${esc(title)}</h1><div id="b"></div>`;
  const b = $("#b", el); loading(b);
  try { render(await api.get(path, query), b); } catch (e) { errorBox(b, e, () => load(el, title, path, render, query)); }
}
const dash = (el, path, links) => load(el, "Dashboard", path, (r, b) => {
  b.innerHTML = (stats(r.stats) || empty("No data yet", "Figures will appear here once there is activity.")) +
    `<div class="row">${links.map(([h, l]) => `<a class="btn" href="#/${h}">${esc(l)}</a>`).join("")}</div>`;
});

/* Generic table. acts(row) -> [[label, fn(row, btn), cssClass]] */
function table(box, cols, rows, acts, o = {}) {
  const A = [];
  box.innerHTML = `<div class="card" style="overflow:auto"><table><thead><tr>${cols.map(([k, l]) => `<th scope="col">${o.onSort ? `<button class="sort" data-s="${k}">${esc(l)}${o.sort === k ? (o.dir === "asc" ? " ▲" : " ▼") : ""}</button>` : esc(l)}</th>`).join("")}${acts ? '<th scope="col">Actions</th>' : ""}</tr></thead><tbody>${rows.map((r, i) => `<tr>${cols.map(([k, , f]) => `<td>${f ? f(r[k], r) : esc(r[k])}</td>`).join("")}${acts ? `<td><div class="row">${acts(r).map(([l, fn, c]) => { A.push(fn); return `<button class="btn sm ${c || ""}" data-a="${A.length - 1}" data-i="${i}">${esc(l)}</button>`; }).join("")}</div></td>` : ""}</tr>`).join("")}</tbody></table></div>`;
  box.onclick = e => {
    const a = e.target.closest("[data-a]"); if (a) A[a.dataset.a](rows[a.dataset.i], a);
    const s = e.target.closest("[data-s]"); if (s && o.onSort) o.onSort(s.dataset.s);
  };
}
/* Server-side search / filter / sort / pagination. Response: { items, total, page, limit } */
function list(el, c) {
  const s = { q: "", status: "", sort: "", dir: "asc", page: 1 }; let t;
  el.innerHTML = `<h1>${esc(c.title)}</h1><div class="bar"><input type="search" id="q" placeholder="Search…" aria-label="Search ${esc(c.title)}">${c.statuses ? `<select id="st" aria-label="Filter by status"><option value="">All statuses</option>${c.statuses.map(x => `<option>${esc(x)}</option>`).join("")}</select>` : ""}${c.add ? `<button class="btn pri" id="add">+ ${esc(c.add.label)}</button>` : ""}</div><div id="tb"></div><div class="row end" id="pg"></div>`;
  const tb = $("#tb", el), pg = $("#pg", el);
  const go = async () => {
    loading(tb); pg.innerHTML = "";
    try {
      const r = await api.get(c.path, { ...s, limit: 10, ...c.query }), rows = r.items || [];
      if (!rows.length) { tb.innerHTML = empty("Nothing to show", "No records match your search or filters."); return; }
      table(tb, c.cols, rows, c.acts && (row => c.acts(row, go)), { sort: s.sort, dir: s.dir, onSort: k => { s.dir = s.sort === k && s.dir === "asc" ? "desc" : "asc"; s.sort = k; go(); } });
      const n = Math.max(1, Math.ceil((r.total ?? rows.length) / (r.limit || 10)));
      pg.innerHTML = `<span style="align-self:center">Page ${s.page} of ${n}</span><button class="btn sm" id="pv" ${s.page <= 1 ? "disabled" : ""}>Previous</button><button class="btn sm" id="nx" ${s.page >= n ? "disabled" : ""}>Next</button>`;
      $("#pv", pg).onclick = () => { s.page--; go(); }; $("#nx", pg).onclick = () => { s.page++; go(); };
    } catch (e) { errorBox(tb, e, go); }
  };
  $("#q", el).oninput = e => { clearTimeout(t); t = setTimeout(() => { s.q = e.target.value; s.page = 1; go(); }, 350); };
  if ($("#st", el)) $("#st", el).onchange = e => { s.status = e.target.value; s.page = 1; go(); };
  if ($("#add", el)) $("#add", el).onclick = () => formDialog(c.add.label, c.add.fields, {}, v => api.post(c.path, v), "Create").then(ok => ok && go());
  go();
}
/* Date-range report with summary + rows + CSV export. Response: { summary:{}, rows:[] } */
function report(el, title, path) {
  el.innerHTML = `<h1>${esc(title)}</h1><form class="bar" id="rf"><input type="date" name="from" aria-label="From date"><input type="date" name="to" aria-label="To date"><button class="btn pri">Generate</button><button type="button" class="btn" id="ex">Export CSV</button></form><div id="b"></div>`;
  const b = $("#b", el), q = () => Object.fromEntries(new FormData($("#rf", el)));
  const run = async () => {
    loading(b);
    try {
      const r = await api.get(path, q()), rows = r.rows || [];
      b.innerHTML = stats(r.summary) + '<div id="rt"></div>';
      if (rows.length) table($("#rt", b), Object.keys(rows[0]).map(k => [k, k]), rows);
      else if (!r.summary || !Object.keys(r.summary).length) b.innerHTML = empty("No report data", "Try a different date range.");
    } catch (e) { errorBox(b, e, run); }
  };
  $("#rf", el).onsubmit = e => { e.preventDefault(); run(); };
  $("#ex", el).onclick = async ev => act(ev.target, async () => {
    const blob = await api.blob(path, { ...q(), format: "csv" }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "report.csv"; a.click(); URL.revokeObjectURL(a.href);
  });
  run();
}

/* ---------- Student ---------- */
const AF = [F("fullName", "Full name"), F("dob", "Date of birth", "date"), F("gender", "Gender", "select", true, ["Female", "Male", "Other", "Prefer not to say"]), F("phone", "Phone", "tel"), F("address", "Address", "textarea"), F("program", "Programme applied for"), F("prevInstitution", "Previous institution"), F("qualification", "Highest qualification"), F("score", "Score / percentage", "number", true, undefined, 'min="0" max="100" step="0.01"'), F("statement", "Personal statement", "textarea", false)];
async function appForm(el) {
  el.innerHTML = '<h1>Admission application</h1><div id="b"></div>';
  const b = $("#b", el); loading(b); let v = {};
  try { v = (await api.get(E.student.application)) || {}; } catch (e) { if (e.status !== 404) return errorBox(b, e, () => appForm(el)); }
  b.innerHTML = `<form class="card"><div class="form2">${fieldsHtml(AF, v)}</div><div class="row end"><button type="button" class="btn" data-d>Save draft</button><button class="btn pri">Save &amp; continue</button></div></form>`;
  const f = $("form", b);
  $("[data-d]", b).onclick = e => act(e.currentTarget, () => api.put(E.student.application, { ...Object.fromEntries(new FormData(f)), draft: true }), "Draft saved");
  f.onsubmit = async e => { e.preventDefault(); const d = readForm(f); if (d && await act($("button.pri", f), () => api.put(E.student.application, d), "Application saved")) location.hash = "#/documents"; };
}
const DOCS = ["ID proof", "Academic transcript", "Passport photo", "Certificate", "Other"];
const docs = el => load(el, "Documents", E.student.documents, (r, b) => {
  const it = r.items || [];
  b.innerHTML = `<form class="card" id="up"><h2>Upload a document</h2><div class="form2">${fieldsHtml([F("type", "Document type", "select", true, DOCS), F("file", `File (PDF, JPG or PNG, max ${MAX_UPLOAD_MB} MB)`, "file", true, undefined, 'accept=".pdf,.jpg,.jpeg,.png"')])}</div><button class="btn pri">Upload</button></form><div id="dt"></div>`;
  const f = $("#up", b);
  const fi = f.querySelector('input[type="file"]');
  if (fi) {
    fi.onchange = () => {
      const info = document.getElementById(fi.id + "_info");
      if (!fi.files || !fi.files.length) { if (info) info.textContent = ""; return; }
      const file = fi.files[0], mb = (file.size / (1024 * 1024)).toFixed(2);
      if (file.size > MAX_UPLOAD_MB * 1048576) {
        if (info) { info.style.color = "var(--bad)"; info.textContent = `❌ ${file.name} (${mb} MB) - Exceeds ${MAX_UPLOAD_MB} MB limit!`; }
        toast(`File exceeds ${MAX_UPLOAD_MB} MB limit.`, "err");
      } else {
        if (info) { info.style.color = "var(--ok)"; info.textContent = `✓ Selected: ${file.name} (${mb} MB)`; }
      }
    };
  }
  f.onsubmit = async e => {
    e.preventDefault(); if (!f.reportValidity()) return;
    if (f.file.files[0].size > MAX_UPLOAD_MB * 1048576) return toast(`File is larger than ${MAX_UPLOAD_MB} MB.`, "err");
    if (await act($("button", f), () => api.post(E.student.documents, new FormData(f)), "Document uploaded")) docs(el);
  };
  if (!it.length) $("#dt", b).innerHTML = empty("No documents yet", "Upload the documents required for your application.");
  else table($("#dt", b), [["type", "Type"], ["name", "File"], ["status", "Status", badge], ["remarks", "Officer remarks"]], it, r2 => [
    ["View", row => window.open(`${API_BASE_URL.replace(/\/api$/, "")}/api/documents/${row.id}/view`, "_blank")],
    ["Delete", async (row, btn) => { const x = await confirmDialog("Delete document?", row.name || row.type, { danger: true, ok: "Delete" }); if (x && await act(btn, () => api.del(E.student.document(row.id)), "Document deleted")) docs(el); }, "danger"]
  ]);
});
const pay = el => load(el, "Application fee", E.student.fee, (r, b) => {
  const paid = /paid/i.test(r.status);
  b.innerHTML = `<div class="card"><dl><dt>Amount</dt><dd>${esc(r.currency || "")} ${esc(r.amount)}</dd><dt>Status</dt><dd>${badge(r.status)}</dd></dl><p>You will be redirected to our secure payment provider. Card details are never entered on this site.</p><button class="btn pri" ${paid ? "disabled" : ""}>${paid ? "Fee paid" : "Pay securely"}</button></div>`;
  $("button", b).onclick = async e => {
    const x = await act(e.currentTarget, () => api.post(E.student.checkout, {}));
    if (x && x.checkoutUrl) location.href = x.checkoutUrl; else if (x) toast("The server did not return a checkout URL.", "err");
  };
});
function submit(el) {
  el.innerHTML = '<h1>Submit application</h1><div class="card" id="b"><p>Check your application details, documents and fee payment first. After submission you cannot edit your application.</p><button class="btn pri">Submit application</button></div>';
  $("button", el).onclick = async e => {
    const ok = await confirmDialog("Submit application?", "This is final. The admissions office will start verification.", { ok: "Submit" }); if (!ok) return;
    const r = await act(e.currentTarget, () => api.post(E.student.submit, {})); if (!r) return;
    $("#b", el).innerHTML = `<h2>Application submitted</h2><dl><dt>Reference</dt><dd>${esc(r.referenceNumber || r.id || "–")}</dd><dt>Submitted</dt><dd>${fmtT(r.submittedAt)}</dd></dl><p>Track progress under <a href="#/status">Track status</a>.</p><button class="btn" onclick="print()">Print confirmation</button>`;
  };
}
const status = el => load(el, "Application status", E.student.status, (r, b) => {
  let examHtml = "";
  if (r.examResult) {
    examHtml = `
      <div class="card" style="margin-top:20px">
        <h2>Entrance Examination Results</h2>
        <dl>
          <dt>Score</dt><dd><b>${esc(r.examResult.score)}</b> / 100</dd>
          <dt>Result</dt><dd>${badge(r.examResult.result)}</dd>
          <dt>Exam Date</dt><dd>${fmt(r.examResult.examDate)}</dd>
          ${r.examResult.notes ? `<dt>Notes</dt><dd>${esc(r.examResult.notes)}</dd>` : ""}
        </dl>
      </div>
    `;
  }

  b.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">
        <h2 style="margin:0">Application Status ${badge(r.status)}</h2>
        ${r.referenceNumber ? `<span>Reference: <code>${esc(r.referenceNumber)}</code></span>` : ""}
      </div>
      ${r.program ? `<p style="margin:0 0 10px;color:var(--text-secondary)"><b>Programme Applied:</b> ${esc(r.program)}</p>` : ""}
      ${r.remarks ? `<div class="card" style="background:var(--bg-secondary);padding:14px;margin-bottom:18px"><h3 style="font-size:13px;margin:0 0 4px">Committee / Review Remarks</h3><p style="margin:0;font-size:14px">${esc(r.remarks)}</p></div>` : ""}
      <h3 style="font-size:14px;margin:16px 0 10px">Progress Milestones</h3>
      ${(r.timeline || []).length ? `<ol class="tl">${r.timeline.map(t => `<li><b>${esc(t.step)}</b> ${badge(t.status)}<br><small>${fmtT(t.date)}</small>${t.remarks ? `<br>${esc(t.remarks)}` : ""}</li>`).join("")}</ol>` : "<p>No progress recorded yet.</p>"}
    </div>
    ${examHtml}
  `;
});
const notes = el => load(el, "Notifications", E.student.notifications, (r, b) => {
  const it = r.items || [];
  if (!it.length) { b.innerHTML = empty("You're all caught up", "New messages about your application appear here."); return; }
  b.innerHTML = it.map(n => `<div class="card"><b>${esc(n.title)}</b> ${n.read ? "" : badge("New")}<p>${esc(n.message)}</p><small>${fmtT(n.createdAt)}</small> ${n.read ? "" : `<button class="btn sm" data-id="${esc(n.id)}">Mark as read</button>`}</div>`).join("");
  b.onclick = async e => { const x = e.target.closest("[data-id]"); if (x && await act(x, () => api.post(E.student.readNotification(x.dataset.id), {}))) notes(el); };
});

/* ---------- Officer ---------- */
const verifyDoc = async (appId, d, st, done) => {
  const isOk = st === "verified";
  const isCorr = st === "correction";
  const title = isOk ? "Verify document?" : isCorr ? "Request document correction?" : "Reject document?";
  const actionLabel = isOk ? "Verify" : isCorr ? "Request Correction" : "Reject";
  const x = await confirmDialog(title, d.name || d.type, {
    remarks: true,
    danger: !isOk,
    ok: actionLabel,
  });
  if (x && await act(null, () => api.post(E.officer.verifyDocument(appId, d.id), { status: isOk ? "verified" : isCorr ? "correction" : "rejected", remarks: x.remarks }), "Document updated")) done();
};
const docActs = (appIdOf, done) => r => [
  ["View", row => window.open(`${API_BASE_URL.replace(/\/api$/, "")}/api/documents/${row.id}/view`, "_blank")],
  ["Verify", () => verifyDoc(appIdOf(r), r, "verified", done)],
  ["Needs Correction", () => verifyDoc(appIdOf(r), r, "correction", done), "warn"],
  ["Reject", () => verifyDoc(appIdOf(r), r, "rejected", done), "danger"]
];
const examDlg = (id, done) => formDialog("Entrance examination result", [F("score", "Score", "number", true, undefined, 'min="0" max="100" step="0.01"'), F("result", "Result", "select", true, ["Pass", "Fail", "Absent", "Exempt"]), F("examDate", "Exam date", "date"), F("notes", "Notes", "textarea", false)], {}, v => api.put(E.officer.exam(id), v)).then(ok => ok && done && done());
const decide = async (id, dec, done) => {
  const ap = dec === "approved";
  const x = await confirmDialog(
    ap ? "Approve application?" : "Reject application?",
    "The applicant will be notified with your remarks.",
    { remarks: true, danger: !ap, ok: ap ? "Approve" : "Reject" }
  );
  if (x) {
    if (!ap && (!x.remarks || !x.remarks.trim())) {
      toast("Remarks are mandatory when rejecting an application.", "err");
      return;
    }
    if (await act(null, () => api.post(E.officer.decision(id), { decision: dec, remarks: x.remarks }), ap ? "Application approved" : "Application rejected")) done();
  }
};
function appDetail(el, id) {
  const again = () => appDetail(el, id);
  load(el, "Application Review #" + id, E.officer.application(id), (a, b) => {
    let examInfoHtml = "";
    if (a.examResult) {
      examInfoHtml = `
        <dl>
          <dt>Score</dt><dd><b>${esc(a.examResult.score)}</b> / 100</dd>
          <dt>Result</dt><dd>${badge(a.examResult.result)}</dd>
          <dt>Exam Date</dt><dd>${fmt(a.examResult.examDate)}</dd>
          ${a.examResult.notes ? `<dt>Notes</dt><dd>${esc(a.examResult.notes)}</dd>` : ""}
        </dl>
      `;
    } else {
      examInfoHtml = `<p style="color:var(--text-secondary);margin-bottom:14px">No entrance examination result recorded yet.</p>`;
    }

    let timelineHtml = "";
    if ((a.timeline || []).length) {
      timelineHtml = `
        <div class="card" style="margin-top:20px">
          <h2>Application Timeline & Decisions</h2>
          <ol class="tl">${a.timeline.map(t => `<li><b>${esc(t.step)}</b> ${badge(t.status)}<br><small>${fmtT(t.date)}</small>${t.remarks ? `<br>${esc(t.remarks)}` : ""}</li>`).join("")}</ol>
        </div>
      `;
    }

    b.innerHTML = `
      <p style="margin-bottom:16px"><a href="#/applications" class="btn sm">← Back to assigned applications</a></p>
      
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">
          <h2 style="margin:0">Applicant Information ${badge(a.status)}</h2>
          ${a.referenceNumber ? `<span>Ref: <code>${esc(a.referenceNumber)}</code></span>` : ""}
        </div>
        <dl>
          <dt>Full Name</dt><dd><b>${esc(a.applicantName || "–")}</b></dd>
          <dt>Email</dt><dd>${esc(a.email || "–")}</dd>
          <dt>Phone</dt><dd>${esc(a.phone || "–")}</dd>
          <dt>Date of Birth</dt><dd>${fmt(a.dob)}</dd>
          <dt>Gender</dt><dd>${esc(a.gender || "–")}</dd>
          <dt>Address</dt><dd>${esc(a.address || "–")}</dd>
          <dt>Programme</dt><dd><b>${esc(a.program || "–")}</b></dd>
          <dt>Previous School</dt><dd>${esc(a.prevInstitution || "–")}</dd>
          <dt>Highest Qualification</dt><dd>${esc(a.qualification || "–")}</dd>
          <dt>Previous Score</dt><dd>${esc(a.score || "–")}%</dd>
          <dt>Submission Date</dt><dd>${fmtT(a.submittedAt)}</dd>
          ${a.statement ? `<dt>Personal Statement</dt><dd style="white-space:pre-wrap">${esc(a.statement)}</dd>` : ""}
        </dl>
      </div>

      <div class="card">
        <h2>Uploaded Documents</h2>
        <div id="dt"></div>
      </div>

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h2 style="margin:0">Entrance Examination</h2>
          <button class="btn sm" id="ex">${a.examResult ? "Edit Result" : "Record Result"}</button>
        </div>
        ${examInfoHtml}
      </div>

      <div class="card">
        <h2>Officer Review Notes</h2>
        <form id="rv">
          ${fieldsHtml([F("notes", "Review notes & evaluation", "textarea")])}
          <button class="btn pri">Save review notes</button>
        </form>
      </div>

      <div class="card" style="border-left:4px solid var(--accent-primary)">
        <h2>Final Committee Decision</h2>
        <p style="color:var(--text-secondary);margin-bottom:14px">
          Current decision status: ${badge(a.status)}. Marking approved or rejected will record an official milestone and notify the applicant.
        </p>
        <div class="row">
          <button class="btn pri" id="ap">Approve application</button>
          <button class="btn danger" id="rj">Reject application</button>
        </div>
      </div>

      ${timelineHtml}
    `;

    const dl = a.documents || [];
    if (dl.length) {
      table($("#dt", b), [["type", "Type"], ["name", "File"], ["status", "Status", badge], ["remarks", "Remarks"]], dl, docActs(() => id, again));
    } else {
      $("#dt", b).innerHTML = "<p style='color:var(--text-secondary)'>No documents uploaded.</p>";
    }

    const rvNotes = $("#rv [name=notes]", b);
    if (rvNotes && a.remarks) rvNotes.value = a.remarks;

    $("#rv", b).onsubmit = async e => {
      e.preventDefault();
      const d = readForm(e.target);
      if (d && await act($("button", e.target), () => api.post(E.officer.review(id), d), "Review saved")) again();
    };

    $("#ex", b).onclick = () => examDlg(id, again);
    $("#ap", b).onclick = () => decide(id, "approved", again);
    $("#rj", b).onclick = () => decide(id, "rejected", again);
  });
}
const APS = ["Pending", "Under review", "Approved", "Rejected"];

/* ---------- Admin ---------- */
const entity = (title, path, extra = {}) => el => list(el, {
  title, path, statuses: ["active", "suspended"],
  cols: [["name", "Name"], ["email", "Email"], ...(extra.cols || []), ["status", "Status", badge]],
  add: { label: "Add " + title.toLowerCase().replace(/s$/, ""), fields: [F("name", "Full name"), F("email", "Email", "email"), F("password", "Temporary password", "password", true, undefined, 'minlength="8" autocomplete="new-password"'), ...(extra.fields || [])] },
  acts: (r, go) => [
    ["Edit", () => formDialog("Edit " + r.name, [F("name", "Full name"), F("email", "Email", "email"), ...(extra.fields || [])], r, v => api.put(`${path}/${r.id}`, v)).then(ok => ok && go())],
    [/suspend/i.test(r.status) ? "Activate" : "Suspend", async (row, btn) => {
      const sus = !/suspend/i.test(r.status), x = await confirmDialog(sus ? "Suspend account?" : "Activate account?", r.name + " (" + r.email + ")", { danger: sus, remarks: sus, ok: sus ? "Suspend" : "Activate" });
      if (x && await act(btn, () => api.patch(`${path}/${r.id}/status`, { status: sus ? "suspended" : "active", remarks: x.remarks }), "Account updated")) go();
    }, /suspend/i.test(r.status) ? "" : "danger"],
    ["Reset password", async (row, btn) => { const x = await confirmDialog("Reset password?", "A password reset will be issued for " + r.email + ".", { ok: "Reset" }); if (x) act(btn, () => api.post(`${path}/${r.id}/reset-password`, {}), "Password reset requested"); }],
  ],
});
const roles = el => list(el, {
  title: "Roles & permissions", path: E.admin.roles, cols: [["name", "Role"], ["permissions", "Permissions", p => esc((p || []).join(", "))]],
  acts: (r, go) => [["Edit permissions", async () => {
    try {
      const P = (await api.get(E.admin.permissions)).items || [];
      const ok = await formDialog("Permissions: " + r.name, P.map(p => F(p.key || p, p.label || p.key || p, "checkbox", false)), Object.fromEntries((r.permissions || []).map(k => [k, true])), v => api.put(`${E.admin.roles}/${r.id}`, { permissions: Object.keys(v).filter(k => v[k]) }));
      if (ok) go();
    } catch (e) { toast(e.message, "err"); }
  }]],
});
const SET = [F("institutionName", "Institution name"), F("applicationFee", "Application fee", "number", true, undefined, 'min="0" step="0.01"'), F("currency", "Currency"), F("applicationDeadline", "Application deadline", "date"), F("maxUploadMb", "Max upload size (MB)", "number", true, undefined, 'min="1"'), F("registrationOpen", "Registration open", "checkbox", false), F("policies", "Admission policies", "textarea", false)];
const settings = el => load(el, "System settings", E.admin.settings, (r, b) => {
  b.innerHTML = `<form class="card"><div class="form2">${fieldsHtml(SET, r.settings || r)}</div><div class="row end"><button type="button" class="btn" data-c>Cancel</button><button class="btn pri">Save settings</button></div></form>`;
  $("[data-c]", b).onclick = () => settings(el);
  $("form", b).onsubmit = async e => { e.preventDefault(); const d = readForm(e.target); if (d) await act($("button.pri", e.target), () => api.put(E.admin.settings, d), "Settings saved"); };
});

/* ---------- Routes: key -> [label, lucide icon, render(el, arg)] ---------- */
const R = {
  student: {
    dashboard: ["Dashboard", "layout-dashboard", el => dash(el, E.student.dashboard, [["application", "Continue application"], ["status", "Track status"]])],
    application: ["Application form", "file-text", appForm], documents: ["Documents", "upload", docs], payment: ["Application fee", "credit-card", pay],
    submit: ["Submit application", "send", submit], status: ["Track status", "activity", status], notifications: ["Notifications", "bell", notes],
  },
  officer: {
    dashboard: ["Dashboard", "layout-dashboard", el => dash(el, E.officer.dashboard, [["applications", "Assigned applications"], ["documents", "Verify documents"]])],
    applications: ["Assigned applications", "inbox", (el, id) => id ? appDetail(el, id) : list(el, { title: "Assigned applications", path: E.officer.applications, statuses: APS, cols: [["id", "ID"], ["applicantName", "Applicant"], ["program", "Programme"], ["status", "Status", badge], ["submittedAt", "Submitted", fmt]], acts: r => [["Review", () => { location.hash = "#/applications/" + r.id; }]] })],
    documents: ["Document verification", "file-check", el => list(el, { title: "Document verification", path: E.officer.documents, statuses: ["Pending", "Verified", "Rejected"], cols: [["applicantName", "Applicant"], ["type", "Type"], ["name", "File"], ["status", "Status", badge]], acts: (r, go) => docActs(x => x.applicationId, go)(r) })],
    exams: ["Entrance results", "clipboard-check", el => list(el, { title: "Entrance examination results", path: E.officer.exams, cols: [["applicantName", "Applicant"], ["score", "Score"], ["result", "Result", badge], ["examDate", "Exam date", fmt]], acts: (r, go) => [["Record / edit", () => examDlg(r.applicationId, go)]] })],
    reports: ["Admission reports", "bar-chart-3", el => report(el, "Admission reports", E.officer.reports)],
  },
  admin: {
    dashboard: ["Dashboard", "layout-dashboard", el => dash(el, E.admin.dashboard, [["students", "Manage students"], ["audit", "Audit logs"]])],
    students: ["Students", "users", entity("Students", E.admin.students)], officers: ["Admission officers", "user-check", entity("Officers", E.admin.officers)],
    users: ["Users & roles", "user-cog", entity("Users", E.admin.users, { cols: [["role", "Role"]], fields: [F("role", "Role", "select", true, ["student", "officer", "admin"])] })],
    roles: ["Permissions", "shield", roles], settings: ["System settings", "settings", settings],
    audit: ["Audit logs", "scroll-text", el => list(el, { title: "Audit logs", path: E.admin.audit, cols: [["createdAt", "Time", fmtT], ["user", "User"], ["action", "Action"], ["details", "Details"], ["ip", "IP"]] })],
    reports: ["Reports", "bar-chart-3", el => report(el, "System reports", E.admin.reports)],
  },
};

let role;
function route() {
  const [, k, arg] = location.hash.split("/"), rt = R[role], key = rt[k] ? k : "dashboard";
  document.querySelectorAll("#nav a").forEach(a => { if (a.dataset.k === key) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  document.title = rt[key][0] + " – Admission Portal";
  rt[key][2](view, decodeURIComponent(arg || "")); view.focus(); icons();
  $("#side").classList.remove("open"); $("#menu").setAttribute("aria-expanded", "false");
  if ($("#backdrop")) $("#backdrop").classList.remove("open");
}
addEventListener("session-expired", () => {
  clearToken();
  location.href = "auth.html?expired=1#login";
});
(async () => {
  initThemeToggle();
  icons();
  let me;
  try {
    me = await getMe();
  } catch (e) {
    return errorBox(view, e, () => location.reload());
  }
  if (!me) {
    clearToken();
    location.href = "auth.html#login";
    return;
  }
  const r = String(me.role || "").toLowerCase();
  role = /admin/.test(r) ? "admin" : /officer/.test(r) ? "officer" : "student"; /* display only; backend enforces permissions */
  $("#who").textContent = `${me.name || me.fullName || me.email} (${role})`;
  $("#nav").innerHTML = Object.entries(R[role]).map(([k, [l, i]]) => `<a href="#/${k}" data-k="${k}"><i data-lucide="${i}"></i>${esc(l)}</a>`).join("");

  const closeMenu = () => {
    $("#side").classList.remove("open");
    $("#menu").setAttribute("aria-expanded", "false");
    if ($("#backdrop")) $("#backdrop").classList.remove("open");
  };
  $("#menu").onclick = () => {
    const o = $("#side").classList.toggle("open");
    $("#menu").setAttribute("aria-expanded", o);
    if ($("#backdrop")) $("#backdrop").classList.toggle("open", o);
  };
  if ($("#backdrop")) $("#backdrop").onclick = closeMenu;

  $("#logout").onclick = async () => {
    try {
      await logout();
    } catch (e) {
      toast(e.message, "err");
    }
    clearToken();
    location.href = "auth.html#login";
  };
  addEventListener("hashchange", route); route();
})();
