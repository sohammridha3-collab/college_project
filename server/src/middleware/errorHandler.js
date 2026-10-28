import multer from "multer";

export function errorHandler(err, req, res, next) {
  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err);

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "File exceeds the maximum upload size limit." });
    }
    return res.status(400).json({ message: `Upload error: ${err.message}` });
  }

  if (err.code === "ER_DUP_ENTRY") {
    return res.status(409).json({ message: "An account or record with this information already exists." });
  }

  if (err.code === "ER_ACCESS_DENIED_ERROR") {
    return res.status(500).json({
      message: "MySQL Access Denied: Please set your MySQL root password in server/.env (DB_PASSWORD=...) and run 'npm run seed'.",
    });
  }

  if (err.code === "ECONNREFUSED") {
    return res.status(503).json({
      message: "Cannot connect to MySQL server at localhost:3306. Please ensure the MySQL service is running.",
    });
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || "An unexpected internal server error occurred.";

  res.status(status).json({
    message,
    ...(process.env.NODE_ENV === "development" ? { stack: err.stack } : {}),
  });
}
