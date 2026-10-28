import bcrypt from "bcryptjs";
import crypto from "crypto";
import { getPool } from "../config/db.js";
import { generateToken, COOKIE_NAME } from "../middleware/auth.js";
import { logAudit } from "../services/auditService.js";

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const pool = getPool();
    const [users] = await pool.query(
      `SELECT u.id, u.email, u.password_hash, u.status, u.role_id, r.name AS role,
              COALESCE(sp.full_name, ao.full_name, 'Admin') AS name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN student_profiles sp ON u.id = sp.user_id
       LEFT JOIN admission_officers ao ON u.id = ao.user_id
       WHERE LOWER(u.email) = LOWER(?) LIMIT 1`,
      [email.trim()]
    );

    if (!users.length) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const user = users[0];

    if (user.status === "suspended") {
      return res.status(403).json({ message: "Your account is suspended. Please contact the administrator." });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const token = generateToken(user);

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    await logAudit({
      userId: user.id,
      userEmail: user.email,
      action: "USER_LOGIN",
      details: `Successful login as ${user.role}`,
      ip: req.ip,
    });

    return res.json({
      message: "Logged in successfully",
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
      token,
    });
  } catch (err) {
    next(err);
  }
}

export async function register(req, res, next) {
  try {
    const { fullName, email, phone, password } = req.body;
    if (!fullName || !email || !phone || !password) {
      return res.status(400).json({ message: "All fields are required." });
    }

    if (password.length < 8 || !/(?=.*[A-Za-z])(?=.*\d)/.test(password)) {
      return res.status(400).json({ message: "Password must be at least 8 characters and contain both letters and a number." });
    }

    const pool = getPool();

    // Check registration open
    const [settings] = await pool.query(`SELECT registration_open FROM system_settings WHERE id = 1 LIMIT 1`);
    if (settings.length && !settings[0].registration_open) {
      return res.status(403).json({ message: "Registration is currently closed by the admissions office." });
    }

    // Check if user exists
    const [existing] = await pool.query(`SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1`, [email.trim()]);
    if (existing.length) {
      return res.status(409).json({ message: "An account with this email address already exists." });
    }

    // Get student role id
    const [roles] = await pool.query(`SELECT id FROM roles WHERE name = ? LIMIT 1`, ["student"]);
    if (!roles.length) {
      return res.status(500).json({ message: "Student role not configured in database." });
    }
    const roleId = roles[0].id;

    const passwordHash = await bcrypt.hash(password, 10);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [userResult] = await connection.query(
        `INSERT INTO users (email, password_hash, role_id, status) VALUES (?, ?, ?, 'active')`,
        [email.trim().toLowerCase(), passwordHash, roleId]
      );
      const userId = userResult.insertId;

      await connection.query(
        `INSERT INTO student_profiles (user_id, full_name, phone) VALUES (?, ?, ?)`,
        [userId, fullName.trim(), phone.trim()]
      );

      // Create draft application
      const [appResult] = await connection.query(
        `INSERT INTO admission_applications (user_id, status) VALUES (?, 'Draft')`,
        [userId]
      );

      await connection.query(
        `INSERT INTO application_status_history (application_id, step, status, remarks)
         VALUES (?, 'Account Created', 'Complete', 'Student registered account successfully.')`,
        [appResult.insertId]
      );

      // Welcome notification
      await connection.query(
        `INSERT INTO notifications (user_id, title, message)
         VALUES (?, 'Welcome to Student Admission Portal', 'Your account has been created. Start filling out your application form.')`,
        [userId]
      );

      await connection.commit();

      const userForToken = {
        id: userId,
        email: email.trim().toLowerCase(),
        role: "student",
        name: fullName.trim(),
      };
      const token = generateToken(userForToken);

      res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      await logAudit({
        userId,
        userEmail: email,
        action: "USER_REGISTER",
        details: "Student account created",
        ip: req.ip,
      });

      return res.status(201).json({
        message: "Account created successfully.",
        user: userForToken,
        token,
      });
    } catch (txErr) {
      await connection.rollback();
      throw txErr;
    } finally {
      connection.release();
    }
  } catch (err) {
    next(err);
  }
}

export function me(req, res) {
  const user = {
    id: req.user.id,
    email: req.user.email,
    role: req.user.role,
    name: req.user.name,
  };
  return res.json({
    ...user,
    user,
  });
}

export async function logout(req, res) {
  res.clearCookie(COOKIE_NAME);
  return res.json({ message: "Logged out successfully." });
}

export async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required." });
    }

    const pool = getPool();
    const [users] = await pool.query(`SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1`, [email.trim()]);

    if (users.length) {
      const resetToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 3600000); // 1 hour

      await pool.query(
        `UPDATE users SET reset_token = ?, reset_token_expires_at = ? WHERE id = ?`,
        [resetToken, expiresAt, users[0].id]
      );

      console.log(`[Password Reset Token for ${email}]: ${resetToken}`);
      return res.json({
        message: "If an account exists for that email, reset instructions have been sent.",
        devResetToken: process.env.NODE_ENV !== "production" ? resetToken : undefined,
      });
    }

    return res.json({ message: "If an account exists for that email, reset instructions have been sent." });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: "Token and new password are required." });
    }

    if (password.length < 8 || !/(?=.*[A-Za-z])(?=.*\d)/.test(password)) {
      return res.status(400).json({ message: "Password must be at least 8 characters with letters and a number." });
    }

    const pool = getPool();
    const [users] = await pool.query(
      `SELECT id, email FROM users WHERE reset_token = ? AND reset_token_expires_at > NOW() LIMIT 1`,
      [token]
    );

    if (!users.length) {
      return res.status(400).json({ message: "Invalid or expired password reset token." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query(
      `UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires_at = NULL WHERE id = ?`,
      [passwordHash, users[0].id]
    );

    await logAudit({
      userId: users[0].id,
      userEmail: users[0].email,
      action: "PASSWORD_RESET",
      details: "Password reset completed via token",
      ip: req.ip,
    });

    return res.json({ message: "Password updated successfully. You can now log in." });
  } catch (err) {
    next(err);
  }
}
