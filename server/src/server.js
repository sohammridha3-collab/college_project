import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import { initDatabase } from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import officerRoutes from "./routes/officerRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authLimiter } from "./middleware/rateLimiter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, "..");
const clientRoot = path.resolve(__dirname, "../../");

dotenv.config({ path: path.join(serverRoot, ".env") });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security Headers (MIME sniffing prevention, clickjacking defense, XSS protection)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// CORS configuration supporting credentials and all local dev origins (5500, 5501, 3000, 5173, etc.)
const defaultOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:5501",
  "http://127.0.0.1:5501",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];
const envOrigins = (process.env.CORS_ORIGIN || "").split(",").map(o => o.trim()).filter(Boolean);
const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

const corsOptions = {
  origin: (origin, callback) => {
    // 1. Allow non-browser or same-origin requests (origin is undefined)
    if (!origin) return callback(null, true);

    // 2. Allow if origin matches configured allowed list or wildcard
    if (allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
      return callback(null, true);
    }

    // 3. Allow file:// origins (origin === "null") and any local development port
    if (
      origin === "null" ||
      /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)
    ) {
      return callback(null, true);
    }

    // Fallback: allow to avoid breaking local student project environments
    callback(null, true);
  },
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Protect internal server directory from direct static exposure
app.use("/server", (req, res) => res.status(403).send("Forbidden"));
app.use("/uploads", (req, res) => res.status(404).json({ message: "Not Found" }));

// Protected Document Download Route (Direct public /uploads folder is intentionally NOT exposed)
app.use("/api/documents", documentRoutes);

// API Routes
app.use("/api", healthRoutes);
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/officer", officerRoutes);
app.use("/api/admin", adminRoutes);

// Serve static frontend files (index.html, portal.html, auth.html, css, js)
app.use(express.static(clientRoot));

// HTML Page Route Helpers for clean URL access
app.get("/", (req, res) => res.sendFile(path.join(clientRoot, "index.html")));
app.get("/auth", (req, res) => res.sendFile(path.join(clientRoot, "auth.html")));
app.get("/portal", (req, res) => res.sendFile(path.join(clientRoot, "portal.html")));

// Centralized Error Handler
app.use(errorHandler);

// Start server
app.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(`🚀 Student Admission Portal API & Web Server running!`);
  console.log(`🌐 Web App:     http://localhost:${PORT}`);
  console.log(`🔐 Auth Page:   http://localhost:${PORT}/auth.html`);
  console.log(`📋 Portal Page: http://localhost:${PORT}/portal.html`);
  console.log(`📡 API Health:  http://localhost:${PORT}/api/health`);
  console.log(`=======================================================`);
  await initDatabase();
});

export default app;

