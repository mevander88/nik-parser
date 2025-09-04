/**
 * Response sukses dengan data
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code (default: 200)
 * @param {string} message - Success message
 * @param {any} data - Response data
 */
export const successResponse = (res, statusCode = 200, message = "Success", data = null) => {
    const response = {
        success: true,
        message,
        ...(data && { data })
    };

    return res.status(statusCode).json(response);
};

/**
 * Response error
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {string} message - Error message
 * @param {any} error - Error details (optional)
 */
export const errorResponse = (res, statusCode = 500, message = "Internal server error", error = null) => {
    const response = {
        success: false,
        message,
        ...(error && process.env.NODE_ENV === 'development' && { error })
    };

    return res.status(statusCode).json(response);
};

/**
 * Response untuk validasi error
 * @param {Object} res - Express response object
 * @param {string} message - Validation error message
 */
export const validationError = (res, message) => {
    return errorResponse(res, 400, message);
};

/**
 * Response untuk resource tidak ditemukan
 * @param {Object} res - Express response object
 * @param {string} message - Not found message
 */
export const notFoundResponse = (res, message = "Resource not found") => {
    return errorResponse(res, 404, message);
};

/**
 * Response untuk unauthorized
 * @param {Object} res - Express response object
 * @param {string} message - Unauthorized message
 * @param {Object} metadata - Additional metadata (optional)
 */
export const unauthorizedResponse = (res, message = "Unauthorized", metadata = {}) => {
    const response = {
        success: false,
        message,
        ...(metadata && { metadata })
    };

    return res.status(401).json(response);
};

/**
 * Response untuk forbidden
 * @param {Object} res - Express response object
 * @param {string} message - Forbidden message
 */
export const forbiddenResponse = (res, message = "Forbidden") => {
    return errorResponse(res, 403, message);
};

/**
 * Response untuk conflict (duplicate data)
 * @param {Object} res - Express response object
 * @param {string} message - Conflict message
 */
export const conflictResponse = (res, message = "Data already exists") => {
    return errorResponse(res, 409, message);
}; 