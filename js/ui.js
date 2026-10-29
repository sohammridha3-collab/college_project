import { initThemeToggle, toggleTheme, applyTheme, getPreferredTheme } from "./theme.js";

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
export const loading = el => { el.innerHTML = '<div class="empty"><span class="spin" role="status" aria-label="Loading"></span></div>'; };
export const empty = (t, s = "") => `<div class="card empty"><h2>${esc(t)}</h2><p>${esc(s)}</p></div>`;
export function errorBox(el, e, retry) {
  el.innerHTML = `<div class="card err" role="alert"><h2>Something went wrong</h2><p>${esc(e.message)}</p>${retry ? '<button class="btn" data-r>Try again</button>' : ""}</div>`;
  if (retry) $("[data-r]", el).onclick = retry;
}
export const badge = v => {
  const s = String(v ?? "–"), l = s.toLowerCase();
  const c = /approved|verified|active|paid|pass|complete/.test(l) ? "ok" : /reject|suspend|fail|unpaid|absent/.test(l) ? "bad" : /pending|review|draft|submitted|correct/.test(l) ? "warn" : "";
  return `<span class="badge ${c}">${esc(s)}</span>`;
};
export const fieldsHtml = (fs, v = {}) => fs.map(f => {
  const id = "f_" + f.name, val = v[f.name] ?? "", r = f.req ? " required" : "";
  let i;
  if (f.type === "select") i = `<select id="${id}" name="${f.name}"${r}><option value="">Select…</option>${f.opt.map(o => `<option${o == val ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  else if (f.type === "textarea") i = `<textarea id="${id}" name="${f.name}" rows="4"${r}>${esc(val)}</textarea>`;
  else if (f.type === "checkbox") return `<div class="field chk"><label><input type="checkbox" name="${f.name}"${val ? " checked" : ""}> ${esc(f.label)}</label></div>`;
  else if (f.type === "file") i = `<input id="${id}" name="${f.name}" type="file"${r} ${f.attrs || ""}><div class="file-info" id="${id}_info" style="font-size:12px;color:var(--text-muted);margin-top:4px" aria-live="polite"></div>`;
  else i = `<input id="${id}" name="${f.name}" type="${f.type || "text"}" value="${esc(val)}"${r} ${f.attrs || ""}>`;
  return `<div class="field"><label for="${id}">${esc(f.label)}${f.req ? ' <span aria-hidden="true">*</span>' : ""}</label>${i}</div>`;
}).join("");
/* Native constraint validation; returns a plain object (files excluded) or null if invalid. */
export function readForm(f) {
  if (!f.reportValidity()) return null;
  const o = {}; new FormData(f).forEach((v, k) => { if (!(v instanceof File)) o[k] = v; });
  f.querySelectorAll("input[type=checkbox]").forEach(c => { o[c.name] = c.checked; });
  return o;
}
export const confirmDialog = (title, msg, o = {}) => new Promise(res => {
  const d = $("#dlg");
  d.innerHTML = `<form><h2>${esc(title)}</h2><p>${esc(msg)}</p>${o.remarks ? '<div class="field"><label for="rm">Remarks (required)</label><textarea id="rm" name="remarks" rows="3" required></textarea></div>' : ""}<div class="row end"><button type="button" class="btn ghost" data-x>Cancel</button><button class="btn ${o.danger ? "danger" : "pri"}">${esc(o.ok || "Confirm")}</button></div></form>`;
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

export function previewDocumentModal(blobUrl, mimeType, fileName = "Document", downloadFn) {
  const d = $("#dlg");
  if (!d) return;
  const isImage = mimeType && mimeType.startsWith("image/");
  const isPdf = mimeType && mimeType.includes("pdf");

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
}
