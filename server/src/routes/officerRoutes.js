import { Router } from "express";
import {
  getDashboard, getApplications, getApplicationDetail,
  getDocuments, verifyDocument, saveReview,
  getExamResults, recordExamResult, decideApplication, getReports
} from "../controllers/officerController.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = Router();

// Officers and Admins can access officer endpoints
router.use(authenticate, requireRole("officer", "admin"));

router.get("/dashboard", getDashboard);
router.get("/applications", getApplications);
router.get("/applications/:id", getApplicationDetail);
router.post("/applications/:appId/documents/:docId/verify", verifyDocument);
router.post("/applications/:id/review", saveReview);
router.get("/documents", getDocuments);
router.get("/exam-results", getExamResults);
router.put("/applications/:id/exam-result", recordExamResult);
router.post("/applications/:id/decision", decideApplication);
router.get("/reports", getReports);

export default router;
