import { initThemeToggle, toggleTheme, applyTheme, getPreferredTheme } from "./theme.js";
import { api, ENDPOINTS } from "./api.js";

export { initThemeToggle, toggleTheme, applyTheme, getPreferredTheme };

export const $ = (s, r = document) => r.querySelector(s);
export const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const icons = () => window.lucide && window.lucide.createIcons();

export function toast(msg, type = "ok") {
  let host = $("#toasts");
  if (!host) {
    host = document.createElement("div");
    host.id = "toasts";
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
  }
  const t = document.createElement("div");
  t.className = "toast " + (type === "err" ? "err" : "");
  t.textContent = msg;
  host.append(t);
  setTimeout(() => t.remove(), 5000);
}

export const loading = el => {
  el.innerHTML = `
    <div class="empty" style="padding:36px 24px">
      <span class="spin" role="status" aria-label="Loading"></span>
      <div style="max-width:420px;margin:18px auto 0;display:grid;gap:10px">
        <div class="skeleton skeleton-line" style="width:70%;margin:0 auto"></div>
        <div class="skeleton skeleton-line" style="width:50%;margin:0 auto"></div>
      </div>
    </div>`;
};

export const empty = (t, s = "") => `<div class="card empty"><h2>${esc(t)}</h2><p>${esc(s)}</p></div>`;

export function errorBox(el, e, retry) {
  el.innerHTML = `<div class="card err" role="alert"><h2>Something went wrong</h2><p>${esc(e.message)}</p>${retry ? '<button class="btn" data-r>Try again</button>' : ""}</div>`;
  if (retry) $("[data-r]", el).onclick = retry;
}

export const badge = v => {
  const s = String(v ?? "–"), l = s.toLowerCase();
  const c = /approved|verified|active|paid|pass|complete|resolved|sent|open\b.*registration|ok/.test(l)
    ? "ok"
    : /reject|suspend|fail|unpaid|absent|overdue|urgent|cancelled|failed|closed/.test(l)
      ? "bad"
      : /pending|review|draft|submitted|correct|progress|scheduled|high|medium|queued|sandbox/.test(l)
        ? "warn"
        : "";
  return `<span class="badge ${c}">${esc(s)}</span>`;
};

export const fieldsHtml = (fs, v = {}) => fs.map(f => {
  const id = "f_" + f.name, val = v[f.name] ?? "", r = f.req ? " required" : "";
  let i;
  if (f.type === "select") i = `<select id="${id}" name="${f.name}"${r}><option value="">Select…</option>${(f.opt || []).map(o => `<option value="${esc(o)}"${o == val ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  else if (f.type === "textarea") i = `<textarea id="${id}" name="${f.name}" rows="${f.rows || 4}"${r} ${f.attrs || ""}>${esc(val)}</textarea>`;
  else if (f.type === "checkbox") return `<div class="field chk"><label><input type="checkbox" name="${f.name}"${val ? " checked" : ""}> ${esc(f.label)}</label></div>`;
  else if (f.type === "file") i = `<input id="${id}" name="${f.name}" type="file"${r} ${f.attrs || ""}><div class="file-info" id="${id}_info" style="font-size:12px;color:var(--text-muted);margin-top:4px" aria-live="polite"></div>`;
  else i = `<input id="${id}" name="${f.name}" type="${f.type || "text"}" value="${esc(val)}"${r} ${f.attrs || ""}>`;
  return `<div class="field"><label for="${id}">${esc(f.label)}${f.req ? ' <span aria-hidden="true">*</span>' : ""}</label>${i}${f.hint ? `<small style="display:block;margin-top:4px;font-size:11.5px">${esc(f.hint)}</small>` : ""}</div>`;
}).join("");

/* Native constraint validation; returns a plain object (files excluded) or null if invalid. */
export function readForm(f) {
  if (!f.reportValidity()) return null;
  const o = {};
  new FormData(f).forEach((v, k) => { if (!(v instanceof File)) o[k] = v; });
  f.querySelectorAll("input[type=checkbox]").forEach(c => { o[c.name] = c.checked; });
  return o;
}

export const confirmDialog = (title, msg, o = {}) => new Promise(res => {
  const d = $("#dlg");
  d.innerHTML = `<form><h2>${esc(title)}</h2><p>${esc(msg)}</p>${o.remarks ? `<div class="field"><label for="rm">${esc(o.remarksLabel || "Remarks")}${o.remarksOptional ? "" : ' <span aria-hidden="true">*</span>'}</label><textarea id="rm" name="remarks" rows="3" ${o.remarksOptional ? "" : "required"} placeholder="${esc(o.remarksPlaceholder || "Provide clear details or reason…")}"></textarea></div>` : ""}<div class="row end"><button type="button" class="btn ghost" data-x>Cancel</button><button class="btn ${o.danger ? "danger" : "pri"}">${esc(o.ok || "Confirm")}</button></div></form>`;
  const f = $("form", d); let done = false;
  const fin = v => { if (!done) { done = true; d.close(); res(v); } };
  f.onsubmit = e => { e.preventDefault(); if (f.reportValidity()) fin({ remarks: f.remarks ? f.remarks.value : "" }); };
  $("[data-x]", d).onclick = () => fin(null); d.onclose = () => fin(null); d.showModal();
});

/* submit(values) must throw on failure; resolves true when saved, false when cancelled. */
export const formDialog = (title, fields, values, submit, okText = "Save") => new Promise(res => {
  const d = $("#dlg");
  d.innerHTML = `<form><h2>${esc(title)}</h2><div id="de" class="err" role="alert"></div>${fieldsHtml(fields, values)}<div class="row end"><button type="button" class="btn ghost" data-x>Cancel</button><button class="btn pri">${esc(okText)}</button></div></form>`;
  const f = $("form", d); let done = false;
  const fin = v => { if (!done) { done = true; d.close(); res(v); } };
  f.onsubmit = async e => {
    e.preventDefault(); const v = readForm(f); if (!v) return;
    const b = $(".pri", f); b.disabled = true;
    try { await submit(v); toast("Saved"); fin(true); } catch (x) { $("#de", d).textContent = x.message; b.disabled = false; }
  };
  $("[data-x]", d).onclick = () => fin(false); d.onclose = () => fin(false); d.showModal();
});

/* Securely previews a protected document via authenticated blob fetch inside a modal dialog.
   Supports both previewDocumentModal(docId, docName, docType) and previewDocumentModal(blobUrl, mimeType, fileName, downloadFn). */
export async function previewDocumentModal(arg1, arg2, arg3, arg4) {
  const d = $("#dlg");
  if (!d) return;

  // Called as previewDocumentModal(blobUrl, mimeType, fileName, downloadFn)
  if (typeof arg1 === "string" && (arg1.startsWith("blob:") || arg1.startsWith("http") || arg1.startsWith("data:"))) {
    const blobUrl = arg1;
    const mimeType = (arg2 || "").toLowerCase();
    const fileName = arg3 || "Document";
    const downloadFn = arg4;

    const isImage = mimeType.startsWith("image/") || /\.(jpg|jpeg|png)$/i.test(fileName);
    const isPdf = mimeType.includes("pdf") || /\.pdf$/i.test(fileName);

    let contentHtml = "";
    if (isImage) {
      contentHtml = `<div style="max-height:70vh;overflow:auto;text-align:center;padding:8px"><img src="${blobUrl}" alt="${esc(fileName)}" style="max-width:100%;height:auto;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.1)"></div>`;
    } else if (isPdf) {
      contentHtml = `<div style="height:70vh;width:100%"><iframe src="${blobUrl}" style="width:100%;height:100%;border:none;border-radius:6px" title="${esc(fileName)}"></iframe></div>`;
    } else {
      contentHtml = `<div class="empty"><p>Preview is not directly embeddable for this format (${esc(mimeType || "file")}).</p></div>`;
    }

    d.innerHTML = `
      <div style="min-width:min(90vw, 850px);padding:4px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:10px">
          <h2 style="margin:0;font-size:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(fileName)}</h2>
          <div style="display:flex;gap:8px">
            ${downloadFn ? '<button type="button" class="btn sm" id="dlg-dl">Download</button>' : ""}
            <button type="button" class="btn sm ghost" id="dlg-close">Close</button>
          </div>
        </div>
        ${contentHtml}
      </div>
    `;

    if (downloadFn) {
      const dlBtn = $("#dlg-dl", d);
      if (dlBtn) dlBtn.onclick = () => downloadFn();
    }
    const closeBtn = $("#dlg-close", d);
    if (closeBtn) closeBtn.onclick = () => d.close();
    d.showModal();
    return;
  }

  // Called as previewDocumentModal(docId, docName, docType)
  const docId = arg1;
  const docName = arg2 || "Document";
  const docType = arg3 || "";

  d.style.maxWidth = "780px";
  d.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px">
      <div>
        <h2 style="margin:0;font-size:1.1rem">${esc(docType ? `${docType} — ${docName}` : docName)}</h2>
        <small>Secure authenticated document viewer</small>
      </div>
      <button type="button" class="btn sm ghost" data-close>Close ✕</button>
    </div>
    <div id="doc-preview-frame" class="doc-preview-box">
      <span class="spin" role="status" aria-label="Loading document"></span>
    </div>
    <div class="row end" style="margin-top:14px">
      <button type="button" class="btn sm" id="doc-dl-btn">Download file</button>
      <button type="button" class="btn sm pri" id="doc-tab-btn">Open in new tab</button>
    </div>
  `;
  let objUrl = null;
  const cleanup = () => {
    d.style.maxWidth = "";
    if (objUrl) {
      setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
      objUrl = null;
    }
  };
  $("[data-close]", d).onclick = () => { d.close(); cleanup(); };
  d.onclose = cleanup;
  d.showModal();

  try {
    const blob = await api.blob(ENDPOINTS.student.documentView(docId));
    objUrl = URL.createObjectURL(blob);
    const mime = (blob.type || "").toLowerCase();
    const box = $("#doc-preview-frame", d);
    if (mime.includes("image/") || /\.(jpg|jpeg|png)$/i.test(docName)) {
      box.innerHTML = `<img src="${objUrl}" alt="${esc(docName)}">`;
    } else if (mime.includes("pdf") || /\.pdf$/i.test(docName)) {
      box.innerHTML = `<iframe src="${objUrl}" title="${esc(docName)}"></iframe>`;
    } else {
      box.innerHTML = `<div style="padding:24px;text-align:center"><p>Preview ready (${esc(mime || "Document")}). Use the buttons below to view or download.</p></div>`;
    }
    $("#doc-dl-btn", d).onclick = () => {
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = docName || `document-${docId}`;
      a.click();
    };
    $("#doc-tab-btn", d).onclick = () => {
      window.open(objUrl, "_blank", "noopener");
    };
  } catch (err) {
    $("#doc-preview-frame", d).innerHTML = `<div class="err" style="margin:16px">${esc(err.message || "Unable to load document preview.")}</div>`;
  }
}

export async function downloadProtectedDocument(docId, docName = "document") {
  try {
    const blob = await api.blob(ENDPOINTS.student.documentDownload(docId));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = docName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (err) {
    toast(err.message || "Download failed", "err");
  }
}

/* Generates a deterministic crisp SVG verification matrix code for acknowledgment slips */
export function generateVerificationQrSvg(codeString = "ADM-VERIFY") {
  const size = 13;
  let hash = 2166136261;
  for (let i = 0; i < codeString.length; i++) {
    hash ^= codeString.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const cells = [];
  const isFinder = (r, c) =>
    (r < 3 && c < 3) || (r < 3 && c >= size - 3) || (r >= size - 3 && c < 3);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      let fill = false;
      if (isFinder(r, c)) {
        fill = true;
      } else {
        const bit = ((hash >>> ((r * size + c) % 28)) ^ (r * 7 + c * 13)) & 1;
        fill = Boolean(bit);
      }
      if (fill) {
        cells.push(`<rect x="${c * 6 + 6}" y="${r * 6 + 6}" width="5" height="5" rx="1" fill="currentColor"/>`);
      }
    }
  }
  const dim = size * 6 + 12;
  return `<svg width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" aria-label="Verification code ${esc(codeString)}" role="img" style="border:1px solid var(--border-color);border-radius:8px;background:#fff;color:#0f172a;padding:4px">${cells.join("")}</svg>`;
}
