import mysql from "mysql2/promise";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getLocalPool, initLocalStore } from "./localStore.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306", 10),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "admission_portal",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true,
};

let mysqlPool = null;
let activeEngine = null; // 'mysql' or 'local'

export async function testConnection() {
  // If user provided a password or we haven't tried mysql
  if (dbConfig.password) {
    try {
      const conn = await mysql.createConnection({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
      });
      await conn.end();
      activeEngine = "mysql";
      return true;
    } catch (err) {
      activeEngine = "local";
      return false;
    }
  }
  activeEngine = "local";
  return false;
}

export function getPool() {
  if (activeEngine === "mysql") {
    if (!mysqlPool) {
      mysqlPool = mysql.createPool(dbConfig);
    }
    return mysqlPool;
  }
  return getLocalPool();
}

export async function initDatabase() {
  const isMysqlConnected = await testConnection();

  if (isMysqlConnected) {
    try {
      const rootConn = await mysql.createConnection({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        multipleStatements: true,
      });
      await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`;`);
      await rootConn.end();

      const schemaPath = path.join(__dirname, "schema.sql");
      if (fs.existsSync(schemaPath)) {
        const sql = fs.readFileSync(schemaPath, "utf-8");
        const pool = getPool();
        await pool.query(sql);

        // Safe non-destructive migrations for MySQL
        try {
          await pool.query(`ALTER TABLE uploaded_documents ADD COLUMN IF NOT EXISTS file_data LONGTEXT NULL;`);
        } catch {
          try { await pool.query(`ALTER TABLE uploaded_documents ADD COLUMN file_data LONGTEXT NULL;`); } catch {}
        }
        try {
          await pool.query(`UPDATE system_settings SET application_fee = 0.00, currency = 'INR' WHERE id = 1 AND (application_fee = 75.00 OR application_fee IS NULL);`);
        } catch {}

        console.log("✅ [DB] Connected to MySQL and verified schema tables.");
      }
      return true;
    } catch (err) {
      console.warn("⚠️ [DB] MySQL init failed, falling back to local store:", err.message);
      activeEngine = "local";
      await initLocalStore();
      return true;
    }
  } else {
    console.log("ℹ️ [DB] Running on persistent local storage engine (Set DB_PASSWORD in server/.env to use MySQL).");
    activeEngine = "local";
    await initLocalStore();
    return true;
  }
}

export { activeEngine };
export default { getPool, testConnection, initDatabase };
