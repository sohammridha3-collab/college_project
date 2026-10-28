/* Central API configuration module. Dynamic origin resolution for production & local dev. */
const getBaseUrl = () => {
  if (typeof window !== "undefined" && window.__API_BASE_URL__) {
    return window.__API_BASE_URL__;
  }
  if (typeof location !== "undefined") {
    if (location.port === "3000" || location.port === "80" || location.port === "443") {
      return "/api";
    }
    const host = location.hostname || "localhost";
    return `http://${host}:3000/api`;
  }
  return "http://localhost:3000/api";
};

export const API_BASE_URL = getBaseUrl();
export const MAX_UPLOAD_MB = 5;

export const getToken = () => {
  try {
    return localStorage.getItem("portal_token") || sessionStorage.getItem("portal_token") || null;
  } catch {
    return null;
  }
};

export const setToken = (token, remember = true) => {
  try {
    if (!token) return;
    if (remember) {
      localStorage.setItem("portal_token", token);
    } else {
      sessionStorage.setItem("portal_token", token);
    }
  } catch {}
};

export const clearToken = () => {
  try {
    localStorage.removeItem("portal_token");
    sessionStorage.removeItem("portal_token");
    localStorage.removeItem("portal_user");
  } catch {}
};

/* All endpoint paths (relative to API_BASE_URL). Match these to backend routes. */
export const ENDPOINTS = {
  auth: {
    login: "/auth/login",
    register: "/auth/register",
    logout: "/auth/logout",
    me: "/auth/me",
    forgot: "/auth/forgot-password",
    reset: "/auth/reset-password",
  },
  student: {
    dashboard: "/student/dashboard",
    application: "/student/application",
    submit: "/student/application/submit",
    status: "/student/application/status",
    documents: "/student/documents",
    document: id => `/student/documents/${id}`,
    documentView: id => `/documents/${id}/view`,
    fee: "/student/fee",
    checkout: "/student/payments/checkout",
    notifications: "/student/notifications",
    readNotification: id => `/student/notifications/${id}/read`,
  },
  officer: {
    dashboard: "/officer/dashboard",
    applications: "/officer/applications",
    application: id => `/officer/applications/${id}`,
    documents: "/officer/documents",
    verifyDocument: (appId, docId) => `/officer/applications/${appId}/documents/${docId}/verify`,
    review: id => `/officer/applications/${id}/review`,
    exams: "/officer/exam-results",
    exam: id => `/officer/applications/${id}/exam-result`,
    decision: id => `/officer/applications/${id}/decision`,
    reports: "/officer/reports",
  },
  admin: {
    dashboard: "/admin/dashboard",
    students: "/admin/students",
    officers: "/admin/officers",
    users: "/admin/users",
    roles: "/admin/roles",
    permissions: "/admin/permissions",
    settings: "/admin/settings",
    audit: "/admin/audit-logs",
    reports: "/admin/reports",
  },
};

export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

const NO_REDIRECT = [ENDPOINTS.auth.login, ENDPOINTS.auth.me, ENDPOINTS.auth.register];

async function request(path, { method = "GET", body, query, raw } = {}) {
  const url = new URL(API_BASE_URL.replace(/\/$/, "") + path, location.origin);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== "" && v != null) url.searchParams.set(k, v);
  }

  const opts = {
    method,
    credentials: "include", // Sends session cookies across origins
    headers: { Accept: "application/json" },
  };

  const token = getToken();
  if (token) {
    opts.headers["Authorization"] = `Bearer ${token}`;
  }

  if (body instanceof FormData) {
    opts.body = body; // Browser sets multipart boundary
  } else if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers["Content-Type"] = "application/json";
  }

  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new ApiError(
      `Cannot reach the server at ${API_BASE_URL}. Check that the backend is running and allows this origin (CORS).`,
      0
    );
  }

  if (res.ok && raw) return res.blob();

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (res.ok) {
        throw new ApiError("The server returned a response that is not valid JSON.", res.status);
      }
    }
  }

  if (!res.ok) {
    if (res.status === 401 && !NO_REDIRECT.includes(path)) {
      clearToken();
      window.dispatchEvent(new Event("session-expired"));
    }
    const m = data && (data.message || data.error);
    const fb = {
      400: "The request was invalid.",
      401: "Please log in to continue.",
      403: "You don't have permission to perform this action.",
      404: "The requested resource was not found.",
      409: "This information conflicts with an existing record.",
      422: "Please check all required fields and try again.",
      500: "The server encountered an error.",
      503: "Service temporarily unavailable.",
    }[res.status] || (res.status >= 500 ? "Server error. Try again later." : `Request failed (${res.status}).`);

    throw new ApiError(m || fb, res.status, data);
  }

  return data;
}

export const api = {
  get: (p, query) => request(p, { query }),
  post: (p, body) => request(p, { method: "POST", body }),
  put: (p, body) => request(p, { method: "PUT", body }),
  patch: (p, body) => request(p, { method: "PATCH", body }),
  del: p => request(p, { method: "DELETE" }),
  blob: (p, query) => request(p, { query, raw: true }),
};
