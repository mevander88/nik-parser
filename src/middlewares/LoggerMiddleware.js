/**
 * Enhanced logger middleware untuk logging yang lebih informatif dan aman
 */
export const logger = (req, res, next) => {
    const start = Date.now();

    // Log request
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - IP: ${req.ip} - User-Agent: ${req.get('User-Agent')}`);

    // Log request body (hanya untuk non-GET requests dan bukan sensitive data)
    if (req.method !== 'GET' && req.body) {
        const sanitizedBody = { ...req.body };

        // Remove sensitive data from logs
        delete sanitizedBody.password;
        delete sanitizedBody.token;
        delete sanitizedBody.secret;
        delete sanitizedBody.credit_card;

        if (Object.keys(sanitizedBody).length > 0) {
            console.log(`[${new Date().toISOString()}] Request Body:`, JSON.stringify(sanitizedBody));
        }
    }

    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function (chunk, encoding) {
        const duration = Date.now() - start;
        const statusCode = res.statusCode;

        // Log response
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - Status: ${statusCode} - Duration: ${duration}ms`);

        // Log errors
        if (statusCode >= 400) {
            console.error(`[${new Date().toISOString()}] Error Response:`, {
                method: req.method,
                url: req.originalUrl,
                statusCode,
                duration,
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });
        }

        originalEnd.call(this, chunk, encoding);
    };

    next();
};

/**
 * Security logger untuk mencatat aktivitas mencurigakan
 */
export const securityLogger = (req, res, next) => {
    const suspiciousPatterns = [
        /<script/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /union\s+select/i,
        /drop\s+table/i,
        /delete\s+from/i,
        /insert\s+into/i,
        /update\s+set/i,
        /exec\s*\(/i,
        /eval\s*\(/i,
        /\.\.\//i, // Directory traversal
        /\.\.\\/i   // Directory traversal (Windows)
    ];

    const checkSuspicious = (obj, path = '') => {
        if (typeof obj === 'string') {
            for (const pattern of suspiciousPatterns) {
                if (pattern.test(obj)) {
                    console.warn(`[SECURITY WARNING] Suspicious input detected:`, {
                        pattern: pattern.source,
                        value: obj,
                        path,
                        ip: req.ip,
                        userAgent: req.get('User-Agent'),
                        method: req.method,
                        url: req.originalUrl,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        } else if (typeof obj === 'object' && obj !== null) {
            for (const [key, value] of Object.entries(obj)) {
                checkSuspicious(value, `${path}.${key}`);
            }
        }
    };

    checkSuspicious(req.body, 'body');
    checkSuspicious(req.query, 'query');
    checkSuspicious(req.params, 'params');

    next();
};

/**
 * Performance logger untuk monitoring performa
 */
export const performanceLogger = (req, res, next) => {
    const start = process.hrtime();

    res.on('finish', () => {
        const [seconds, nanoseconds] = process.hrtime(start);
        const duration = seconds * 1000 + nanoseconds / 1000000; // Convert to milliseconds

        // Log slow requests
        if (duration > 1000) { // More than 1 second
            console.warn(`[PERFORMANCE WARNING] Slow request detected:`, {
                method: req.method,
                url: req.originalUrl,
                duration: `${duration.toFixed(2)}ms`,
                statusCode: res.statusCode,
                ip: req.ip,
                timestamp: new Date().toISOString()
            });
        }

        // Log all requests for performance monitoring
        console.log(`[PERFORMANCE] ${req.method} ${req.originalUrl} - ${duration.toFixed(2)}ms`);
    });

    next();
};