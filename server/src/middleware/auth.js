import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { getPool } from "../config/db.js";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_student_portal_2026_xyz!";
const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "portal_token";

export async function authenticate(req, res, next) {
  try {
    let token = null;

    if (req.cookies && req.cookies[COOKIE_NAME]) {
      token = req.cookies[COOKIE_NAME];
    } else if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ message: "Authentication required. Please log in." });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    // Fetch user with role name and status from DB
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT u.id, u.email, u.status, u.role_id, r.name AS role,
              COALESCE(sp.full_name, ao.full_name, 'Admin') AS name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN student_profiles sp ON u.id = sp.user_id
       LEFT JOIN admission_officers ao ON u.id = ao.user_id
       WHERE u.id = ? LIMIT 1`,
      [decoded.userId]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "User account not found." });
    }

    const user = rows[0];

    if (user.status === "suspended") {
      return res.status(403).json({ message: "Your account has been suspended. Please contact the administrator." });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Your session has expired. Please log in again." });
    }
    return res.status(401).json({ message: "Invalid session token. Please log in." });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const userRole = String(req.user.role || "").toLowerCase();
    const allowed = roles.map(r => r.toLowerCase());

    if (!allowed.includes(userRole)) {
      return res.status(403).json({ message: "Access forbidden: insufficient role permissions." });
    }
    next();
  };
}

export function generateToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export { COOKIE_NAME };
