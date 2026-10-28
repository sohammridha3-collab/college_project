import multer from "multer";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, "../..");

dotenv.config({ path: path.join(serverDir, ".env") });
dotenv.config();

const configuredUploadDir = process.env.UPLOAD_DIR || "./uploads";
const uploadDir = path.isAbsolute(configuredUploadDir)
  ? configuredUploadDir
  : path.resolve(serverDir, configuredUploadDir);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}


const maxUploadMb = parseInt(process.env.MAX_UPLOAD_MB || "5", 10);
const allowedMimeTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
const allowedExtensions = [".pdf", ".jpg", ".jpeg", ".png"];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `doc-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExtensions.includes(ext) || !allowedMimeTypes.includes(file.mimetype)) {
    return cb(new Error("Invalid file type. Only PDF, JPG, and PNG files are accepted."));
  }
  cb(null, true);
};

export const upload = multer({
  storage,
  limits: { fileSize: maxUploadMb * 1024 * 1024 },
  fileFilter,
});
