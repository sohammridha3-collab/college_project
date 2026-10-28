import { Router } from "express";
import { login, register, me, logout, forgotPassword, resetPassword } from "../controllers/authController.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.post("/login", login);
router.post("/register", register);
router.post("/logout", logout);
router.get("/me", authenticate, me);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

export default router;
