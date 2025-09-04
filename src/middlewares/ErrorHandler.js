import { errorResponse, validationError, notFoundResponse } from '../utils/responseHandler.js';

/**
 * Global error handler middleware
 */
export const errorHandler = (err, req, res, next) => {
  console.error("[Error Handler]", {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return validationError(res, err.message);
  }

  if (err.name === 'CastError') {
    return validationError(res, 'ID tidak valid');
  }

  if (err.code === 'ER_DUP_ENTRY') {
    return errorResponse(res, 409, 'Data sudah ada dalam sistem');
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return errorResponse(res, 400, 'Referensi data tidak ditemukan');
  }

  if (err.code === 'ER_ROW_IS_REFERENCED_2') {
    return errorResponse(res, 400, 'Data tidak dapat dihapus karena masih digunakan');
  }

  if (err.code === 'ER_BAD_FIELD_ERROR') {
    return errorResponse(res, 400, 'Field tidak valid');
  }

  if (err.code === 'ER_PARSE_ERROR') {
    return errorResponse(res, 400, 'Query tidak valid');
  }

  // Handle file upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return errorResponse(res, 400, 'Ukuran file terlalu besar');
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return errorResponse(res, 400, 'File tidak diharapkan');
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return errorResponse(res, 401, 'Token tidak valid');
  }

  if (err.name === 'TokenExpiredError') {
    return errorResponse(res, 401, 'Token telah kadaluarsa');
  }

  // Handle multer errors
  if (err.message && err.message.includes('Jenis file tidak diperbolehkan')) {
    return errorResponse(res, 400, 'Jenis file tidak diperbolehkan');
  }

  // Default error response
  const statusCode = err.status || 500;
  const message = err.message || 'Terjadi kesalahan internal server';

  return errorResponse(res, statusCode, message, process.env.NODE_ENV === 'development' ? err : null);
};

/**
 * Async error wrapper untuk menangani async errors
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Custom error class untuk aplikasi
 */
export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 404 handler untuk route yang tidak ditemukan
 */
export const notFoundHandler = (req, res, next) => {
  const error = new AppError(`Route ${req.originalUrl} tidak ditemukan`, 404);
  next(error);
};