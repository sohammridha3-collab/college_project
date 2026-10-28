import { Router } from "express";
import {
  getDashboard, getApplication, saveApplication, submitApplication,
  getStatus, getDocuments, uploadDocument, deleteDocument,
  getFee, checkoutFee, verifyGatewayCallback,
  getNotifications, markNotificationRead
} from "../controllers/studentController.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";

const router = Router();

// Public callback for simulated payment gateway return
router.get("/payments/verify-gateway", verifyGatewayCallback);

// All other student routes require student role
router.use(authenticate, requireRole("student"));

router.get("/dashboard", getDashboard);
router.get("/application", getApplication);
router.put("/application", saveApplication);
router.post("/application/submit", submitApplication);
router.get("/application/status", getStatus);

router.get("/documents", getDocuments);
router.post("/documents", upload.single("file"), uploadDocument);
router.delete("/documents/:id", deleteDocument);

router.get("/fee", getFee);
router.post("/payments/checkout", checkoutFee);

router.get("/notifications", getNotifications);
router.post("/notifications/:id/read", markNotificationRead);

export default router;
