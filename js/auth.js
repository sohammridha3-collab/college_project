import { api, ENDPOINTS as E, API_BASE_URL, setToken, clearToken, getToken } from "./api.js";
import { $, readForm } from "./ui.js";

export async function getMe() {
  try {
    const r = await api.get(E.auth.me);
    return r && (r.user || r);
  } catch (e) {
    if (e.status === 401) {
      clearToken();
      return null;
    }
    throw e;
  }
}

export const logout = async () => {
  try {
    await api.post(E.auth.logout);
  } finally {
    clearToken();
  }
};

export function initAuthPage() {
  const p = new URLSearchParams(location.search);
  if (p.get("token") && !location.hash) {
    location.hash = "#reset";
  }

  const show = () => {
    const v = (location.hash || "#login").slice(1);
    document.querySelectorAll("[data-view]").forEach(s => {
      s.hidden = s.dataset.view !== v;
    });

    if (v === "reset") {
      const tokInput = $("#reset-form [name=token]");
      if (tokInput && p.get("token")) tokInput.value = p.get("token");
      if (tokInput && !tokInput.value) {
        const m = $("#reset-form .msg");
        if (m) {
          m.className = "msg err";
          m.textContent = "Notice: No reset token found in URL. Enter your token or use the link from your email.";
        }
      }
    }
  };

  addEventListener("hashchange", show);
  show();

  // Role-customized login presentation
  const roleParam = (p.get("role") || "").toLowerCase();
  const loginCard = document.querySelector("[data-view=login]");
  if (loginCard) {
    let badgeHtml = "";
    let title = "Log in";
    let subtitle = "Students, admission officers and administrators log in here.";
    let demoCreds = null;
    let footerHtml = '<a href="#forgot">Forgot password?</a> · <a href="#register">Create student account</a>';

    if (roleParam === "officer") {
      badgeHtml = '<span class="role-badge officer" style="margin-bottom:8px">Admission Staff Access</span>';
      title = "Admission Officer Login";
      subtitle = "Sign in to verify documents, review submitted applications, and record admission decisions.";
      demoCreds = { email: "officer@example.com", password: "Password123", label: "Admission Officer" };
      footerHtml = '<a href="auth.html?role=student#login">Applicant login</a> · <a href="#forgot">Forgot password?</a>';
    } else if (roleParam === "admin") {
      badgeHtml = '<span class="role-badge admin" style="margin-bottom:8px">Governance & Administration</span>';
      title = "Administrator Sign In";
      subtitle = "Enter administrator credentials to manage user accounts, roles, system settings, and audit logs.";
      demoCreds = { email: "admin@example.com", password: "Password123", label: "System Administrator" };
      footerHtml = '<a href="auth.html?role=student#login">Applicant login</a> · <a href="#forgot">Forgot password?</a>';
    } else if (roleParam === "student") {
      badgeHtml = '<span class="role-badge student" style="margin-bottom:8px">Applicant Portal</span>';
      title = "Student Applicant Login";
      subtitle = "Sign in to fill out your application, upload documents, pay the fee, and track your admission status.";
      demoCreds = { email: "student@example.com", password: "Password123", label: "Student Applicant" };
    }

    const h1 = loginCard.querySelector("h1");
    const sub = loginCard.querySelector("p");
    if (h1) h1.innerHTML = `${badgeHtml ? badgeHtml + "<br>" : ""}${title}`;
    if (sub) sub.textContent = subtitle;

    const footer = loginCard.querySelector("p:last-of-type");
    if (footer && (roleParam === "officer" || roleParam === "admin")) {
      footer.innerHTML = footerHtml;
    }

    if (demoCreds) {
      const existingDemo = document.getElementById("demo-creds-box");
      if (!existingDemo) {
        const demoBox = document.createElement("div");
        demoBox.id = "demo-creds-box";
        demoBox.style.cssText = "margin-top:16px;padding:12px;background:var(--bg-secondary);border-radius:10px;font-size:12px;display:flex;justify-content:space-between;align-items:center;border:1px dashed var(--border-color)";
        demoBox.innerHTML = `
          <div>
            <span style="font-weight:600;color:var(--text-primary)">Demo ${demoCreds.label}:</span>
            <code style="display:block;margin-top:2px;font-size:11px">${demoCreds.email}</code>
          </div>
          <button type="button" class="btn sm" id="btn-fill-demo" style="font-size:11px;padding:4px 10px">Fill Demo</button>
        `;
        const form = loginCard.querySelector("form");
        if (form) form.after(demoBox);

        const btnFill = document.getElementById("btn-fill-demo");
        if (btnFill) {
          btnFill.onclick = () => {
            const emailInp = document.getElementById("le");
            const pwInp = document.getElementById("lp");
            if (emailInp) emailInp.value = demoCreds.email;
            if (pwInp) pwInp.value = demoCreds.password;
          };
        }
      }
    }
  }

  if (p.get("expired")) {
    const m = $("[data-view=login] .msg");
    if (m) m.textContent = "Your session expired. Please log in again.";
  }

  // Check login status & backend connectivity
  getMe().then(u => {
    if (u) location.href = "portal.html";

  }).catch(err => {
    if (err && err.status === 0) {
      renderOfflineNotice();
    }
  });

  let pingInterval = null;
  function renderOfflineNotice() {
    const box = $("#dev-notice");
    if (!box) return;
    box.innerHTML = `
      <div class="card" style="border-left:4px solid var(--warn);background:var(--card-bg, #fff);margin-top:20px;padding:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <h2 style="font-size:14px;color:var(--warn);margin:0;display:flex;align-items:center;gap:6px">
            ⚠️ Backend Server Offline
          </h2>
          <button id="btn-ping-server" class="btn sm" type="button" style="font-size:12px;padding:4px 10px">
            🔄 Retry
          </button>
        </div>
        <p style="font-size:13px;margin:0 0 8px;color:var(--tx)">
          Cannot reach <code>${API_BASE_URL}</code>.
        </p>
        <p style="font-size:12px;margin:0;color:var(--text-secondary)">
          <b>Backend server:</b> Ensure the server is online. For local dev, run <code>npm start</code> or double-click <code>start-portal.bat</code>.
        </p>
      </div>
    `;

    const retryBtn = document.getElementById("btn-ping-server");
    const checkServer = async () => {
      if (retryBtn) { retryBtn.disabled = true; retryBtn.textContent = "Checking..."; }
      try {
        const res = await fetch(`${API_BASE_URL}/health`, { method: "GET", credentials: "omit" });
        if (res.ok) {
          if (pingInterval) clearInterval(pingInterval);
          box.innerHTML = `
            <div class="card" style="border-left:4px solid #10b981;background:var(--card-bg, #fff);margin-top:20px;padding:12px;color:#10b981;font-size:13px;font-weight:600">
              ✅ Server connected! Reloading...
            </div>
          `;
          setTimeout(() => location.reload(), 600);
          return;
        }
      } catch (_) {}
      if (retryBtn) { retryBtn.disabled = false; retryBtn.textContent = "🔄 Retry"; }
    };

    if (retryBtn) retryBtn.onclick = checkServer;
    if (!pingInterval) pingInterval = setInterval(checkServer, 5000);
  }

  const bind = (id, fn) => {
    const f = document.getElementById(id);
    if (!f) return;
    f.onsubmit = async e => {
      e.preventDefault();
      if (f.dataset.submitting === "true") return; // Prevent duplicate submissions

      const m = $(".msg", f);
      if (m) { m.className = "msg"; m.textContent = ""; }

      const d = readForm(f);
      if (!d) return;

      if (d.confirm !== undefined && d.confirm !== d.password) {
        if (m) { m.className = "msg err"; m.textContent = "Passwords do not match."; }
        return;
      }

      const b = $("button.pri", f);
      if (b) b.disabled = true;
      f.dataset.submitting = "true";

      try {
        await fn(d, m);
      } catch (x) {
        if (m) {
          m.className = "msg err";
          m.textContent = x.message;
        }
        if (x && x.status === 0) {
          renderOfflineNotice();
        }
      } finally {
        if (b) b.disabled = false;
        f.dataset.submitting = "false";
      }
    };
  };

  bind("login-form", async d => {
    const res = await api.post(E.auth.login, { email: d.email, password: d.password });
    if (res && res.token) {
      setToken(res.token);
    }
    if (res && res.user) {
      try { localStorage.setItem("portal_user", JSON.stringify(res.user)); } catch {}
    }
    location.href = "portal.html";
  });

  bind("register-form", async (d, m) => {
    const res = await api.post(E.auth.register, { fullName: d.fullName, email: d.email, phone: d.phone, password: d.password });
    if (res && res.token) {
      setToken(res.token);
      if (res.user) {
        try { localStorage.setItem("portal_user", JSON.stringify(res.user)); } catch {}
      }
      if (m) {
        m.className = "msg ok";
        m.textContent = "Account created successfully! Opening your dashboard…";
      }
      setTimeout(() => { location.href = "portal.html"; }, 600);
    } else {
      if (m) {
        m.className = "msg ok";
        m.textContent = "Account created successfully! Redirecting to login…";
      }
      setTimeout(() => { location.hash = "#login"; }, 1000);
    }
  });

  bind("forgot-form", async (d, m) => {
    const r = await api.post(E.auth.forgot, { email: d.email });
    if (m) {
      m.className = "msg ok";
      m.textContent = (r && r.message) || "If an account exists for that email, reset instructions have been sent.";
    }
  });

  bind("reset-form", async (d, m) => {
    await api.post(E.auth.reset, { token: d.token, password: d.password });
    if (m) {
      m.className = "msg ok";
      m.textContent = "Password updated. Redirecting to login…";
    }
    setTimeout(() => { location.href = "auth.html#login"; }, 1000);
  });
}
