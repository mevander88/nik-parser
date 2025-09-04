import express from "express";

import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";

import {
  logger,
  securityLogger,
  performanceLogger
} from "./middlewares/LoggerMiddleware.js";
import {
  inputValidation,
  securityMiddleware
} from "./middlewares/SecurityMiddleware.js";
import { errorHandler, notFoundHandler } from "./middlewares/ErrorHandler.js";

import NikRoute from "./routes/NikRoute.js";


dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Check if CORS_ALLOW_ALL is set to true for development
    if (process.env.CORS_ALLOW_ALL === 'true') {
      return callback(null, true);
    }

    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'http://localhost:4173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:4173',
      // Allow local network IPs for development
      /^http:\/\/192\.168\.\d+\.\d+:\d+$/,
      /^http:\/\/10\.\d+\.\d+\.\d+:\d+$/,
      /^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+:\d+$/,
    ];

    // Add custom origins from environment variable
    if (process.env.CORS_ALLOWED_ORIGINS) {
      const customOrigins = process.env.CORS_ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
      allowedOrigins.push(...customOrigins);
    }

    // Check if origin matches any allowed pattern
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return origin === allowed;
      } else if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return false;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      console.log(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400
}));

// LAYERING SECURITY: Apply security middleware first
app.use(securityMiddleware);
app.use(inputValidation);
app.use(securityLogger);

app.use(logger);
app.use(performanceLogger);

// Ignore favicon.ico requests
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "API Running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.use(express.json({ limit: '3gb' }));
app.use(express.urlencoded({ extended: true, limit: '3gb' }));

app.use("/api/nik", NikRoute);


app.use(notFoundHandler);

app.use(errorHandler);


app.listen(PORT, '0.0.0.0', () => {
  const serverUrl = process.env.NODE_ENV === 'production'
    ? `https://app.seromula.com/api`
    : `http://localhost:${PORT}`;

  console.log(`🚀 Server running at ${serverUrl}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🛡️ Security middleware enabled`);
  console.log(`📝 Logging enabled`);
  console.log(`🌐 CORS enabled for: ${process.env.CORS_ALLOWED_ORIGINS || 'default origins'}`);

  if (process.env.NODE_ENV === 'production') {
    console.log(`✅ Production mode - Ready for osint`);
  }
  console.log('🔌 New connection established with extended timeout');
});