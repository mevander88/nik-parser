import helmet from 'helmet';
import cors from 'cors';
import { errorResponse } from '../utils/responseHandler.js';

/**
 * CORS Configuration
 */
export const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:5173',
            'http://localhost:4000',
            'http://192.168.56.1:4000',
        ];

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400 // 24 jam
};

/**
 * Helmet Configuration untuk security headers
 */
export const helmetConfig = helmet({
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
});

/**
 * Input validation dan sanitasi (tanpa mengubah req.query)
 */
export const inputValidation = (req, res, next) => {
    const sanitizeInput = (obj) => {
        if (typeof obj !== 'object' || obj === null) return obj;

        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                // Remove potential XSS
                sanitized[key] = value
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                    .replace(/javascript:/gi, '')
                    .replace(/on\w+\s*=/gi, '')
                    .trim();
            } else if (typeof value === 'object') {
                sanitized[key] = sanitizeInput(value);
            } else {
                sanitized[key] = value;
            }
        }
        return sanitized;
    };

    // Sanitasi body dan params (tidak mengubah query karena read-only)
    if (req.body) {
        req.body = sanitizeInput(req.body);
    }
    if (req.params) {
        req.params = sanitizeInput(req.params);
    }

    // Untuk query, kita hanya log jika ada suspicious content
    if (req.query) {
        const suspiciousPatterns = [
            /<script/i,
            /javascript:/i,
            /on\w+\s*=/i,
            /union\s+select/i,
            /drop\s+table/i,
            /delete\s+from/i,
            /insert\s+into/i,
            /update\s+set/i
        ];

        const checkSuspicious = (obj) => {
            if (typeof obj === 'string') {
                for (const pattern of suspiciousPatterns) {
                    if (pattern.test(obj)) {
                        console.warn('Suspicious query parameter detected:', {
                            pattern: pattern.source,
                            value: obj,
                            ip: req.ip,
                            userAgent: req.get('User-Agent'),
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            } else if (typeof obj === 'object' && obj !== null) {
                for (const value of Object.values(obj)) {
                    checkSuspicious(value);
                }
            }
        };

        checkSuspicious(req.query);
    }

    next();
};

/**
 * Middleware untuk mencegah parameter pollution
 */
export const preventParameterPollution = (req, res, next) => {
    // Check for duplicate parameters
    const checkDuplicates = (obj) => {
        if (Array.isArray(obj)) {
            return obj.length === 1 ? obj[0] : obj;
        }
        return obj;
    };

    if (req.query) {
        for (const key in req.query) {
            req.query[key] = checkDuplicates(req.query[key]);
        }
    }

    next();
};

/**
 * Middleware untuk mencegah HTTP Parameter Pollution
 */
export const preventHTTPParameterPollution = (req, res, next) => {
    const originalUrl = req.url;
    const cleanUrl = originalUrl.replace(/[<>]/g, '');

    if (originalUrl !== cleanUrl) {
        return errorResponse(res, 400, 'Invalid characters in URL');
    }

    next();
};

/**
 * Middleware untuk validasi Content-Type
 */
export const validateContentType = (req, res, next) => {
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        const contentType = req.get('Content-Type');

        if (!contentType || !contentType.includes('application/json')) {
            return errorResponse(res, 400, 'Content-Type must be application/json');
        }
    }

    next();
};

/**
 * Middleware untuk mencegah NoSQL Injection
 */
export const preventNoSQLInjection = (req, res, next) => {
    const checkNoSQLInjection = (obj) => {
        if (typeof obj === 'string') {
            // Check for MongoDB operators
            const mongoOperators = ['$where', '$ne', '$gt', '$lt', '$gte', '$lte', '$in', '$nin', '$regex'];
            for (const operator of mongoOperators) {
                if (obj.includes(operator)) {
                    return false;
                }
            }
        } else if (typeof obj === 'object' && obj !== null) {
            for (const value of Object.values(obj)) {
                if (!checkNoSQLInjection(value)) {
                    return false;
                }
            }
        }
        return true;
    };

    if (!checkNoSQLInjection(req.body) || !checkNoSQLInjection(req.query)) {
        return errorResponse(res, 400, 'Invalid input detected');
    }

    next();
};

// Rate limiting storage
const rateLimitStore = new Map();
const blockedIPs = new Set();

// LAYERING SECURITY: Multi-layer security middleware
export const securityMiddleware = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  
  // LAYER 1: Check if IP is blocked
  if (blockedIPs.has(clientIP)) {
    return errorResponse(res, 403, "Access denied - IP address is blocked");
  }

  // LAYER 2: Basic request validation
  if (!req.headers['user-agent'] || req.headers['user-agent'].length < 10) {
    return errorResponse(res, 400, "Invalid User-Agent");
  }

  // LAYER 3: Content-Type validation for POST/PUT requests
  if ((req.method === 'POST' || req.method === 'PUT') && req.headers['content-type']) {
    const contentType = req.headers['content-type'].toLowerCase();
    if (contentType.includes('application/json') && !contentType.includes('charset')) {
      // Add charset for JSON requests
      req.headers['content-type'] = 'application/json; charset=utf-8';
    }
  }

  // LAYER 4: Request size validation
  const contentLength = parseInt(req.headers['content-length'] || '0');
  if (contentLength > 100 * 1024 * 1024) { // 100MB limit
    return errorResponse(res, 413, "Request too large");
  }

  // LAYER 5: Rate limiting
  if (!checkRateLimit(clientIP)) {
    return errorResponse(res, 429, "Too many requests. Please try again later.");
  }

  // LAYER 6: Suspicious pattern detection
  const suspiciousPatterns = [
    /\.\./, // Directory traversal
    /<script/i, // XSS attempts
    /javascript:/i,
    /onload/i,
    /onerror/i,
    /eval\s*\(/i,
    /exec\s*\(/i,
    /system\s*\(/i,
    /union\s+select/i, // SQL injection
    /drop\s+table/i,
    /delete\s+from/i,
    /insert\s+into/i,
    /update\s+set/i,
    /alter\s+table/i,
    /rm\s+-rf/i, // Shell commands
    /del\s+\/s/i,
    /format\s+c:/i,
    /shutdown/i,
    /reboot/i,
    /net\s+user/i,
    /wmic/i,
    /reg\s+add/i,
    /reg\s+delete/i,
    /virus/i,
    /malware/i,
    /trojan/i,
    /backdoor/i,
    /keylogger/i,
    /spyware/i,
    /base64/i,
    /rot13/i,
    /hex2bin/i,
    /bin2hex/i,
    /urlencode/i,
    /urldecode/i
  ];

  const requestString = JSON.stringify({
    url: req.url,
    method: req.method,
    headers: req.headers,
    body: req.body,
    query: req.query,
    params: req.params
  }).toLowerCase();

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(requestString)) {
      console.log(`[SECURITY] Suspicious pattern detected from ${clientIP}: ${pattern}`);
      incrementViolation(clientIP);
      return errorResponse(res, 400, "Suspicious request detected");
    }
  }

  // LAYER 7: Request frequency analysis
  analyzeRequestFrequency(clientIP, req);

  next();
};

// Rate limiting function
const checkRateLimit = (ip) => {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 100; // 100 requests per minute

  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, []);
  }

  const requests = rateLimitStore.get(ip);
  const validRequests = requests.filter(time => now - time < windowMs);

  if (validRequests.length >= maxRequests) {
    return false;
  }

  validRequests.push(now);
  rateLimitStore.set(ip, validRequests);
  return true;
};

// Violation tracking
const incrementViolation = (ip) => {
  const violations = rateLimitStore.get(`violations_${ip}`) || 0;
  rateLimitStore.set(`violations_${ip}`, violations + 1);

  if (violations >= 5) {
    blockedIPs.add(ip);
    console.log(`[SECURITY] IP ${ip} blocked due to multiple violations`);
  }
};

// Request frequency analysis
const analyzeRequestFrequency = (ip, req) => {
  const now = Date.now();
  const key = `freq_${ip}`;
  
  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, []);
  }

  const requests = rateLimitStore.get(key);
  requests.push({
    time: now,
    url: req.url,
    method: req.method
  });

  // Keep only last 100 requests
  if (requests.length > 100) {
    requests.splice(0, requests.length - 100);
  }

  // Analyze for suspicious patterns
  const recentRequests = requests.filter(r => now - r.time < 10000); // Last 10 seconds
  if (recentRequests.length > 50) {
    console.log(`[SECURITY] High frequency requests detected from ${ip}: ${recentRequests.length} requests in 10 seconds`);
    incrementViolation(ip);
  }

  // Check for repeated failed requests
  const failedRequests = requests.filter(r => now - r.time < 60000 && r.status === 'failed'); // Last minute
  if (failedRequests.length > 20) {
    console.log(`[SECURITY] Multiple failed requests detected from ${ip}: ${failedRequests.length} failed requests`);
    incrementViolation(ip);
  }
};

// Cleanup old data periodically
setInterval(() => {
  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1 hour

  for (const [key, value] of rateLimitStore.entries()) {
    if (Array.isArray(value)) {
      const filtered = value.filter(item => {
        if (typeof item === 'number') {
          return now - item < maxAge;
        }
        if (typeof item === 'object' && item.time) {
          return now - item.time < maxAge;
        }
        return true;
      });
      
      if (filtered.length === 0) {
        rateLimitStore.delete(key);
      } else {
        rateLimitStore.set(key, filtered);
      }
    }
  }
}, 60 * 60 * 1000); // Cleanup every hour

// Export blocked IPs for monitoring
export const getBlockedIPs = () => Array.from(blockedIPs);
export const getRateLimitStats = () => {
  const stats = {};
  for (const [key, value] of rateLimitStore.entries()) {
    if (key.startsWith('violations_')) {
      const ip = key.replace('violations_', '');
      stats[ip] = { violations: value };
    }
  }
  return stats;
}; 