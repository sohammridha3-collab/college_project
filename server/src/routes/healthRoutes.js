import { Router } from "express";
import { testConnection, activeEngine } from "../config/db.js";

const router = Router();

router.get("/health", async (req, res) => {
  const isMysql = await testConnection();
  res.status(200).json({
    status: "UP",
    database: isMysql ? "CONNECTED_MYSQL" : "LOCAL_PERSISTENT_STORE",
    mysqlConfigured: isMysql,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

export default router;
