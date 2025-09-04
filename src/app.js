import express from "express";
import helmet from "helmet";
import cors from "cors";
import dotenv from "dotenv";

import NikRoute from "./routes/NikRoute.js";
import { errorHandler, notFoundHandler } from "./middlewares/ErrorHandler.js";
import {
  logger, securityLogger, performanceLogger
} from "./middlewares/LoggerMiddleware.js";
import {
  inputValidation, securityMiddleware
} from "./middlewares/SecurityMiddleware.js";

dotenv.config();

const app = express();

// Helmet (CSP disesuaikan untuk domain Vercel)
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:", "*.vercel.app"], // allow vercel
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS: izinkan domain vercel dan lokal
const allowAll = process.env.CORS_ALLOW_ALL === "true";
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowAll) return cb(null, true);
    const ok =
      /https?:\/\/localhost(:\d+)?$/.test(origin) ||
      /\.vercel\.app$/.test(new URL(origin).hostname);
    return ok ? cb(null, true) : cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

// Parsers — kecilkan limit
app.use(express.json({ limit: "3mb" }));
app.use(express.urlencoded({ extended: true, limit: "3mb" }));

// Security + logging
app.use(securityMiddleware);
app.use(inputValidation);
app.use(securityLogger);
app.use(logger);
app.use(performanceLogger);

// Health
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "API Running",
    environment: process.env.NODE_ENV || "development",
    hasKpuToken: !!process.env.KPU_TOKEN,
  });
});

// Routes
app.use("/api/nik", NikRoute);

// 404 & error
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
