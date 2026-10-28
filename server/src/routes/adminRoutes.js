import { Router } from "express";
import {
  getDashboard, getStudents, getOfficers, getUsers,
  createUser, updateUser, updateUserStatus, resetUserPassword,
  getRoles, updateRolePermissions, getPermissions,
  getSettings, updateSettings, getAuditLogs, getReports
} from "../controllers/adminController.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = Router();

router.use(authenticate, requireRole("admin"));

router.get("/dashboard", getDashboard);

router.get("/students", getStudents);
router.post("/students", createUser);
router.put("/students/:id", updateUser);
router.patch("/students/:id/status", updateUserStatus);
router.post("/students/:id/reset-password", resetUserPassword);

router.get("/officers", getOfficers);
router.post("/officers", createUser);
router.put("/officers/:id", updateUser);
router.patch("/officers/:id/status", updateUserStatus);
router.post("/officers/:id/reset-password", resetUserPassword);

router.get("/users", getUsers);
router.post("/users", createUser);
router.put("/users/:id", updateUser);
router.patch("/users/:id/status", updateUserStatus);
router.post("/users/:id/reset-password", resetUserPassword);

router.get("/roles", getRoles);
router.put("/roles/:id", updateRolePermissions);
router.get("/permissions", getPermissions);

router.get("/settings", getSettings);
router.put("/settings", updateSettings);

router.get("/audit-logs", getAuditLogs);
router.get("/reports", getReports);

export default router;
