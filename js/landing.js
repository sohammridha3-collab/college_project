import { getMe, logout } from "./auth.js";
import { clearToken } from "./api.js";

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function showDialog(title, message, actions = []) {
  let dlg = document.getElementById("landing-dialog");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "landing-dialog";
    dlg.className = "card";
    dlg.style.maxWidth = "440px";
    dlg.style.padding = "24px";
    dlg.style.borderRadius = "16px";
    dlg.style.border = "1px solid var(--border-color)";
    dlg.style.boxShadow = "var(--shadow-card-hover)";
    document.body.appendChild(dlg);
  }

  dlg.innerHTML = `
    <h2 style="font-size:1.25rem;margin:0 0 10px;color:var(--text-primary)">${esc(title)}</h2>
    <p style="color:var(--text-secondary);font-size:14px;line-height:1.5;margin:0 0 20px">${message}</p>
    <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap" id="dlg-actions"></div>
  `;

  const actsBox = dlg.querySelector("#dlg-actions");
  actions.forEach(({ label, primary, danger, onClick }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `btn sm ${primary ? "pri" : ""} ${danger ? "danger" : ""}`;
    btn.textContent = label;
    btn.onclick = () => {
      dlg.close();
      if (onClick) onClick();
    };
    actsBox.appendChild(btn);
  });

  dlg.showModal();
}

async function initLandingPage() {
  let currentUser = null;
  try {
    currentUser = await getMe();
  } catch (_) {
    currentUser = null;
  }

  // Update navigation header if user is authenticated
  const navActions = document.getElementById("nav-actions");
  if (navActions && currentUser) {
    const roleCapitalized = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
    const themeBtn = document.getElementById("theme-toggle");
    const themeBtnHtml = themeBtn ? themeBtn.outerHTML : "";

    navActions.innerHTML = `
      ${themeBtnHtml}
      <span class="user-greeting" style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-right:4px">
        ${esc(currentUser.name || currentUser.email)} <span class="role-badge ${currentUser.role}" style="margin:0 0 0 6px;padding:2px 8px;font-size:10px">${esc(roleCapitalized)}</span>
      </span>
      <a class="btn pri" href="portal.html" id="btn-landing-dashboard" style="padding:8px 16px;font-size:13px">Dashboard</a>
      <button class="btn" id="btn-landing-logout" type="button" style="padding:8px 14px;font-size:13px">Log out</button>
    `;

    // Rebind theme toggle
    import("./theme.js").then(m => m.initThemeToggle && m.initThemeToggle());

    const logoutBtn = document.getElementById("btn-landing-logout");
    if (logoutBtn) {
      logoutBtn.onclick = async () => {
        try {
          await logout();
        } catch (_) {}
        clearToken();
        location.reload();
      };
    }
  }

  // Helper for role card routing
  function handleRoleClick(targetRole, defaultUrl, e) {
    if (e) {
      // If clicked an explicit link inside the card, respect target unless access violation
      const link = e.target.closest("a");
      if (link && !currentUser) return; // Unauthenticated users follow normal link href
    }

    if (!currentUser) {
      location.href = defaultUrl;
      return;
    }

    const currentRole = (currentUser.role || "").toLowerCase();

    // Student Card
    if (targetRole === "student") {
      if (currentRole === "student") {
        location.href = "portal.html";
      } else {
        showDialog(
          "Switch Account Required",
          `You are currently signed in with an <b>${currentRole}</b> account (${esc(currentUser.email)}). Applicant features require a student account.`,
          [
            {
              label: "Log in as Student",
              primary: true,
              onClick: async () => {
                await logout();
                clearToken();
                location.href = "auth.html?role=student#login";
              },
            },
            {
              label: "Go to Staff Dashboard",
              onClick: () => { location.href = "portal.html"; },
            },
            { label: "Cancel" },
          ]
        );
      }
      return;
    }

    // Officer Card
    if (targetRole === "officer") {
      if (currentRole === "officer" || currentRole === "admin") {
        location.href = "portal.html";
      } else {
        showDialog(
          "Access Restricted: Staff Portal",
          `You are currently signed in as a <b>Student</b> (${esc(currentUser.email)}). Admission Officer credentials are required to verify documents and review applications.`,
          [
            {
              label: "Log in as Officer",
              primary: true,
              onClick: async () => {
                await logout();
                clearToken();
                location.href = "auth.html?role=officer#login";
              },
            },
            {
              label: "Return to Student Dashboard",
              onClick: () => { location.href = "portal.html"; },
            },
            { label: "Cancel" },
          ]
        );
      }
      return;
    }

    // Admin Card
    if (targetRole === "admin") {
      if (currentRole === "admin") {
        location.href = "portal.html";
      } else {
        showDialog(
          "Access Restricted: Administrator Portal",
          `You are currently signed in as a <b>${currentRole}</b> (${esc(currentUser.email)}). System Administrator privileges are required to manage users, permissions, and audit logs.`,
          [
            {
              label: "Log in as Administrator",
              primary: true,
              onClick: async () => {
                await logout();
                clearToken();
                location.href = "auth.html?role=admin#login";
              },
            },
            {
              label: `Return to ${currentRole.charAt(0).toUpperCase() + currentRole.slice(1)} Dashboard`,
              onClick: () => { location.href = "portal.html"; },
            },
            { label: "Cancel" },
          ]
        );
      }
      return;
    }
  }

  // Attach listeners to role cards
  const studentCard = document.getElementById("card-student");
  if (studentCard) {
    studentCard.onclick = e => {
      if (e.target.closest("a") && !currentUser) return;
      e.preventDefault();
      handleRoleClick("student", "auth.html?role=student#login", e);
    };
    studentCard.onkeydown = e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleRoleClick("student", "auth.html?role=student#login", e);
      }
    };
  }

  const officerCard = document.getElementById("card-officer");
  if (officerCard) {
    officerCard.onclick = e => {
      if (e.target.closest("a") && !currentUser) return;
      e.preventDefault();
      handleRoleClick("officer", "auth.html?role=officer#login", e);
    };
    officerCard.onkeydown = e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleRoleClick("officer", "auth.html?role=officer#login", e);
      }
    };
  }

  const adminCard = document.getElementById("card-admin");
  if (adminCard) {
    adminCard.onclick = e => {
      if (e.target.closest("a") && !currentUser) return;
      e.preventDefault();
      handleRoleClick("admin", "auth.html?role=admin#login", e);
    };
    adminCard.onkeydown = e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleRoleClick("admin", "auth.html?role=admin#login", e);
      }
    };
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLandingPage);
} else {
  initLandingPage();
}
